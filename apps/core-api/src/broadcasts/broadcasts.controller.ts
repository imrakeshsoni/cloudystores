import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CurrentTenant, RequirePermission, TenantContext, successResponse } from '@shoposphere/common';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastQueryDto, CreateBroadcastDto, SendInvoiceWhatsappDto } from './dto/broadcast.dto';

@Controller('broadcasts')
export class BroadcastsController {
  constructor(private readonly broadcastsService: BroadcastsService) {}

  @Get()
  @RequirePermission('reports', 'read')
  async findAll(@CurrentTenant() tenant: TenantContext, @Query() query: BroadcastQueryDto) {
    return this.broadcastsService.findAll(tenant.tenantId, tenant.shopId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBroadcastDto) {
    return successResponse(
      await this.broadcastsService.create(tenant.tenantId, tenant.shopId, tenant.userId, dto),
    );
  }

  @Post('send-invoice')
  @HttpCode(HttpStatus.OK)
  async sendInvoice(@Body() dto: SendInvoiceWhatsappDto) {
    return successResponse(
      await this.broadcastsService.sendInvoiceToWhatsApp(dto),
    );
  }
}
