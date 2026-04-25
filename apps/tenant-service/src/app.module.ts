import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule, EventBusService } from '@shoposphere/common';
import { OnboardingController } from './onboarding/onboarding.controller';
import { OnboardingService } from './onboarding/onboarding.service';
import { BillingController } from './subscriptions/billing.controller';
import { Tenant } from './tenants/tenant.entity';
import { SubscriptionPlan, TenantSubscription } from './subscriptions/subscription.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),
    DatabaseModule.forRoot([Tenant, SubscriptionPlan, TenantSubscription]),
    TypeOrmModule.forFeature([Tenant, SubscriptionPlan, TenantSubscription]),
  ],
  providers: [OnboardingService, EventBusService],
  controllers: [OnboardingController, BillingController],
})
export class AppModule {}
