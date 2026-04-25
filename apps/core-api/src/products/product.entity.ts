import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('products')
@Index(['tenantId', 'sku'], { unique: true, where: 'sku IS NOT NULL' })
@Index(['tenantId', 'barcode'])
export class Product extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid', nullable: true })
  shopId: string | null;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @Column()
  name: string;

  @Column({ nullable: true })
  sku: string;

  @Column({ nullable: true })
  barcode: string;

  @Column({ name: 'hsn_code', nullable: true })
  hsnCode: string;

  @Column({ nullable: true })
  unit: string; // kg | litre | piece | strip | box

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  mrp: number;

  @Column({ name: 'selling_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  sellingPrice: number;

  @Column({ name: 'purchase_price', type: 'decimal', precision: 10, scale: 2, nullable: true })
  purchasePrice: number;

  @Column({ name: 'gst_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  gstRate: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  images: string[];

  @Column({ type: 'jsonb', default: '{}' })
  attributes: Record<string, unknown>; // brand, expiry, batch details

  @Column({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields: Record<string, unknown>;
}
