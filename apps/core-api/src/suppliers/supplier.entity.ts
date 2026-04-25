import { Entity, Column } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('suppliers')
export class Supplier extends TenantScopedEntity {
  @Column()
  name: string;

  @Column({ name: 'gst_number', nullable: true })
  gstNumber: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'jsonb', nullable: true })
  address: {
    line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };

  @Column({ name: 'payment_terms', default: 30 })
  paymentTerms: number; // days

  @Column({ name: 'credit_limit', type: 'decimal', precision: 12, scale: 2, nullable: true })
  creditLimit: number;

  @Column({ name: 'custom_fields', type: 'jsonb', default: '{}' })
  customFields: Record<string, unknown>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

@Entity('purchase_orders')
export class PurchaseOrder extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @Column({ name: 'po_number' })
  poNumber: string;

  @Column({ default: 'draft' })
  status: string; // draft | sent | received | cancelled

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: Date;

  @Column({ nullable: true })
  notes: string;
}

@Entity('purchase_order_items')
export class PurchaseOrderItem extends TenantScopedEntity {
  @Column({ name: 'purchase_order_id', type: 'uuid' })
  purchaseOrderId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantity: number;

  @Column({ name: 'received_qty', type: 'decimal', precision: 10, scale: 3, default: 0 })
  receivedQty: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'gst_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  gstRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;
}
