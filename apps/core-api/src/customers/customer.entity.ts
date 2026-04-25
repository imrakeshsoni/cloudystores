import { Entity, Column, Index } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('customers')
@Index(['tenantId', 'phone'], { unique: true, where: 'phone IS NOT NULL' })
export class Customer extends TenantScopedEntity {
  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ name: 'loyalty_points', default: 0 })
  loyaltyPoints: number;

  @Column({ name: 'credit_balance', type: 'decimal', precision: 10, scale: 2, default: 0 })
  creditBalance: number;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields: Record<string, unknown>;
}
