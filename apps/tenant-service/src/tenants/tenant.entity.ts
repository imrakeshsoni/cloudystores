import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@shoposphere/common';

@Entity('tenants')
export class Tenant extends BaseEntity {
  @Column()
  name: string;

  @Column({ unique: true })
  @Index()
  slug: string;

  @Column({ default: 'starter' })
  plan: string;

  @Column({ default: 'active' })
  status: string; // active | suspended | churned

  @Column({ type: 'jsonb', default: '{}' })
  settings: {
    gstNumber?: string;
    state?: string;
    currency?: string;
    timezone?: string;
    shopType?: string;
  };

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;
}
