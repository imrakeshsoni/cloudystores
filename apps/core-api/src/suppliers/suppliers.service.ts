import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { paginatedResponse, parsePagination } from '@shoposphere/common';
import { Inventory } from '../inventory/inventory.entity';
import { Product } from '../products/product.entity';
import { PurchaseOrder, PurchaseOrderItem, Supplier } from './supplier.entity';
import { CreatePurchaseOrderDto, CreateSupplierDto, ReceivePurchaseOrderDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepo: Repository<PurchaseOrderItem>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    private readonly dataSource: DataSource,
  ) {}

  async create(tenantId: string, dto: CreateSupplierDto): Promise<Supplier> {
    return this.repo.save(this.repo.create({ ...dto, tenantId }));
  }

  async findAll(
    tenantId: string,
    query: { page?: number; perPage?: number; search?: string },
  ) {
    const { skip, take, page, perPage } = parsePagination(query);
    const qb = this.repo.createQueryBuilder('s').where('s.tenant_id = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere('(s.name ILIKE :s OR s.phone ILIKE :s OR s.email ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    const [data, total] = await qb
      .orderBy('s.name', 'ASC')
      .skip(skip)
      .take(take)
      .getManyAndCount();

    return paginatedResponse(data, total, page, perPage);
  }

  async findOne(tenantId: string, id: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({ where: { tenantId, id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const purchases = await this.dataSource.query(
      `SELECT id, po_number, status, total, notes, created_at
       FROM purchase_orders
       WHERE tenant_id = $1 AND supplier_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenantId, id],
    );

    const ledger = await this.dataSource.query(
      `SELECT
         po.id,
         po.po_number,
         po.status,
         po.total,
         po.created_at,
         CASE
           WHEN po.status = 'received' THEN 'debit'
           WHEN po.status = 'cancelled' THEN 'reversed'
           ELSE 'open'
         END AS entry_type
       FROM purchase_orders po
       WHERE po.tenant_id = $1
         AND po.supplier_id = $2
       ORDER BY po.created_at DESC
       LIMIT 100`,
      [tenantId, id],
    );

    return {
      ...supplier,
      purchases,
      ledger,
    } as any;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(tenantId, id);
    Object.assign(supplier, dto);
    return this.repo.save(supplier);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const supplier = await this.findOne(tenantId, id);
    supplier.isActive = false;
    await this.repo.save(supplier);
  }

  async createPurchaseOrder(
    tenantId: string,
    userId: string | undefined,
    dto: CreatePurchaseOrderDto,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('Add at least one purchase item');
    }

    await this.findOne(tenantId, dto.supplierId);

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this.productRepo.find({
      where: productIds.map((id) => ({ tenantId, id, isActive: true })),
    });
    const productMap = new Map(products.map((product) => [product.id, product]));

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more selected products are not available');
    }

    const subtotal = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const taxAmount = dto.items.reduce(
      (sum, item) => sum + (item.quantity * item.unitPrice * Number(item.gstRate ?? 0)) / 100,
      0,
    );
    const total = subtotal + taxAmount;

    return this.dataSource.transaction(async (manager) => {
      const purchaseOrder = await manager.save(
        PurchaseOrder,
        {
          tenantId,
          shopId: dto.shopId,
          supplierId: dto.supplierId,
          poNumber: dto.poNumber?.trim() || `PO-${Date.now()}`,
          status: dto.status ?? 'draft',
          subtotal,
          taxAmount,
          total,
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          notes: dto.notes?.trim() || null,
        } as any,
      );

      for (const item of dto.items) {
        const gstRate = Number(item.gstRate ?? 0);
        await manager.save(
          PurchaseOrderItem,
          manager.create(PurchaseOrderItem, {
            tenantId,
            purchaseOrderId: purchaseOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            receivedQty: dto.status === 'draft' ? 0 : item.quantity,
            unitPrice: item.unitPrice,
            gstRate,
            total: item.quantity * item.unitPrice + (item.quantity * item.unitPrice * gstRate) / 100,
          }),
        );

        if (dto.status !== 'draft') {
          await this.receiveIntoInventory(manager, tenantId, dto.shopId, item, purchaseOrder.id, userId);
        }
      }

      return {
        ...purchaseOrder,
        items: dto.items.map((item) => ({
          ...item,
          productName: productMap.get(item.productId)?.name ?? 'Product',
        })),
      };
    });
  }

  async findPurchaseOrders(tenantId: string, shopId: string, query: { page?: number; perPage?: number }) {
    const { skip, take, page, perPage } = parsePagination(query);
    const [data, total] = await this.purchaseOrderRepo.findAndCount({
      where: { tenantId, shopId },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    const purchaseOrderIds = data.map((purchaseOrder) => purchaseOrder.id);
    const items = purchaseOrderIds.length > 0
      ? await this.purchaseOrderItemRepo.find({
          where: purchaseOrderIds.map((purchaseOrderId) => ({ tenantId, purchaseOrderId })),
        })
      : [];
    const itemsByPurchaseOrderId = new Map<string, PurchaseOrderItem[]>();
    items.forEach((item) => {
      const existing = itemsByPurchaseOrderId.get(item.purchaseOrderId) ?? [];
      existing.push(item);
      itemsByPurchaseOrderId.set(item.purchaseOrderId, existing);
    });

    return paginatedResponse(
      data.map((purchaseOrder) => ({
        ...purchaseOrder,
        items: itemsByPurchaseOrderId.get(purchaseOrder.id) ?? [],
      })),
      total,
      page,
      perPage,
    );
  }

  async receivePurchaseOrder(
    tenantId: string,
    userId: string | undefined,
    dto: ReceivePurchaseOrderDto,
  ) {
    const purchaseOrder = await this.purchaseOrderRepo.findOne({
      where: { tenantId, id: dto.purchaseOrderId, shopId: dto.shopId },
    });
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }

    const purchaseOrderItems = await this.purchaseOrderItemRepo.find({
      where: { tenantId, purchaseOrderId: dto.purchaseOrderId },
    });
    const itemMap = new Map(purchaseOrderItems.map((item) => [item.id, item]));

    return this.dataSource.transaction(async (manager) => {
      let fullyReceived = true;

      for (const entry of dto.items) {
        const purchaseOrderItem = itemMap.get(entry.purchaseOrderItemId);
        if (!purchaseOrderItem) {
          throw new BadRequestException('One or more purchase items no longer exist');
        }

        const requestedQty = Number(entry.quantity ?? 0);
        const remainingQty = Number(purchaseOrderItem.quantity) - Number(purchaseOrderItem.receivedQty ?? 0);
        if (requestedQty <= 0 || requestedQty > remainingQty) {
          throw new BadRequestException('Received quantity exceeds the remaining PO quantity');
        }

        await this.receiveIntoInventory(
          manager,
          tenantId,
          dto.shopId,
          {
            productId: purchaseOrderItem.productId,
            quantity: requestedQty,
            unitPrice: Number(purchaseOrderItem.unitPrice ?? 0),
            gstRate: Number(purchaseOrderItem.gstRate ?? 0),
            batchNo: entry.batchNo,
            manufactureDate: entry.manufactureDate,
            expiryDate: entry.expiryDate,
          },
          purchaseOrder.id,
          userId,
        );

        purchaseOrderItem.receivedQty = Number((Number(purchaseOrderItem.receivedQty ?? 0) + requestedQty).toFixed(3)) as any;
        await manager.save(PurchaseOrderItem, purchaseOrderItem);
      }

      const refreshedItems = await manager.find(PurchaseOrderItem, {
        where: { tenantId, purchaseOrderId: purchaseOrder.id },
      });
      fullyReceived = refreshedItems.every((item) => Number(item.receivedQty ?? 0) >= Number(item.quantity ?? 0));

      purchaseOrder.status = fullyReceived ? ('received' as any) : ('sent' as any);
      await manager.save(PurchaseOrder, purchaseOrder);

      return {
        purchaseOrderId: purchaseOrder.id,
        status: purchaseOrder.status,
        fullyReceived,
      };
    });
  }

  async settleSupplierPayment(
    tenantId: string,
    supplierId: string,
    amount: number,
    notes?: string,
  ) {
    await this.findOne(tenantId, supplierId);

    const openPurchaseOrders = await this.dataSource.query(
      `SELECT id, status, total, notes
       FROM purchase_orders
       WHERE tenant_id = $1
         AND supplier_id = $2
         AND status IN ('received', 'sent')
       ORDER BY created_at ASC`,
      [tenantId, supplierId],
    );

    let remaining = Number(amount);
    if (remaining <= 0) {
      throw new BadRequestException('Settlement amount must be greater than 0');
    }

    const applied: Array<{ purchaseOrderId: string; appliedAmount: number }> = [];

    for (const row of openPurchaseOrders) {
      if (remaining <= 0) break;

      const metadata = this.extractSettlementMetadata(row.notes);
      const total = Number(row.total ?? 0);
      const settled = Number(metadata.settledAmount ?? 0);
      const outstanding = Math.max(0, total - settled);
      if (outstanding <= 0) continue;

      const appliedAmount = Math.min(outstanding, remaining);
      remaining -= appliedAmount;
      applied.push({ purchaseOrderId: row.id, appliedAmount });

      const nextSettled = Number((settled + appliedAmount).toFixed(2));
      const nextStatus = nextSettled >= total ? 'received' : row.status;

      await this.dataSource.query(
        `UPDATE purchase_orders
         SET status = $1,
             notes = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [
          nextStatus,
          this.buildSettlementNote(row.notes, nextSettled, notes),
          row.id,
        ],
      );
    }

    if (applied.length === 0) {
      throw new BadRequestException('No open supplier balance found to settle');
    }

    return {
      supplierId,
      settledAmount: Number((amount - remaining).toFixed(2)),
      unappliedAmount: Number(remaining.toFixed(2)),
      applied,
    };
  }

  private async receiveIntoInventory(
    manager: any,
    tenantId: string,
    shopId: string,
    item: CreatePurchaseOrderDto['items'][number],
    purchaseOrderId: string,
    userId: string | undefined,
  ) {
    const inventory = await manager.findOne(Inventory, {
      where: { tenantId, shopId, productId: item.productId },
    });
    const currentQty = Number(inventory?.quantity ?? 0);
    const currentBatches = Array.isArray(inventory?.batchDetails) ? inventory.batchDetails : [];
    const batchNo = item.batchNo?.trim() || `PO-${Date.now()}`;
    const manufactureDate = item.manufactureDate || undefined;
    const expiryDate = item.expiryDate || '';
    const nextBatches = currentBatches.map((batch: any) => ({ ...batch, quantity: Number(batch.quantity ?? 0) }));

    const existingBatch = nextBatches.find(
      (batch: any) =>
        (batch.batchNo ?? '') === batchNo &&
        (batch.manufactureDate ?? '') === (manufactureDate ?? '') &&
        (batch.expiry ?? '') === expiryDate,
    );
    if (existingBatch) {
      existingBatch.quantity = Number(existingBatch.quantity ?? 0) + item.quantity;
    } else {
      nextBatches.push({
        batchNo,
        manufactureDate,
        expiry: expiryDate,
        quantity: item.quantity,
        purchasePrice: item.unitPrice,
      });
    }

    await manager.query(
      `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity, batch_details)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (tenant_id, shop_id, product_id)
       DO UPDATE SET quantity = $4,
                     batch_details = $5::jsonb,
                     updated_at = NOW()`,
      [tenantId, shopId, item.productId, currentQty + item.quantity, JSON.stringify(nextBatches)],
    );

    await manager.query(
      `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
       VALUES ($1, $2, $3, 'purchase', $4, $5, 'purchase_order', $6, $7)`,
      [
        tenantId,
        shopId,
        item.productId,
        item.quantity,
        purchaseOrderId,
        [batchNo ? `Batch: ${batchNo}` : null, expiryDate ? `Exp: ${expiryDate}` : null]
          .filter(Boolean)
          .join(' | ') || null,
        userId ?? null,
      ],
    );
  }

  private extractSettlementMetadata(notes: string | null | undefined) {
    const match = String(notes ?? '').match(/\[settled:([0-9.]+)\]/);
    return {
      settledAmount: match ? Number(match[1]) : 0,
    };
  }

  private buildSettlementNote(existingNotes: string | null | undefined, settledAmount: number, paymentNotes?: string) {
    const cleaned = String(existingNotes ?? '').replace(/\s*\[settled:[0-9.]+\]\s*/g, '').trim();
    const parts = [cleaned, paymentNotes?.trim()].filter(Boolean);
    return `${parts.join(' | ')} [settled:${settledAmount.toFixed(2)}]`.trim();
  }
}
