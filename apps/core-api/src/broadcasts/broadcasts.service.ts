import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginatedResponse, parsePagination } from '@shoposphere/common';
import { Broadcast } from './broadcast.entity';
import { BroadcastQueryDto, CreateBroadcastDto, SendInvoiceWhatsappDto } from './dto/broadcast.dto';
import { Customer } from '../customers/customer.entity';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class BroadcastsService {
  constructor(
    @InjectRepository(Broadcast)
    private readonly repo: Repository<Broadcast>,
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  async create(
    tenantId: string,
    shopId: string | undefined,
    userId: string | undefined,
    dto: CreateBroadcastDto,
  ) {
    const targetCustomerCount = await this.customersRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.phone IS NOT NULL')
      .andWhere(`NULLIF(TRIM(c.phone), '') IS NOT NULL`)
      .getCount();

    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    const status = scheduledFor ? 'scheduled' : 'sent';
    const targetCustomers = await this.customersRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.phone IS NOT NULL')
      .andWhere(`NULLIF(TRIM(c.phone), '') IS NOT NULL`)
      .select(['c.id AS id', 'c.phone AS phone', 'c.name AS name'])
      .getRawMany();

    if (targetCustomers.length === 0) {
      throw new BadRequestException('No customers with phone numbers are available for broadcast');
    }

    let deliveredCount = 0;
    let failedCount = 0;
    const deliveryErrors: string[] = [];
    const broadcastTemplateName = process.env.WHATSAPP_BROADCAST_TEMPLATE_NAME ?? process.env.WHATSAPP_DEFAULT_TEMPLATE_NAME ?? 'hello_world';
    const broadcastTemplateLanguage = process.env.WHATSAPP_BROADCAST_TEMPLATE_LANGUAGE ?? process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US';
    const broadcastTemplateParams = this.pickTemplateParams(
      process.env.WHATSAPP_BROADCAST_TEMPLATE_BODY_PARAM_COUNT,
      [dto.message.trim()],
    );

    if (!scheduledFor) {
      for (const customer of targetCustomers) {
        const textResult = await this.whatsAppService.sendTextMessage(
          customer.phone,
          dto.message.trim(),
        );

        if (textResult.success) {
          deliveredCount += 1;
        } else {
          const result = await this.whatsAppService.sendTemplateMessage(
            customer.phone,
            broadcastTemplateName,
            broadcastTemplateLanguage,
            broadcastTemplateParams,
          );

          if (result.success) {
            deliveredCount += 1;
            if (textResult.error) {
              deliveryErrors.push(`${customer.phone}: sent via template fallback because text failed: ${textResult.error}`);
            }
          } else {
            failedCount += 1;
            if (result.error || textResult.error) {
              deliveryErrors.push(
                `${customer.phone}: ${textResult.error ?? 'Text failed'}${result.error ? ` | fallback: ${result.error}` : ''}`,
              );
            }
          }
        }
      }

      if (deliveredCount === 0) {
        throw new BadRequestException(
          deliveryErrors[0] ?? 'Broadcast could not be delivered to any customer',
        );
      }
    }

    const broadcast = this.repo.create({
      tenantId,
      shopId: shopId ?? null,
      message: dto.message.trim(),
      status,
      scheduledFor,
      targetCustomerCount,
      createdByUserId: userId ?? null,
      deliveryMode: scheduledFor ? 'scheduled_whatsapp' : 'whatsapp_cloud_api',
      metadata: {
        sendingImplemented: true,
        deliveredCount,
        failedCount,
        recipientPreview: targetCustomers.slice(0, 5).map((customer) => ({
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
        })),
        deliveryErrors: deliveryErrors.slice(0, 10),
      },
    });

    return this.repo.save(broadcast);
  }

  async sendInvoiceToWhatsApp(dto: SendInvoiceWhatsappDto) {
    const message = dto.message?.trim() ?? '';
    if (!message) {
      throw new BadRequestException('Invoice message is required');
    }

    if (!dto.imageDataUrl?.trim()) {
      throw new BadRequestException('Invoice image is required');
    }

    const parsedImage = parseDataUrl(dto.imageDataUrl);
    if (!parsedImage) {
      throw new BadRequestException('Invoice image format is invalid');
    }

    const uploadResult = await this.whatsAppService.uploadMedia(
      parsedImage.buffer,
      dto.mimeType?.trim() || parsedImage.mimeType,
      dto.fileName?.trim() || 'invoice.png',
    );

    if (!uploadResult.success || !uploadResult.mediaId) {
      throw new BadRequestException(uploadResult.error ?? 'Unable to upload invoice image to WhatsApp');
    }

    const directSendResult = await this.whatsAppService.sendImageMessage(
      dto.phone,
      uploadResult.mediaId,
      message,
    );

    if (directSendResult.success) {
      return {
        delivered: true,
        provider: 'whatsapp_cloud_api',
        mode: 'image',
        response: directSendResult.data,
      };
    }

    const invoiceTemplateName = process.env.WHATSAPP_INVOICE_TEMPLATE_NAME ?? process.env.WHATSAPP_DEFAULT_TEMPLATE_NAME ?? 'hello_world';
    const invoiceTemplateLanguage = process.env.WHATSAPP_INVOICE_TEMPLATE_LANGUAGE ?? process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US';
    const invoiceTemplateParams = this.pickTemplateParams(
      process.env.WHATSAPP_INVOICE_TEMPLATE_BODY_PARAM_COUNT,
      message.split('\n').filter(Boolean),
    );

    const fallbackResult = await this.whatsAppService.sendTemplateMessage(
      dto.phone,
      invoiceTemplateName,
      invoiceTemplateLanguage,
      invoiceTemplateParams,
    );

    if (!fallbackResult.success) {
      throw new BadRequestException(
        directSendResult.error ?? fallbackResult.error ?? 'Unable to send invoice to WhatsApp',
      );
    }

    return {
      delivered: true,
      provider: 'whatsapp_cloud_api',
      mode: 'template_fallback',
      response: fallbackResult.data,
      warning: directSendResult.error ?? 'Invoice image could not be delivered, template fallback sent instead.',
    };
  }

  private pickTemplateParams(
    rawCount: string | undefined,
    values: string[],
  ): string[] {
    const count = Number(rawCount ?? 0);
    if (!Number.isFinite(count) || count <= 0) {
      return [];
    }

    return values.slice(0, count);
  }

  async findAll(tenantId: string, shopId: string | undefined, query: BroadcastQueryDto) {
    const { skip, take, page, perPage } = parsePagination(query);
    const qb = this.repo.createQueryBuilder('b').where('b.tenant_id = :tenantId', { tenantId });

    if (shopId) {
      qb.andWhere('(b.shop_id = :shopId OR b.shop_id IS NULL)', { shopId });
    }

    if (query.status) {
      qb.andWhere('b.status = :status', { status: query.status });
    }

    const [data, total] = await qb
      .orderBy('b.created_at', 'DESC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginatedResponse(data, total, page, perPage);
  }
}

function parseDataUrl(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = value.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1],
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}
