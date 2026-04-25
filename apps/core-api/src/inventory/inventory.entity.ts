import { Entity, Column, Index, Unique } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('inventory')
@Unique(['tenantId', 'shopId', 'productId'])
export class Inventory extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  quantity: number;

  @Column({ name: 'reserved_qty', type: 'decimal', precision: 10, scale: 3, default: 0 })
  reservedQty: number;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 10, scale: 3, default: 0 })
  reorderLevel: number;

  @Column({ name: 'reorder_qty', type: 'decimal', precision: 10, scale: 3, default: 0 })
  reorderQty: number;

  @Column({ nullable: true })
  location: string;

  @Column({ name: 'batch_details', type: 'jsonb', default: '[]' })
  batchDetails: Array<{
    batchNo: string;
    manufactureDate?: string;
    expiry: string;
    quantity: number;
    purchasePrice?: number;
  }>;
}

@Entity('stock_movements')
@Index(['tenantId', 'productId', 'createdAt'])
export class StockMovement extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column()
  type: string; // sale | purchase | return | adjustment | transfer

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantity: number; // positive = in, negative = out

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true })
  referenceType: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;
}
