import { Entity, Column, Index } from 'typeorm';
import { TenantScopedEntity } from '@shoposphere/common';

@Entity('orders')
@Index(['tenantId', 'shopId', 'createdAt'])
@Index(['tenantId', 'shopId', 'billNumber'], { unique: true })
export class Order extends TenantScopedEntity {
  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @Column({ name: 'bill_number' })
  billNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ default: 'draft' })
  status: string; // draft | confirmed | paid | cancelled | returned

  @Column({ default: 'sale' })
  type: string; // sale | return | quotation

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  @Column({ name: 'payment_status', default: 'pending' })
  paymentStatus: string; // pending | partial | paid

  @Column({ nullable: true })
  notes: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>; // GST breakdown, discount codes, etc.
}

@Entity('order_items')
export class OrderItem extends TenantScopedEntity {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  discount: number;

  @Column({ name: 'gst_rate', type: 'decimal', precision: 5, scale: 2, default: 0 })
  gstRate: number;

  @Column({ name: 'gst_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  gstAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ name: 'batch_no', nullable: true })
  batchNo: string;

  @Column({ name: 'manufacture_date', type: 'date', nullable: true })
  manufactureDate: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;
}

@Entity('payments')
export class Payment extends TenantScopedEntity {
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column()
  method: string; // cash | upi | card | credit | cheque

  @Column({ nullable: true })
  reference: string; // UPI transaction ID, card last4, etc.

  @Column({ default: 'success' })
  status: string;
}

@Entity('bill_sequences')
export class BillSequence {
  @Column({ name: 'tenant_id', type: 'uuid', primary: true })
  tenantId: string;

  @Column({ name: 'shop_id', type: 'uuid', primary: true })
  shopId: string;

  @Column()
  prefix: string;

  @Column({ name: 'last_number', default: 0 })
  lastNumber: number;
}
