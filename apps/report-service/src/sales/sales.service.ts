import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';

export interface SalesReportQuery {
  shopId: string;
  from: string;   // ISO date
  to: string;     // ISO date
  groupBy?: 'day' | 'week' | 'month';
}

@Injectable()
export class SalesService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getSalesSummary(tenantId: string, query: SalesReportQuery) {
    const cacheKey = `report:sales:${tenantId}:${query.shopId}:${query.from}:${query.to}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [totals] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int                    AS total_orders,
         COALESCE(SUM(total), 0)          AS total_revenue,
         COALESCE(SUM(tax_amount), 0)     AS total_tax,
         COALESCE(SUM(discount_amount),0) AS total_discount,
         COALESCE(AVG(total), 0)          AS avg_order_value
       FROM orders
       WHERE tenant_id = $1 AND shop_id = $2
         AND created_at >= $3 AND created_at <= $4
         AND status = 'confirmed'`,
      [tenantId, query.shopId, query.from, query.to],
    );

    const timeline = await this.dataSource.query(
      `SELECT
         DATE_TRUNC($5, created_at) AS period,
         COUNT(*)::int AS orders,
         COALESCE(SUM(total), 0) AS revenue
       FROM orders
       WHERE tenant_id = $1 AND shop_id = $2
         AND created_at >= $3 AND created_at <= $4
         AND status = 'confirmed'
       GROUP BY period
       ORDER BY period ASC`,
      [tenantId, query.shopId, query.from, query.to, query.groupBy ?? 'day'],
    );

    const topProducts = await this.dataSource.query(
      `SELECT
         oi.product_id,
         p.name AS product_name,
         p.sku,
         p.unit,
         SUM(oi.quantity) AS total_qty,
         SUM(oi.total)    AS total_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.tenant_id = $1 AND o.shop_id = $2
         AND o.created_at >= $3 AND o.created_at <= $4
         AND o.status = 'confirmed'
       GROUP BY oi.product_id, p.name, p.sku, p.unit
       ORDER BY total_revenue DESC
       LIMIT 10`,
      [tenantId, query.shopId, query.from, query.to],
    );

    const paymentMethods = await this.dataSource.query(
      `SELECT
         p.method,
         COUNT(*)::int AS count,
         SUM(p.amount) AS amount
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.tenant_id = $1 AND o.shop_id = $2
         AND o.created_at >= $3 AND o.created_at <= $4
       GROUP BY p.method`,
      [tenantId, query.shopId, query.from, query.to],
    );

    const result = {
      summary: totals,
      timeline,
      topProducts,
      paymentMethods,
      generatedAt: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, result, 1800); // 30 min cache
    return result;
  }

  async getDailySummary(tenantId: string, shopId: string, date: string) {
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COALESCE(SUM(total), 0) AS total_revenue,
         COALESCE(SUM(tax_amount), 0) AS total_tax,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total ELSE 0 END), 0) AS pending
       FROM orders
       WHERE tenant_id = $1 AND shop_id = $2
         AND created_at BETWEEN $3 AND $4
         AND status = 'confirmed'`,
      [tenantId, shopId, startOfDay, endOfDay],
    );

    return summary;
  }

  async getTopProducts(tenantId: string, shopId: string, days = 180, limit = 50) {
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(days, 1), 365) : 180;
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
    const to = new Date();
    const from = new Date(Date.now() - safeDays * 86400000);

    return this.dataSource.query(
      `SELECT
         oi.product_id,
         p.name,
         p.sku,
         p.unit,
         p.mrp,
         p.selling_price,
         p.gst_rate,
         i.batch_details,
         i.quantity AS available_quantity,
         SUM(oi.quantity) AS total_qty,
         SUM(oi.total)    AS total_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       LEFT JOIN inventory i
         ON i.tenant_id = o.tenant_id
        AND i.shop_id = o.shop_id
        AND i.product_id = oi.product_id
       WHERE o.tenant_id = $1 AND o.shop_id = $2
         AND o.created_at >= $3 AND o.created_at <= $4
         AND o.status = 'confirmed'
         AND p.is_active = true
       GROUP BY oi.product_id, p.name, p.sku, p.unit, p.mrp, p.selling_price, p.gst_rate, i.batch_details, i.quantity
       ORDER BY total_qty DESC, total_revenue DESC, p.name ASC
       LIMIT $5`,
      [tenantId, shopId, from.toISOString(), to.toISOString(), safeLimit],
    );
  }

  // GST Report — required for Indian tax filing (GSTR-1 style)
  async getGSTReport(tenantId: string, shopId: string, month: string) {
    // month = '2024-01'
    const [year, mon] = month.split('-');
    const from = `${year}-${mon}-01`;
    const to = new Date(Number(year), Number(mon), 0).toISOString().split('T')[0];

    const breakdown = await this.dataSource.query(
      `SELECT
         oi.gst_rate,
         SUM(oi.total - oi.gst_amount) AS taxable_value,
         SUM(oi.gst_amount)            AS tax_collected,
         SUM(oi.gst_amount / 2)        AS cgst,
         SUM(oi.gst_amount / 2)        AS sgst,
         0                             AS igst,
         COUNT(DISTINCT o.id)          AS invoice_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.tenant_id = $1 AND o.shop_id = $2
         AND o.created_at BETWEEN $3 AND $4
         AND o.status = 'confirmed'
         AND oi.gst_rate > 0
       GROUP BY oi.gst_rate
       ORDER BY oi.gst_rate`,
      [tenantId, shopId, from, to + ' 23:59:59'],
    );

    const totalTax = breakdown.reduce((sum: number, row: any) => sum + Number(row.tax_collected), 0);

    return {
      period: month,
      breakdown,
      totalTaxCollected: totalTax,
      generatedAt: new Date().toISOString(),
    };
  }

  async getInventoryValuation(tenantId: string, shopId: string) {
    return this.dataSource.query(
      `SELECT
         p.id,
         p.name,
         p.sku,
         p.unit,
         i.quantity,
         p.purchase_price,
         p.mrp,
         (i.quantity * p.purchase_price) AS cost_value,
         (i.quantity * p.mrp)            AS mrp_value
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.tenant_id = $1 AND i.shop_id = $2
         AND i.quantity > 0
       ORDER BY cost_value DESC`,
      [tenantId, shopId],
    );
  }

  async getDailyClosing(tenantId: string, shopId: string, date: string) {
    const startOfDay = `${date} 00:00:00`;
    const endOfDay = `${date} 23:59:59`;

    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COALESCE(SUM(total), 0) AS gross_sales,
         COALESCE(SUM(discount_amount), 0) AS total_discount,
         COALESCE(SUM(tax_amount), 0) AS total_tax,
         COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END), 0) AS paid_sales,
         COALESCE(SUM(CASE WHEN payment_status = 'pending' THEN total ELSE 0 END), 0) AS credit_sales
       FROM orders
       WHERE tenant_id = $1
         AND shop_id = $2
         AND created_at BETWEEN $3 AND $4
         AND status = 'confirmed'`,
      [tenantId, shopId, startOfDay, endOfDay],
    );

    const payments = await this.dataSource.query(
      `SELECT
         p.method,
         COUNT(*)::int AS count,
         COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE o.tenant_id = $1
         AND o.shop_id = $2
         AND o.created_at BETWEEN $3 AND $4
       GROUP BY p.method
       ORDER BY amount DESC`,
      [tenantId, shopId, startOfDay, endOfDay],
    );

    const returns = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS return_count,
         COALESCE(SUM(total), 0) AS return_total
       FROM orders
       WHERE tenant_id = $1
         AND shop_id = $2
         AND created_at BETWEEN $3 AND $4
         AND type = 'return'
         AND status = 'confirmed'`,
      [tenantId, shopId, startOfDay, endOfDay],
    );

    return {
      date,
      summary,
      payments,
      returns: returns[0] ?? { return_count: 0, return_total: 0 },
    };
  }

  async getAuditLog(tenantId: string, shopId: string, limit = 100) {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 100;
    return this.dataSource.query(
      `SELECT * FROM (
         SELECT
           o.created_at AS event_time,
           'order' AS event_type,
           o.bill_number AS reference,
           o.status AS status,
           o.notes AS details
         FROM orders o
         WHERE o.tenant_id = $1
           AND o.shop_id = $2
         UNION ALL
         SELECT
           sm.created_at AS event_time,
           'stock_movement' AS event_type,
           COALESCE(sm.reference_type, 'inventory') AS reference,
           sm.type AS status,
           sm.notes AS details
         FROM stock_movements sm
         WHERE sm.tenant_id = $1
           AND sm.shop_id = $2
         UNION ALL
         SELECT
           po.created_at AS event_time,
           'purchase_order' AS event_type,
           po.po_number AS reference,
           po.status AS status,
           po.notes AS details
         FROM purchase_orders po
         WHERE po.tenant_id = $1
           AND po.shop_id = $2
       ) audit
       ORDER BY event_time DESC
       LIMIT $3`,
      [tenantId, shopId, safeLimit],
    );
  }

  async getMarginReport(tenantId: string, shopId: string, from: string, to: string) {
    return this.dataSource.query(
      `SELECT
         p.name AS product_name,
         p.sku,
         SUM(oi.quantity) AS units_sold,
         SUM(oi.total) AS revenue,
         SUM(COALESCE(p.purchase_price, 0) * oi.quantity) AS estimated_cost,
         SUM(oi.total) - SUM(COALESCE(p.purchase_price, 0) * oi.quantity) AS estimated_margin
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.tenant_id = $1
         AND o.shop_id = $2
         AND o.created_at BETWEEN $3 AND $4
         AND o.status = 'confirmed'
         AND o.type <> 'return'
       GROUP BY p.name, p.sku
       ORDER BY estimated_margin DESC
       LIMIT 50`,
      [tenantId, shopId, from, to],
    );
  }

  async getCustomerInsights(tenantId: string, shopId: string, from: string, to: string) {
    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN order_count = 1 THEN customer_id END)::int AS one_time_customers,
         COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END)::int AS repeat_customers,
         COALESCE(AVG(order_count), 0) AS avg_orders_per_customer
       FROM (
         SELECT o.customer_id, COUNT(*) AS order_count
         FROM orders o
         WHERE o.tenant_id = $1
           AND o.shop_id = $2
           AND o.created_at BETWEEN $3 AND $4
           AND o.customer_id IS NOT NULL
           AND o.status = 'confirmed'
         GROUP BY o.customer_id
       ) grouped`,
      [tenantId, shopId, from, to],
    );

    const topCustomers = await this.dataSource.query(
      `SELECT
         c.id,
         c.name,
         c.phone,
         COUNT(o.id)::int AS orders,
         COALESCE(SUM(o.total), 0) AS spend,
         COALESCE(c.credit_balance, 0) AS credit_balance,
         COALESCE(c.loyalty_points, 0) AS loyalty_points
       FROM customers c
       LEFT JOIN orders o
         ON o.customer_id = c.id
        AND o.tenant_id = $1
        AND o.shop_id = $2
        AND o.created_at BETWEEN $3 AND $4
        AND o.status = 'confirmed'
       WHERE c.tenant_id = $1
       GROUP BY c.id, c.name, c.phone, c.credit_balance, c.loyalty_points
       ORDER BY spend DESC, orders DESC
       LIMIT 25`,
      [tenantId, shopId, from, to],
    );

    return { summary, topCustomers };
  }

  async getInventoryIntelligence(tenantId: string, shopId: string) {
    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS stocked_items,
         COALESCE(SUM(CASE WHEN i.quantity <= COALESCE(NULLIF(p.attributes->>'lowStockQuantity', '')::decimal, i.reorder_level, 0) THEN 1 ELSE 0 END), 0) AS low_stock_items,
         COALESCE(SUM(i.quantity * COALESCE(p.purchase_price, 0)), 0) AS stock_cost_value
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       WHERE i.tenant_id = $1
         AND i.shop_id = $2
         AND p.is_active = true`,
      [tenantId, shopId],
    );

    const deadStock = await this.dataSource.query(
      `SELECT
         p.name,
         p.sku,
         i.quantity,
         COALESCE(last_sale.last_sold_at, i.updated_at) AS last_activity_at
       FROM inventory i
       JOIN products p ON p.id = i.product_id
       LEFT JOIN LATERAL (
         SELECT MAX(o.created_at) AS last_sold_at
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.product_id = i.product_id
           AND o.tenant_id = i.tenant_id
           AND o.shop_id = i.shop_id
           AND o.status = 'confirmed'
       ) last_sale ON true
       WHERE i.tenant_id = $1
         AND i.shop_id = $2
         AND i.quantity > 0
       ORDER BY last_activity_at ASC
       LIMIT 25`,
      [tenantId, shopId],
    );

    return { summary, deadStock };
  }
}
