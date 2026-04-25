import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderItem, Payment, BillSequence } from './order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { EventBusService, paginatedResponse, parsePagination } from '@shoposphere/common';

interface OrderSummary {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  loyaltyDiscount: number;
  gstBreakdown: Record<string, { taxable: number; tax: number }>;
}

interface InventoryBatchDetail {
  batchNo: string;
  manufactureDate?: string;
  expiry?: string;
  quantity: number;
  purchasePrice?: number;
}

interface PartialReturnRequest {
  reason: string;
  refundMethod?: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
  }>;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(BillSequence) private readonly seqRepo: Repository<BillSequence>,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBusService,
  ) {}

  async create(tenantId: string, userId: string, dto: CreateOrderDto): Promise<Order> {
    return this.dataSource.transaction(async (manager) => {
      const isQuotation = dto.type === 'quotation';
      if (dto.payment?.method === 'credit' && !dto.customerId) {
        throw new BadRequestException('Customer is required for credit sale');
      }

      const requestedProductIds = [...new Set(dto.items.map((item) => item.productId).filter(Boolean))];
      const availableProducts = requestedProductIds.length
        ? await manager.query(
            `SELECT id, name
             FROM products
             WHERE tenant_id = $1
               AND id = ANY($2)
               AND is_active = true`,
            [tenantId, requestedProductIds],
          )
        : [];
      const availableProductMap = new Map(
        availableProducts.map((product: any) => [product.id, product]),
      );

      const missingProductIds = requestedProductIds.filter((id) => !availableProductMap.has(id));
      if (missingProductIds.length > 0) {
        throw new ConflictException(
          'One or more cart items are no longer available. Refresh the product list and try again.',
        );
      }

      // 1. Calculate order totals
      const summary = this.calculateSummary(dto);

      // 2. Generate bill number atomically
      const billNumber = await this.nextBillNumber(tenantId, dto.shopId);

      // 3. Save order
      const order = manager.create(Order, {
        tenantId,
        shopId: dto.shopId,
        customerId: dto.customerId ?? null,
        billNumber,
        type: dto.type ?? 'sale',
        status: isQuotation ? 'draft' : 'confirmed',
        subtotal: summary.subtotal,
        discountAmount: summary.discountAmount,
        taxAmount: summary.taxAmount,
        total: summary.total,
        paymentStatus: isQuotation ? 'pending' : dto.payment?.method === 'credit' ? 'pending' : dto.payment ? 'paid' : 'pending',
        notes: dto.notes,
        createdBy: userId,
        metadata: {
          gstBreakdown: summary.gstBreakdown,
          loyaltyPointsRedeemed: Number(dto.loyaltyPointsRedeemed ?? 0),
          loyaltyDiscount: summary.loyaltyDiscount,
        },
      });
      const savedOrder = await manager.save(Order, order);

      // 4. Save order items
      const items = dto.items.map((item) => {
        if (!availableProductMap.has(item.productId)) {
          throw new ConflictException(
            'One or more cart items are no longer available. Refresh the product list and try again.',
          );
        }

        const gstRate = item.gstRate ?? 0;
        const lineSubtotal = item.quantity * item.unitPrice - (item.discount ?? 0);
        const gstAmount = +(lineSubtotal * (gstRate / 100)).toFixed(2);
        const lineTotal = +(lineSubtotal + gstAmount).toFixed(2);

        return manager.create(OrderItem, {
          tenantId,
          orderId: savedOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount ?? 0,
          gstRate,
          gstAmount,
          total: lineTotal,
          batchNo: item.batchNo,
          manufactureDate: item.manufactureDate ?? null,
          expiryDate: item.expiryDate ?? null,
        });
      });
      await manager.save(OrderItem, items);

      // 5. Deduct stock for each item and update batch ledger
      if (!isQuotation) {
        for (const item of dto.items) {
          const [inventory] = await manager.query(
            `SELECT quantity, batch_details
             FROM inventory
             WHERE tenant_id = $1 AND shop_id = $2 AND product_id = $3
             FOR UPDATE`,
            [tenantId, dto.shopId, item.productId],
          );

          const currentQty = Number(inventory?.quantity ?? 0);
          if (!inventory || currentQty < item.quantity) {
            const [product] = await manager.query(`SELECT name FROM products WHERE id = $1`, [item.productId]);
            throw new BadRequestException(
              `Insufficient stock for "${product?.name ?? item.productId}"`,
            );
          }

          const { nextBatchDetails, resolvedBatchNo, resolvedManufactureDate, resolvedExpiryDate } =
            this.allocateBatchesForSale(Array.isArray(inventory.batch_details) ? inventory.batch_details : [], item);

          await manager.query(
            `UPDATE inventory
             SET quantity = quantity - $1,
                 batch_details = $5::jsonb,
                 updated_at = NOW()
             WHERE tenant_id = $2 AND shop_id = $3 AND product_id = $4`,
            [item.quantity, tenantId, dto.shopId, item.productId, JSON.stringify(nextBatchDetails)],
          );

          await manager.query(
            `UPDATE order_items
             SET batch_no = $1,
                 manufacture_date = $2::date,
                 expiry_date = $3::date
             WHERE order_id = $4
               AND product_id = $5
               AND batch_no IS NOT DISTINCT FROM $6`,
            [
              resolvedBatchNo ?? item.batchNo ?? null,
              resolvedManufactureDate ?? item.manufactureDate ?? null,
              resolvedExpiryDate ?? item.expiryDate ?? null,
              savedOrder.id,
              item.productId,
              item.batchNo ?? null,
            ],
          );

          await manager.query(
            `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
             VALUES ($1, $2, $3, 'sale', $4, $5, 'order', $6, $7)`,
            [
              tenantId,
              dto.shopId,
              item.productId,
              -item.quantity,
              savedOrder.id,
              [resolvedBatchNo ? `Batch: ${resolvedBatchNo}` : null, resolvedExpiryDate ? `Exp: ${resolvedExpiryDate}` : null]
                .filter(Boolean)
                .join(' | ') || null,
              userId,
            ],
          );
        }
      }

      // 6. Record payment
      if (!isQuotation && dto.payment) {
        await manager.save(Payment, {
          tenantId,
          orderId: savedOrder.id,
          amount: dto.payment.amount,
          method: dto.payment.method,
          reference: dto.payment.reference,
          status: dto.payment.method === 'credit' ? 'pending' : 'success',
        });
      }

      if (!isQuotation && dto.payment?.method === 'credit' && dto.customerId) {
        await manager.query(
          `UPDATE customers
           SET credit_balance = credit_balance + $1,
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [summary.total, tenantId, dto.customerId],
        );
      }

      // 7. Update customer loyalty points (1 point per ₹10 spent)
      if (!isQuotation && dto.customerId && Number(dto.loyaltyPointsRedeemed ?? 0) > 0) {
        await manager.query(
          `UPDATE customers
           SET loyalty_points = GREATEST(0, loyalty_points - $1),
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [Number(dto.loyaltyPointsRedeemed ?? 0), tenantId, dto.customerId],
        );
      }

      if (!isQuotation && dto.customerId && summary.total > 0) {
        const points = Math.floor(summary.total / 10);
        if (points > 0) {
          await manager.query(
            `UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id = $2`,
            [points, dto.customerId],
          );
        }
      }

      this.logger.log(`Order ${billNumber} created (tenant: ${tenantId}, total: ₹${summary.total})`);

      await this.eventBus.publish('order.created', tenantId, {
        orderId: savedOrder.id,
        billNumber,
        total: summary.total,
        shopId: dto.shopId,
      });

      return savedOrder;
    });
  }

  async findAll(tenantId: string, shopId: string, query: any) {
    const { skip, take, page, perPage } = parsePagination(query);

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where('o.tenant_id = :tenantId AND o.shop_id = :shopId', { tenantId, shopId })
      .orderBy('o.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.type) qb.andWhere('o.type = :type', { type: query.type });
    if (query.from) qb.andWhere('o.created_at >= :from', { from: query.from });
    if (query.to) qb.andWhere('o.created_at <= :to', { to: query.to });
    if (query.search) {
      qb.andWhere('o.bill_number ILIKE :s', { s: `%${query.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return paginatedResponse(data, total, page, perPage);
  }

  async convertQuotation(
    tenantId: string,
    id: string,
    userId: string,
    dto: { payment?: { method: string; amount: number; reference?: string }; loyaltyPointsRedeemed?: number },
  ): Promise<Order> {
    const quotation = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (quotation.type !== 'quotation') throw new BadRequestException('Only quotations can be converted');
    if (quotation.status === 'confirmed') throw new BadRequestException('Quotation is already converted');

    return this.dataSource.transaction(async (manager) => {
      const items = await manager.find(OrderItem, { where: { orderId: id } });
      if (items.length === 0) {
        throw new BadRequestException('Quotation has no items to convert');
      }

      for (const item of items) {
        const [inventory] = await manager.query(
          `SELECT quantity, batch_details
           FROM inventory
           WHERE tenant_id = $1 AND shop_id = $2 AND product_id = $3
           FOR UPDATE`,
          [tenantId, quotation.shopId, item.productId],
        );

        const currentQty = Number(inventory?.quantity ?? 0);
        if (!inventory || currentQty < Number(item.quantity)) {
          throw new BadRequestException(`Insufficient stock to convert quotation ${quotation.billNumber}`);
        }

        const { nextBatchDetails, resolvedBatchNo, resolvedManufactureDate, resolvedExpiryDate } =
          this.allocateBatchesForSale(Array.isArray(inventory.batch_details) ? inventory.batch_details : [], {
            productId: item.productId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount ?? 0),
            gstRate: Number(item.gstRate ?? 0),
            batchNo: item.batchNo ?? undefined,
            manufactureDate: item.manufactureDate ?? undefined,
            expiryDate: item.expiryDate ?? undefined,
          });

        await manager.query(
          `UPDATE inventory
           SET quantity = quantity - $1,
               batch_details = $5::jsonb,
               updated_at = NOW()
           WHERE tenant_id = $2 AND shop_id = $3 AND product_id = $4`,
          [item.quantity, tenantId, quotation.shopId, item.productId, JSON.stringify(nextBatchDetails)],
        );

        await manager.query(
          `UPDATE order_items
           SET batch_no = $1,
               manufacture_date = $2::date,
               expiry_date = $3::date
           WHERE id = $4`,
          [resolvedBatchNo ?? item.batchNo ?? null, resolvedManufactureDate ?? item.manufactureDate ?? null, resolvedExpiryDate ?? item.expiryDate ?? null, item.id],
        );

        await manager.query(
          `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
           VALUES ($1, $2, $3, 'sale', $4, $5, 'quotation_conversion', $6, $7)`,
          [tenantId, quotation.shopId, item.productId, -item.quantity, quotation.id, `Converted from quotation ${quotation.billNumber}`, userId],
        );
      }

      if (dto.payment) {
        await manager.save(
          Payment,
          manager.create(Payment, {
            tenantId,
            orderId: quotation.id,
            amount: dto.payment.amount,
            method: dto.payment.method,
            reference: dto.payment.reference,
            status: dto.payment.method === 'credit' ? 'pending' : 'success',
          }),
        );
      }

      if (quotation.customerId && dto.payment?.method === 'credit') {
        await manager.query(
          `UPDATE customers
           SET credit_balance = credit_balance + $1,
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [quotation.total, tenantId, quotation.customerId],
        );
      }

      const loyaltyRedeemed = Number(dto.loyaltyPointsRedeemed ?? quotation.metadata?.loyaltyPointsRedeemed ?? 0);
      if (quotation.customerId && loyaltyRedeemed > 0) {
        await manager.query(
          `UPDATE customers
           SET loyalty_points = GREATEST(0, loyalty_points - $1),
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [loyaltyRedeemed, tenantId, quotation.customerId],
        );
      }
      if (quotation.customerId && Number(quotation.total ?? 0) > 0) {
        const points = Math.floor(Number(quotation.total) / 10);
        if (points > 0) {
          await manager.query(
            `UPDATE customers SET loyalty_points = loyalty_points + $1 WHERE id = $2`,
            [points, quotation.customerId],
          );
        }
      }

      await manager.update(Order, quotation.id, {
        status: 'confirmed',
        paymentStatus: dto.payment?.method === 'credit' ? 'pending' : dto.payment ? 'paid' : 'pending',
        metadata: {
          ...(quotation.metadata ?? {}),
          convertedAt: new Date().toISOString(),
          loyaltyPointsRedeemed: loyaltyRedeemed,
        },
      });

      return (await manager.findOne(Order, { where: { id: quotation.id } }))!;
    });
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');

    const [items, payments] = await Promise.all([
      this.itemRepo.find({ where: { orderId: id } }),
      this.paymentRepo.find({ where: { orderId: id } }),
    ]);

    // Enrich items with product names
    const productIds = items.map((i) => i.productId);
    const products = productIds.length
      ? await this.dataSource.query(
          `SELECT id, name, sku, unit FROM products WHERE id = ANY($1)`,
          [productIds],
        )
      : [];

    const productMap = Object.fromEntries(products.map((p: any) => [p.id, p]));

    return {
      ...order,
      items: items.map((i) => ({ ...i, product: productMap[i.productId] })),
      payments,
    };
  }

  async voidOrder(tenantId: string, id: string, userId: string, reason: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'cancelled') throw new BadRequestException('Order already cancelled');

    await this.dataSource.transaction(async (manager) => {
      // Restore stock
      const items = await manager.find(OrderItem, { where: { orderId: id } });
      for (const item of items) {
        await manager.query(
          `UPDATE inventory SET quantity = quantity + $1
           WHERE tenant_id = $2 AND shop_id = $3 AND product_id = $4`,
          [item.quantity, tenantId, order.shopId, item.productId],
        );
        await manager.query(
          `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
           VALUES ($1, $2, $3, 'return', $4, $5, 'order', $6, $7)`,
          [tenantId, order.shopId, item.productId, item.quantity, id, `Void: ${reason}`, userId],
        );
      }

      await manager.update(Order, id, { status: 'cancelled', notes: `Voided: ${reason}` });
    });

    await this.eventBus.publish('order.voided', tenantId, { orderId: id, reason });
  }

  async returnOrder(tenantId: string, id: string, userId: string, reason: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'cancelled') throw new BadRequestException('Cancelled orders cannot be returned');
    if (order.type === 'return' || String(order.metadata?.returnedOrderId ?? '') === id) {
      throw new BadRequestException('This order is already a return');
    }

    const existingReturn = await this.orderRepo.findOne({
      where: { tenantId, type: 'return' as any },
      order: { createdAt: 'DESC' },
    });
    if (existingReturn && existingReturn.metadata?.returnedOrderId === id) {
      throw new BadRequestException('Return already recorded for this order');
    }

    return this.dataSource.transaction(async (manager) => {
      const items = await manager.find(OrderItem, { where: { orderId: id } });
      if (items.length === 0) {
        throw new BadRequestException('No order items found to return');
      }

      const billNumber = await this.nextBillNumber(tenantId, order.shopId);
      const returnOrder = await manager.save(
        Order,
        manager.create(Order, {
          tenantId,
          shopId: order.shopId,
          customerId: order.customerId,
          billNumber: `${billNumber}-RTN`,
          type: 'return',
          status: 'confirmed',
          subtotal: order.subtotal,
          discountAmount: order.discountAmount,
          taxAmount: order.taxAmount,
          total: order.total,
          paymentStatus: 'paid',
          notes: `Return for ${order.billNumber}: ${reason}`,
          createdBy: userId,
          metadata: {
            returnedOrderId: id,
            originalBillNumber: order.billNumber,
          },
        }),
      );

      for (const item of items) {
        await manager.save(
          OrderItem,
          manager.create(OrderItem, {
            tenantId,
            orderId: returnOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            gstRate: item.gstRate,
            gstAmount: item.gstAmount,
            total: item.total,
            batchNo: item.batchNo,
            manufactureDate: item.manufactureDate,
            expiryDate: item.expiryDate,
          }),
        );

        const [inventory] = await manager.query(
          `SELECT quantity, batch_details
           FROM inventory
           WHERE tenant_id = $1 AND shop_id = $2 AND product_id = $3
           FOR UPDATE`,
          [tenantId, order.shopId, item.productId],
        );

        const currentBatches: InventoryBatchDetail[] = Array.isArray(inventory?.batch_details)
          ? inventory.batch_details
          : [];
        const nextBatches = currentBatches.map((batch) => ({ ...batch, quantity: Number(batch.quantity ?? 0) }));
        const matchingBatch = nextBatches.find(
          (batch) =>
            (batch.batchNo ?? '') === (item.batchNo ?? '') &&
            (batch.manufactureDate ?? '') === (item.manufactureDate ?? '') &&
            (batch.expiry ?? '') === (item.expiryDate ?? ''),
        );

        if (matchingBatch) {
          matchingBatch.quantity += Number(item.quantity);
        } else {
          nextBatches.push({
            batchNo: item.batchNo ?? `RETURN-${Date.now()}`,
            manufactureDate: item.manufactureDate ?? undefined,
            expiry: item.expiryDate ?? '',
            quantity: Number(item.quantity),
          });
        }

        await manager.query(
          `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity, batch_details)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (tenant_id, shop_id, product_id)
           DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity,
                         batch_details = $5::jsonb,
                         updated_at = NOW()`,
          [tenantId, order.shopId, item.productId, item.quantity, JSON.stringify(nextBatches)],
        );

        await manager.query(
          `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
           VALUES ($1, $2, $3, 'return', $4, $5, 'order_return', $6, $7)`,
          [tenantId, order.shopId, item.productId, item.quantity, returnOrder.id, reason, userId],
        );
      }

      if (order.customerId && order.paymentStatus === 'pending') {
        await manager.query(
          `UPDATE customers
           SET credit_balance = GREATEST(0, credit_balance - $1),
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [order.total, tenantId, order.customerId],
        );
      }

      await manager.save(
        Payment,
        manager.create(Payment, {
          tenantId,
          orderId: returnOrder.id,
          amount: order.total,
          method: 'cash',
          reference: `Return for ${order.billNumber}`,
          status: 'success',
        }),
      );

      await manager.update(Order, id, {
        notes: `${order.notes ? `${order.notes} | ` : ''}Returned: ${reason}`,
        metadata: {
          ...(order.metadata ?? {}),
          returnOrderId: returnOrder.id,
        },
      });

      return returnOrder;
    });
  }

  async returnOrderItems(
    tenantId: string,
    id: string,
    userId: string,
    dto: PartialReturnRequest,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'cancelled') throw new BadRequestException('Cancelled orders cannot be returned');
    if (order.type === 'return') throw new BadRequestException('Return orders cannot be returned again');
    if (!dto.reason?.trim()) throw new BadRequestException('Return reason is required');
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      throw new BadRequestException('Select at least one item to return');
    }

    return this.dataSource.transaction(async (manager) => {
      const items = await manager.find(OrderItem, { where: { orderId: id } });
      if (items.length === 0) {
        throw new BadRequestException('No order items found to return');
      }

      const itemsById = new Map(items.map((item) => [item.id, item]));
      const returnState = this.getPartialReturnState(order.metadata);
      const normalizedSelections = dto.items.map((item) => {
        const orderItem = itemsById.get(item.orderItemId);
        if (!orderItem) {
          throw new BadRequestException('One or more selected items are no longer available');
        }

        const quantity = Number(item.quantity ?? 0);
        if (quantity <= 0) {
          throw new BadRequestException('Return quantity must be greater than 0');
        }

        const alreadyReturned = Number(returnState[orderItem.id] ?? 0);
        const availableToReturn = Number(orderItem.quantity) - alreadyReturned;
        if (quantity > availableToReturn) {
          throw new BadRequestException(
            `Return quantity for "${orderItem.productId}" exceeds the remaining sell quantity`,
          );
        }

        return { orderItem, quantity, alreadyReturned };
      });

      const subtotal = normalizedSelections.reduce(
        (sum, selection) => sum + Number(selection.orderItem.unitPrice) * selection.quantity - Number(selection.orderItem.discount ?? 0),
        0,
      );
      const taxAmount = normalizedSelections.reduce(
        (sum, selection) => sum + Number(selection.orderItem.gstAmount ?? 0) * (selection.quantity / Number(selection.orderItem.quantity || 1)),
        0,
      );
      const total = normalizedSelections.reduce(
        (sum, selection) => sum + Number(selection.orderItem.total ?? 0) * (selection.quantity / Number(selection.orderItem.quantity || 1)),
        0,
      );

      const billNumber = await this.nextBillNumber(tenantId, order.shopId);
      const returnOrder = await manager.save(
        Order,
        manager.create(Order, {
          tenantId,
          shopId: order.shopId,
          customerId: order.customerId,
          billNumber: `${billNumber}-PRTN`,
          type: 'return',
          status: 'confirmed',
          subtotal: Number(subtotal.toFixed(2)),
          discountAmount: 0,
          taxAmount: Number(taxAmount.toFixed(2)),
          total: Number(total.toFixed(2)),
          paymentStatus: 'paid',
          notes: `Partial return for ${order.billNumber}: ${dto.reason.trim()}`,
          createdBy: userId,
          metadata: {
            returnedOrderId: id,
            originalBillNumber: order.billNumber,
            partialReturn: true,
          },
        }),
      );

      for (const selection of normalizedSelections) {
        const ratio = selection.quantity / Number(selection.orderItem.quantity || 1);
        await manager.save(
          OrderItem,
          manager.create(OrderItem, {
            tenantId,
            orderId: returnOrder.id,
            productId: selection.orderItem.productId,
            quantity: selection.quantity,
            unitPrice: selection.orderItem.unitPrice,
            discount: Number((Number(selection.orderItem.discount ?? 0) * ratio).toFixed(2)),
            gstRate: selection.orderItem.gstRate,
            gstAmount: Number((Number(selection.orderItem.gstAmount ?? 0) * ratio).toFixed(2)),
            total: Number((Number(selection.orderItem.total ?? 0) * ratio).toFixed(2)),
            batchNo: selection.orderItem.batchNo,
            manufactureDate: selection.orderItem.manufactureDate,
            expiryDate: selection.orderItem.expiryDate,
          }),
        );

        const [inventory] = await manager.query(
          `SELECT quantity, batch_details
           FROM inventory
           WHERE tenant_id = $1 AND shop_id = $2 AND product_id = $3
           FOR UPDATE`,
          [tenantId, order.shopId, selection.orderItem.productId],
        );

        const currentBatches: InventoryBatchDetail[] = Array.isArray(inventory?.batch_details)
          ? inventory.batch_details
          : [];
        const nextBatches = currentBatches.map((batch) => ({ ...batch, quantity: Number(batch.quantity ?? 0) }));
        const matchingBatch = nextBatches.find(
          (batch) =>
            (batch.batchNo ?? '') === (selection.orderItem.batchNo ?? '') &&
            (batch.manufactureDate ?? '') === (selection.orderItem.manufactureDate ?? '') &&
            (batch.expiry ?? '') === (selection.orderItem.expiryDate ?? ''),
        );

        if (matchingBatch) {
          matchingBatch.quantity += Number(selection.quantity);
        } else {
          nextBatches.push({
            batchNo: selection.orderItem.batchNo ?? `RETURN-${Date.now()}`,
            manufactureDate: selection.orderItem.manufactureDate ?? undefined,
            expiry: selection.orderItem.expiryDate ?? '',
            quantity: Number(selection.quantity),
          });
        }

        await manager.query(
          `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity, batch_details)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (tenant_id, shop_id, product_id)
           DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity,
                         batch_details = $5::jsonb,
                         updated_at = NOW()`,
          [tenantId, order.shopId, selection.orderItem.productId, selection.quantity, JSON.stringify(nextBatches)],
        );

        await manager.query(
          `INSERT INTO stock_movements (tenant_id, shop_id, product_id, type, quantity, reference_id, reference_type, notes, created_by)
           VALUES ($1, $2, $3, 'return', $4, $5, 'order_return', $6, $7)`,
          [
            tenantId,
            order.shopId,
            selection.orderItem.productId,
            selection.quantity,
            returnOrder.id,
            `Partial return: ${dto.reason.trim()}`,
            userId,
          ],
        );
      }

      if (order.customerId && order.paymentStatus === 'pending') {
        await manager.query(
          `UPDATE customers
           SET credit_balance = GREATEST(0, credit_balance - $1),
               updated_at = NOW()
           WHERE tenant_id = $2 AND id = $3`,
          [Number(total.toFixed(2)), tenantId, order.customerId],
        );
      }

      await manager.save(
        Payment,
        manager.create(Payment, {
          tenantId,
          orderId: returnOrder.id,
          amount: Number(total.toFixed(2)),
          method: dto.refundMethod?.trim() || 'cash',
          reference: `Partial return for ${order.billNumber}`,
          status: 'success',
        }),
      );

      const nextReturnState = { ...returnState };
      normalizedSelections.forEach((selection) => {
        nextReturnState[selection.orderItem.id] = Number(
          ((nextReturnState[selection.orderItem.id] ?? 0) + selection.quantity).toFixed(3),
        );
      });

      await manager.update(Order, id, {
        notes: `${order.notes ? `${order.notes} | ` : ''}Partial return: ${dto.reason.trim()}`,
        metadata: {
          ...(order.metadata ?? {}),
          partialReturns: nextReturnState,
          lastReturnOrderId: returnOrder.id,
        },
      });

      return returnOrder;
    });
  }

  private calculateSummary(dto: CreateOrderDto): OrderSummary {
    const gstBreakdown: Record<string, { taxable: number; tax: number }> = {};
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of dto.items) {
      const lineNet = item.quantity * item.unitPrice - (item.discount ?? 0);
      subtotal += lineNet;

      const gstRate = item.gstRate ?? 0;
      if (gstRate > 0) {
        const gst = +(lineNet * (gstRate / 100)).toFixed(2);
        taxAmount += gst;
        const key = `${gstRate}%`;
        if (!gstBreakdown[key]) gstBreakdown[key] = { taxable: 0, tax: 0 };
        gstBreakdown[key].taxable += lineNet;
        gstBreakdown[key].tax += gst;
      }
    }

    const loyaltyPointsRedeemed = Number(dto.loyaltyPointsRedeemed ?? 0);
    const loyaltyDiscount = Number((loyaltyPointsRedeemed * 0.1).toFixed(2));
    const discountAmount = Number((dto.globalDiscount ?? 0) + loyaltyDiscount);
    const total = +(subtotal + taxAmount - discountAmount).toFixed(2);

    return {
      subtotal: +subtotal.toFixed(2),
      discountAmount,
      taxAmount: +taxAmount.toFixed(2),
      total,
      loyaltyDiscount,
      gstBreakdown,
    };
  }

  private async nextBillNumber(tenantId: string, shopId: string): Promise<string> {
    // Atomic increment via UPDATE...RETURNING — safe under concurrency
    const result = await this.dataSource.query(
      `UPDATE bill_sequences
       SET last_number = last_number + 1
       WHERE tenant_id = $1 AND shop_id = $2
       RETURNING prefix, last_number, EXTRACT(YEAR FROM NOW())::int AS year`,
      [tenantId, shopId],
    );

    if (!result[0]?.length) {
      // First order — insert sequence row
      await this.dataSource.query(
        `INSERT INTO bill_sequences (tenant_id, shop_id, prefix, last_number) VALUES ($1, $2, 'ORD', 1)
         ON CONFLICT DO NOTHING`,
        [tenantId, shopId],
      );
      return `ORD-${new Date().getFullYear()}-00001`;
    }

    const { prefix, last_number, year } = result[0][0];
    return `${prefix}-${year}-${String(last_number).padStart(5, '0')}`;
  }

  private allocateBatchesForSale(
    batchDetails: InventoryBatchDetail[],
    item: CreateOrderDto['items'][number],
  ) {
    if (!Array.isArray(batchDetails) || batchDetails.length === 0) {
      return {
        nextBatchDetails: batchDetails,
        resolvedBatchNo: item.batchNo,
        resolvedManufactureDate: item.manufactureDate,
        resolvedExpiryDate: item.expiryDate,
      };
    }

    const normalized = batchDetails.map((batch) => ({
      ...batch,
      quantity: Number(batch.quantity ?? 0),
    }));

    const targetBatch =
      (item.batchNo ? normalized.find((batch) => batch.batchNo === item.batchNo) : null) ??
      [...normalized]
        .filter((batch) => batch.quantity > 0)
        .sort((left, right) => {
          const leftDate = left.expiry ? new Date(left.expiry).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDate = right.expiry ? new Date(right.expiry).getTime() : Number.MAX_SAFE_INTEGER;
          return leftDate - rightDate;
        })[0];

    if (!targetBatch || targetBatch.quantity < item.quantity) {
      throw new BadRequestException(
        item.batchNo
          ? `Insufficient stock in batch "${item.batchNo}" for this medicine`
          : 'No sellable batch is available for this medicine',
      );
    }

    const nextBatchDetails = normalized
      .map((batch) =>
        batch.batchNo === targetBatch.batchNo
          ? { ...batch, quantity: Number((batch.quantity - item.quantity).toFixed(3)) }
          : batch,
      )
      .filter((batch) => batch.quantity > 0);

    return {
      nextBatchDetails,
      resolvedBatchNo: targetBatch.batchNo,
      resolvedManufactureDate: targetBatch.manufactureDate,
      resolvedExpiryDate: targetBatch.expiry,
    };
  }

  private getPartialReturnState(metadata: Record<string, any> | null | undefined) {
    const raw = metadata?.partialReturns;
    if (!raw || typeof raw !== 'object') {
      return {} as Record<string, number>;
    }

    return Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, Number(value ?? 0)]),
    );
  }
}
