import { Column, Entity, Index } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('broadcasts')
@Index(['tenantId', 'shopId', 'createdAt'])
export class Broadcast extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId?: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'sent' })
  status: string;

  @Column({ name: 'scheduled_for', type: 'timestamp with time zone', nullable: true })
  scheduledFor?: Date | null;

  @Column({ name: 'target_customer_count', type: 'int', default: 0 })
  targetCustomerCount: number;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @Column({ name: 'delivery_mode', default: 'stubbed' })
  deliveryMode: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;
}
