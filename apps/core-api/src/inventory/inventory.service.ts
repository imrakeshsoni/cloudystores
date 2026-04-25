import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Inventory, StockMovement } from './inventory.entity';
import { InsufficientStockException, paginatedResponse, parsePagination } from '@shoposphere/common';
import { Product } from '../products/product.entity';
import { Supplier } from '../suppliers/supplier.entity';

export interface StockAdjustmentDto {
  shopId: string;
  productId: string;
  quantity: number;  // positive=in, negative=out
  type: 'sale' | 'purchase' | 'return' | 'adjustment' | 'transfer';
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy?: string;
  batchNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  supplierId?: string;
  movementDate?: string;
  challanNumber?: string;
  invoiceNumber?: string;
}

type InventoryBatch = Inventory['batchDetails'][number];
interface InventoryImportRow {
  productName: string;
  sku?: string;
  barcode?: string;
  unit?: string;
  mrp?: number;
  sellingPrice?: number;
  purchasePrice?: number;
  gstRate?: number;
  lowStockQuantity?: number;
  totalUnits?: number;
  looseSellingPrice?: number;
  nrx?: boolean;
  quantity: number;
  batchNo?: string;
  manufactureDate?: string;
  expiryDate?: string;
  supplierName?: string;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(Inventory)
    private readonly invRepo: Repository<Inventory>,
    @InjectRepository(StockMovement)
    private readonly movRepo: Repository<StockMovement>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    private readonly dataSource: DataSource,
  ) {}

  async getStock(tenantId: string, shopId: string, productId: string): Promise<Inventory | null> {
    return this.invRepo.findOne({ where: { tenantId, shopId, productId } });
  }

  async getStockLevel(tenantId: string, shopId: string, productId: string): Promise<number> {
    const inv = await this.getStock(tenantId, shopId, productId);
    return Number(inv?.quantity ?? 0);
  }

  // Atomic stock deduction (used during order creation)
  async deductStock(
    tenantId: string,
    shopId: string,
    productId: string,
    qty: number,
    orderId: string,
    createdBy: string,
  ): Promise<void> {
    // Use a DB-level atomic update to prevent race conditions
    const result = await this.dataSource.query(
      `UPDATE inventory
       SET quantity = quantity - $1
       WHERE tenant_id = $2 AND shop_id = $3 AND product_id = $4
         AND quantity >= $1
       RETURNING quantity`,
      [qty, tenantId, shopId, productId],
    );

    if (result[0].length === 0) {
      // Get current stock for error message
      const current = await this.getStockLevel(tenantId, shopId, productId);
      throw new InsufficientStockException(productId, current, qty);
    }

    await this.recordMovement({
      shopId, productId, quantity: -qty,
      type: 'sale', referenceId: orderId, referenceType: 'order',
      notes: `Sold via order`, createdBy,
    }, tenantId);
  }

  async addStock(
    tenantId: string,
    dto: StockAdjustmentDto,
  ): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      // Upsert inventory record
      await manager.query(
        `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, shop_id, product_id)
         DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity,
                       updated_at = NOW()`,
        [tenantId, dto.shopId, dto.productId, Math.abs(dto.quantity)],
      );

      await this.recordMovement({ ...dto, quantity: Math.abs(dto.quantity) }, tenantId);

      const inv = await this.invRepo.findOne({
        where: { tenantId, shopId: dto.shopId, productId: dto.productId },
      });
      return inv!;
    });
  }

  async adjustStock(tenantId: string, dto: StockAdjustmentDto, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.adjustStockWithManager(manager, tenantId, dto, userId);
    });
  }

  async importInventory(
    tenantId: string,
    shopId: string,
    userId: string,
    rows: InventoryImportRow[],
  ): Promise<{ imported: number; createdProducts: number }> {
    let imported = 0;
    let createdProducts = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const row of rows) {
        const quantity = Number(row.quantity ?? 0);
        if (!row.productName?.trim() || quantity <= 0) {
          continue;
        }

        const product = await this.resolveOrCreateProduct(manager, tenantId, shopId, row);
        if (product.wasCreated) {
          createdProducts += 1;
        }

        let supplierId: string | undefined;
        if (row.supplierName?.trim()) {
          const supplier = await manager.findOne(Supplier, {
            where: { tenantId, name: row.supplierName.trim(), isActive: true },
          });
          supplierId = supplier?.id;
        }

        await this.adjustStockWithManager(
          manager,
          tenantId,
          {
            shopId,
            productId: product.product.id,
            quantity,
            type: 'purchase',
            supplierId,
            batchNo: row.batchNo?.trim() || undefined,
            manufactureDate: row.manufactureDate || undefined,
            expiryDate: row.expiryDate || undefined,
            notes: 'Imported opening stock',
          },
          userId,
        );
        imported += 1;
      }
    });

    return { imported, createdProducts };
  }

  async getLowStockAlerts(tenantId: string, shopId: string) {
    return this.dataSource.query(
      `SELECT
         i.*,
         p.name as product_name,
         p.sku,
         p.unit,
         COALESCE(NULLIF(p.attributes->>'lowStockQuantity', '')::decimal, i.reorder_level, 0) as low_stock_quantity
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.tenant_id = $1
         AND i.shop_id = $2
         AND p.is_active = true
         AND COALESCE(NULLIF(p.attributes->>'lowStockQuantity', '')::decimal, i.reorder_level, 0) > 0
         AND i.quantity <= COALESCE(NULLIF(p.attributes->>'lowStockQuantity', '')::decimal, i.reorder_level, 0)
       ORDER BY (
         i.quantity / NULLIF(COALESCE(NULLIF(p.attributes->>'lowStockQuantity', '')::decimal, i.reorder_level, 0), 0)
       ) ASC`,
      [tenantId, shopId],
    );
  }

  async getExpiryAlerts(tenantId: string, shopId: string, days = 90) {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 90;
    const rows = await this.dataSource.query(
      `SELECT
         i.id,
         i.product_id,
         p.name AS product_name,
         p.sku,
         p.unit,
         batch->>'batchNo' AS batch_no,
         batch->>'manufactureDate' AS manufacture_date,
         batch->>'expiry' AS expiry_date,
         COALESCE(NULLIF(batch->>'quantity', '')::decimal, 0) AS batch_quantity
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(i.batch_details, '[]'::jsonb)) AS batch
       WHERE i.tenant_id = $1
         AND i.shop_id = $2
         AND p.is_active = true
         AND NULLIF(batch->>'expiry', '') IS NOT NULL
         AND (batch->>'expiry')::date <= CURRENT_DATE + ($3 || ' days')::interval
       ORDER BY (batch->>'expiry')::date ASC, p.name ASC`,
      [tenantId, shopId, safeDays],
    );

    return rows.map((row: any) => ({
      ...row,
      daysLeft: Math.ceil(
        (new Date(`${row.expiry_date}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    }));
  }

  async finalizeStockAudit(
    tenantId: string,
    shopId: string,
    userId: string,
    rows: Array<{
      productId: string;
      expectedQuantity: number;
      actualQuantity: number;
      batchNo?: string;
      manufactureDate?: string;
      expiryDate?: string;
    }>,
  ) {
    const adjustedRows: Array<{
      productId: string;
      variance: number;
      batchNo?: string;
      manufactureDate?: string;
      expiryDate?: string;
    }> = [];

    await this.dataSource.transaction(async (manager) => {
      for (const row of rows) {
        const expectedQuantity = Number(row.expectedQuantity ?? 0);
        const actualQuantity = Number(row.actualQuantity ?? 0);
        const variance = Number((actualQuantity - expectedQuantity).toFixed(3));

        if (!row.productId || variance === 0) {
          continue;
        }

        await this.adjustStockWithManager(
          manager,
          tenantId,
          {
            shopId,
            productId: row.productId,
            quantity: variance,
            type: 'adjustment',
            batchNo: row.batchNo || undefined,
            manufactureDate: row.manufactureDate || undefined,
            expiryDate: row.expiryDate || undefined,
            notes: `Stock audit adjustment (expected ${expectedQuantity}, actual ${actualQuantity})`,
          },
          userId,
        );

        adjustedRows.push({
          productId: row.productId,
          variance,
          batchNo: row.batchNo || undefined,
          manufactureDate: row.manufactureDate || undefined,
          expiryDate: row.expiryDate || undefined,
        });
      }
    });

    return {
      adjusted: adjustedRows.length,
      increased: adjustedRows.filter((row) => row.variance > 0).length,
      decreased: adjustedRows.filter((row) => row.variance < 0).length,
      rows: adjustedRows,
    };
  }

  async returnExpiredStock(
    tenantId: string,
    shopId: string,
    userId: string,
    dto: {
      productId: string;
      quantity: number;
      batchNo?: string;
      manufactureDate?: string;
      expiryDate?: string;
      supplierId?: string;
      notes?: string;
    },
  ) {
    const quantity = Number(dto.quantity ?? 0);
    if (quantity <= 0) {
      throw new InsufficientStockException(dto.productId, 0, quantity);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.adjustStockWithManager(
        manager,
        tenantId,
        {
          shopId,
          productId: dto.productId,
          quantity: -quantity,
          type: 'return',
          supplierId: dto.supplierId || undefined,
          batchNo: dto.batchNo || undefined,
          manufactureDate: dto.manufactureDate || undefined,
          expiryDate: dto.expiryDate || undefined,
          notes: dto.notes?.trim() || 'Expired stock returned to supplier',
          referenceType: dto.supplierId ? 'supplier_return' : 'expired_return',
        },
        userId,
      );
    });

    return {
      productId: dto.productId,
      quantity,
      batchNo: dto.batchNo || null,
      expiryDate: dto.expiryDate || null,
    };
  }

  async transferStock(
    tenantId: string,
    userId: string,
    dto: {
      fromShopId: string;
      toShopId: string;
      productId: string;
      quantity: number;
      batchNo?: string;
      manufactureDate?: string;
      expiryDate?: string;
      notes?: string;
    },
  ) {
    const quantity = Number(dto.quantity ?? 0);
    if (quantity <= 0) {
      throw new InsufficientStockException(dto.productId, 0, quantity);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.adjustStockWithManager(
        manager,
        tenantId,
        {
          shopId: dto.fromShopId,
          productId: dto.productId,
          quantity: -quantity,
          type: 'transfer',
          batchNo: dto.batchNo,
          manufactureDate: dto.manufactureDate,
          expiryDate: dto.expiryDate,
          notes: dto.notes?.trim() || `Transferred to shop ${dto.toShopId}`,
          referenceType: 'shop_transfer_out',
          referenceId: dto.toShopId,
        },
        userId,
      );

      await this.adjustStockWithManager(
        manager,
        tenantId,
        {
          shopId: dto.toShopId,
          productId: dto.productId,
          quantity,
          type: 'transfer',
          batchNo: dto.batchNo,
          manufactureDate: dto.manufactureDate,
          expiryDate: dto.expiryDate,
          notes: dto.notes?.trim() || `Transferred from shop ${dto.fromShopId}`,
          referenceType: 'shop_transfer_in',
          referenceId: dto.fromShopId,
        },
        userId,
      );
    });

    return {
      productId: dto.productId,
      quantity,
      fromShopId: dto.fromShopId,
      toShopId: dto.toShopId,
    };
  }

  async getStockList(
    tenantId: string,
    shopId: string,
    query: { page?: number; perPage?: number },
  ) {
    const { skip, take, page, perPage } = parsePagination(query);

    const [data, total] = await this.dataSource.query(
      `SELECT i.*, p.name as product_name, p.sku, p.barcode, p.unit, p.mrp
       FROM inventory i
       JOIN products p ON p.id = i.product_id AND p.is_active = true
       WHERE i.tenant_id = $1 AND i.shop_id = $2
       ORDER BY p.name
       LIMIT $3 OFFSET $4`,
      [tenantId, shopId, take, skip],
    ).then(async (rows) => {
      const [count] = await this.dataSource.query(
        `SELECT COUNT(*) FROM inventory WHERE tenant_id = $1 AND shop_id = $2`,
        [tenantId, shopId],
      );
      return [rows, Number(count.count)];
    });

    return paginatedResponse(data as any[], total, page, perPage);
  }

  async getMovements(
    tenantId: string,
    shopId: string,
    productId: string,
    query: { page?: number; perPage?: number },
  ) {
    const { skip, take, page, perPage } = parsePagination(query);
    const [data, total] = await this.movRepo.findAndCount({
      where: { tenantId, shopId, productId },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return paginatedResponse(data, total, page, perPage);
  }

  private async recordMovement(dto: Omit<StockAdjustmentDto, 'shopId'> & { shopId: string }, tenantId: string): Promise<void> {
    const noteParts = [
      dto.notes?.trim(),
      dto.movementDate ? `Date: ${dto.movementDate}` : null,
      dto.challanNumber ? `Challan: ${dto.challanNumber}` : null,
      dto.invoiceNumber ? `Invoice: ${dto.invoiceNumber}` : null,
    ].filter(Boolean);

    await this.dataSource.query(
      `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId, dto.shopId, dto.productId, dto.type,
        dto.quantity,
        dto.referenceId ?? dto.supplierId ?? null,
        dto.referenceType ?? (dto.supplierId ? 'supplier' : null),
        noteParts.length > 0 ? noteParts.join(' | ') : null,
        dto.createdBy ?? null,
      ],
    );
  }

  private applyBatchAdjustment(
    batchDetails: Inventory['batchDetails'],
    dto: StockAdjustmentDto,
  ): Inventory['batchDetails'] {
    const hasMedicalBatchFields = Boolean(dto.batchNo || dto.manufactureDate || dto.expiryDate);
    if (!hasMedicalBatchFields) {
      return batchDetails;
    }

    const normalized = batchDetails.map((batch) => ({
      ...batch,
      quantity: Number(batch.quantity ?? 0),
    }));

    if (dto.quantity > 0) {
      const existingBatch = normalized.find((batch) => this.isSameBatch(batch, dto));
      if (existingBatch) {
        existingBatch.quantity += dto.quantity;
        existingBatch.manufactureDate = dto.manufactureDate ?? existingBatch.manufactureDate;
        existingBatch.expiry = dto.expiryDate ?? existingBatch.expiry;
      } else {
        normalized.push({
          batchNo: dto.batchNo ?? `BATCH-${Date.now()}`,
          manufactureDate: dto.manufactureDate,
          expiry: dto.expiryDate ?? '',
          quantity: dto.quantity,
        });
      }
    } else {
      let quantityToRemove = Math.abs(dto.quantity);

      if (dto.batchNo) {
        const existingBatch = normalized.find((batch) => this.isSameBatch(batch, dto));
        if (!existingBatch || existingBatch.quantity < quantityToRemove) {
          throw new InsufficientStockException(dto.productId, existingBatch?.quantity ?? 0, quantityToRemove);
        }
        existingBatch.quantity -= quantityToRemove;
      } else {
        const sorted = [...normalized].sort((left, right) => {
          const leftDate = left.expiry ? new Date(left.expiry).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDate = right.expiry ? new Date(right.expiry).getTime() : Number.MAX_SAFE_INTEGER;
          return leftDate - rightDate;
        });

        for (const batch of sorted) {
          if (quantityToRemove <= 0) break;
          const removable = Math.min(batch.quantity, quantityToRemove);
          batch.quantity -= removable;
          quantityToRemove -= removable;
        }
      }
    }

    return normalized.filter((batch) => batch.quantity > 0);
  }

  private isSameBatch(batch: InventoryBatch, dto: StockAdjustmentDto): boolean {
    return (
      (batch.batchNo ?? '') === (dto.batchNo ?? '') &&
      (batch.manufactureDate ?? '') === (dto.manufactureDate ?? '') &&
      (batch.expiry ?? '') === (dto.expiryDate ?? '')
    );
  }

  private async adjustStockWithManager(
    manager: EntityManager,
    tenantId: string,
    dto: StockAdjustmentDto,
    userId: string,
  ): Promise<void> {
    const [inventoryRow] = await manager.query(
      `SELECT quantity, batch_details
       FROM inventory
       WHERE tenant_id = $1 AND shop_id = $2 AND product_id = $3
       FOR UPDATE`,
      [tenantId, dto.shopId, dto.productId],
    );

    const current = Number(inventoryRow?.quantity ?? 0);
    const newQty = current + dto.quantity;

    if (newQty < 0) {
      throw new InsufficientStockException(dto.productId, current, Math.abs(dto.quantity));
    }

    const nextBatchDetails = this.applyBatchAdjustment(
      Array.isArray(inventoryRow?.batch_details) ? inventoryRow.batch_details : [],
      dto,
    );

    await manager.query(
      `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity, batch_details)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (tenant_id, shop_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity,
                     batch_details = EXCLUDED.batch_details,
                     updated_at = NOW()`,
      [tenantId, dto.shopId, dto.productId, newQty, JSON.stringify(nextBatchDetails)],
    );

    const noteParts = [
      dto.notes?.trim(),
      dto.movementDate ? `Date: ${dto.movementDate}` : null,
      dto.challanNumber ? `Challan: ${dto.challanNumber}` : null,
      dto.invoiceNumber ? `Invoice: ${dto.invoiceNumber}` : null,
    ].filter(Boolean);

    await manager.query(
      `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        dto.shopId,
        dto.productId,
        dto.type,
        dto.quantity,
        dto.referenceId ?? dto.supplierId ?? null,
        dto.referenceType ?? (dto.supplierId ? 'supplier' : null),
        noteParts.length > 0 ? noteParts.join(' | ') : null,
        userId,
      ],
    );
  }

  private async resolveOrCreateProduct(
    manager: EntityManager,
    tenantId: string,
    shopId: string,
    row: InventoryImportRow,
  ): Promise<{ product: Product; wasCreated: boolean }> {
    const sku = row.sku?.trim();
    const barcode = row.barcode?.trim();
    const name = row.productName.trim();

    let product: Product | null = null;

    if (sku) {
      product = await manager.findOne(Product, { where: { tenantId, sku } });
    }

    if (!product && barcode) {
      product = await manager.findOne(Product, { where: { tenantId, barcode } });
    }

    if (!product) {
      product = await manager
        .createQueryBuilder(Product, 'p')
        .where('p.tenant_id = :tenantId', { tenantId })
        .andWhere('LOWER(p.name) = LOWER(:name)', { name })
        .andWhere('(p.shop_id = :shopId OR p.shop_id IS NULL)', { shopId })
        .getOne();
    }

    if (product) {
      return { product, wasCreated: false };
    }

    product = manager.create(Product, {
      tenantId,
      shopId,
      name,
      sku: sku || undefined,
      barcode: barcode || undefined,
      unit: row.unit || 'piece',
      mrp: row.mrp,
      sellingPrice: row.sellingPrice,
      purchasePrice: row.purchasePrice,
      gstRate: row.gstRate ?? 12,
      attributes: {
        ...(row.lowStockQuantity != null ? { lowStockQuantity: row.lowStockQuantity } : {}),
        ...(row.totalUnits != null ? { totalUnits: row.totalUnits } : {}),
        ...(row.looseSellingPrice != null ? { looseSellingPrice: row.looseSellingPrice } : {}),
        ...(row.nrx != null ? { nrx: row.nrx } : {}),
      },
    });

    return { product: await manager.save(Product, product), wasCreated: true };
  }
}
