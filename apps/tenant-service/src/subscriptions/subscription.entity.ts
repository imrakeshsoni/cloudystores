import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@shoposphere/common';

@Entity('subscription_plans')
export class SubscriptionPlan extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2 })
  priceMonthly: number;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceYearly: number;

  @Column({ name: 'max_users', nullable: true })
  maxUsers: number;

  @Column({ name: 'max_products', nullable: true })
  maxProducts: number;

  @Column({ name: 'max_shops', default: 1 })
  maxShops: number;

  @Column({ type: 'jsonb', default: '{}' })
  features: Record<string, boolean>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'razorpay_plan_id', nullable: true })
  razorpayPlanId: string;
}

@Entity('tenant_subscriptions')
@Index(['tenantId'])
export class TenantSubscription extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ name: 'razorpay_sub_id', nullable: true })
  razorpaySubId: string;

  @Column({ default: 'active' })
  status: string; // active | past_due | cancelled | trialing

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date;
}
