import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import { DataSource } from 'typeorm';
import { EventBusService } from '@shoposphere/common';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBusService,
  ) {}

  @Post('webhook/razorpay')
  @HttpCode(HttpStatus.OK)
  async razorpayWebhook(
    @Body() body: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    // Verify Razorpay signature
    const expected = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(JSON.stringify(body))
      .digest('hex');

    if (signature !== expected) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const tenantId: string = body.payload?.subscription?.entity?.notes?.tenant_id;

    switch (body.event) {
      case 'subscription.activated':
      case 'subscription.charged':
        await this.dataSource.query(
          `UPDATE tenant_subscriptions
           SET status = 'active',
               current_period_start = NOW(),
               current_period_end = NOW() + INTERVAL '1 month'
           WHERE razorpay_sub_id = $1`,
          [body.payload.subscription.entity.id],
        );
        break;

      case 'subscription.halted':
      case 'subscription.cancelled':
        await this.dataSource.query(
          `UPDATE tenant_subscriptions SET status = 'cancelled'
           WHERE razorpay_sub_id = $1`,
          [body.payload.subscription.entity.id],
        );
        if (tenantId) {
          await this.dataSource.query(
            `UPDATE tenants SET status = 'suspended' WHERE id = $1`,
            [tenantId],
          );
          await this.eventBus.publish('tenant.suspended', tenantId, { reason: body.event });
        }
        break;

      case 'payment.failed':
        this.logger.warn(`Payment failed for tenant ${tenantId}`);
        if (tenantId) {
          await this.eventBus.publish('billing.payment_failed', tenantId, {
            subscriptionId: body.payload.subscription?.entity?.id,
          });
        }
        break;
    }

    return { received: true };
  }
}
