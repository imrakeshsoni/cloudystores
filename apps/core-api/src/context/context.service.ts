import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ContextService {
  constructor(private readonly dataSource: DataSource) {}

  async bootstrap(tenantId: string, userId: string, requestedShopId?: string) {
    const user = await this.dataSource.query(
      `SELECT u.id, u.name, u.email, u.shop_id, p.permissions
       FROM users u
       LEFT JOIN profiles p ON p.id = u.profile_id
       WHERE u.id = $1 AND u.tenant_id = $2
       LIMIT 1`,
      [userId, tenantId],
    );

    const tenant = await this.dataSource.query(
      `SELECT id, name, slug, plan, status, settings, metadata
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    const shops = await this.dataSource.query(
      `SELECT id, name, type, phone, gst_number, address, settings
       FROM shops
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [tenantId],
    );

    const selectedShop =
      shops.find((shop: any) => shop.id === requestedShopId) ??
      shops.find((shop: any) => shop.id === user[0]?.shop_id) ??
      shops[0] ??
      null;

    await this.ensureDemoData(tenantId, selectedShop?.id);

    const counts = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE tenant_id = $1 AND is_active = true) AS products,
        (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) AS customers,
        (SELECT COUNT(*) FROM suppliers WHERE tenant_id = $1 AND is_active = true) AS suppliers,
        (SELECT COUNT(*) FROM orders WHERE tenant_id = $1) AS orders`,
      [tenantId],
    );

    return {
      user: {
        id: user[0]?.id,
        name: user[0]?.name,
        email: user[0]?.email,
        tenantId,
        permissions: user[0]?.permissions ?? {},
      },
      tenant: tenant[0] ?? null,
      shops,
      activeShopId: selectedShop?.id ?? null,
      counts: counts[0] ?? { products: 0, customers: 0, suppliers: 0, orders: 0 },
    };
  }

  async getSettings(tenantId: string, shopId?: string) {
    const [tenant] = await this.dataSource.query(
      `SELECT id, name, slug, plan, status, settings, metadata
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    const [shop] = shopId
      ? await this.dataSource.query(
          `SELECT id, name, type, phone, gst_number, address, settings
           FROM shops
           WHERE tenant_id = $1 AND id = $2
           LIMIT 1`,
          [tenantId, shopId],
        )
      : [null];

    return { tenant, shop };
  }

  async updateSettings(
    tenantId: string,
    shopId: string | undefined,
    dto: {
      tenantName: string;
      plan?: string;
      tenantSettings?: Record<string, unknown>;
      shopName?: string;
      shopType?: string;
      phone?: string;
      gstNumber?: string;
      address?: Record<string, unknown>;
      shopSettings?: Record<string, unknown>;
    },
  ) {
    const [tenant] = await this.dataSource.query(
      `UPDATE tenants
       SET name = $2,
           plan = COALESCE($3, plan),
           settings = COALESCE(settings, '{}'::jsonb) || $4::jsonb,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, plan, status, settings, metadata`,
      [
        tenantId,
        dto.tenantName,
        dto.plan ?? null,
        JSON.stringify(dto.tenantSettings ?? {}),
      ],
    );

    const [shop] = shopId
      ? await this.dataSource.query(
          `UPDATE shops
           SET name = COALESCE($3, name),
               type = COALESCE($4, type),
               phone = COALESCE($5, phone),
               gst_number = COALESCE($6, gst_number),
               address = COALESCE($7::jsonb, address),
               settings = COALESCE(settings, '{}'::jsonb) || $8::jsonb,
               updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2
           RETURNING id, name, type, phone, gst_number, address, settings`,
          [
            tenantId,
            shopId,
            dto.shopName ?? null,
            dto.shopType ?? null,
            dto.phone ?? null,
            dto.gstNumber ?? null,
            dto.address ? JSON.stringify(dto.address) : null,
            JSON.stringify(dto.shopSettings ?? {}),
          ],
        )
      : [null];

    return { tenant, shop };
  }

  private async ensureDemoData(tenantId: string, shopId?: string) {
    if (!shopId) return;

    const [counts] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS product_count,
        (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) AS customer_count,
        (SELECT COUNT(*) FROM suppliers WHERE tenant_id = $1) AS supplier_count`,
      [tenantId],
    );

    if (Number(counts?.product_count ?? 0) < 6) {
      const products = [
        ['Paracetamol 650', 'MED-PARA-650', '8901234500011', 'strip', 32, 28, 18, 12],
        ['Vitamin C Tablets', 'MED-VITC-001', '8901234500012', 'strip', 95, 82, 54, 12],
        ['Hand Sanitizer 500ml', 'GEN-SANI-500', '8901234500013', 'bottle', 120, 99, 62, 18],
        ['Digital Thermometer', 'MED-THERM-01', '8901234500014', 'piece', 199, 179, 110, 12],
        ['Protein Snack Bar', 'GEN-SNACK-01', '8901234500015', 'piece', 45, 39, 21, 5],
      ];

      for (const [name, sku, barcode, unit, mrp, sellingPrice, purchasePrice, gstRate] of products) {
        await this.dataSource.query(
          `INSERT INTO products (tenant_id, shop_id, name, sku, barcode, unit, mrp, selling_price, purchase_price, gst_rate)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (tenant_id, sku) DO NOTHING`,
          [tenantId, shopId, name, sku, barcode, unit, mrp, sellingPrice, purchasePrice, gstRate],
        );
      }

      const productRows = await this.dataSource.query(
        `SELECT id FROM products WHERE tenant_id = $1 AND shop_id = $2`,
        [tenantId, shopId],
      );
      for (const [index, product] of productRows.entries()) {
        await this.dataSource.query(
          `INSERT INTO inventory (tenant_id, shop_id, product_id, quantity, reorder_level)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tenant_id, shop_id, product_id)
           DO UPDATE SET quantity = GREATEST(inventory.quantity, EXCLUDED.quantity),
                         reorder_level = GREATEST(COALESCE(inventory.reorder_level, 0), EXCLUDED.reorder_level),
                         updated_at = NOW()`,
          [tenantId, shopId, product.id, 12 + index * 4, 5],
        );
      }
    }

    if (Number(counts?.customer_count ?? 0) < 4) {
      const customers = [
        ['Walk-in Customer', '9000000001', 'walkin@shoposphere.demo'],
        ['Anita Sharma', '9876543210', 'anita@example.com'],
        ['Rahul Mehta', '9876543211', 'rahul@example.com'],
        ['Priya Nair', '9876543212', 'priya@example.com'],
      ];

      for (const [name, phone, email] of customers) {
        await this.dataSource.query(
          `INSERT INTO customers (tenant_id, name, phone, email, loyalty_points)
           VALUES ($1, $2, $3, $4, 0)
           ON CONFLICT (tenant_id, phone) DO NOTHING`,
          [tenantId, name, phone, email],
        );
      }
    }

    if (Number(counts?.supplier_count ?? 0) < 3) {
      const suppliers = [
        ['MedSource Distributors', '27AACCM1234A1Z5', '9988776655', 'sales@medsource.demo', 'Mumbai'],
        ['HealthLine Wholesale', '27AAACH5678B1Z2', '9988776644', 'orders@healthline.demo', 'Pune'],
        ['CarePlus Pharma', '27AAACC9876C1Z8', '9988776633', 'support@careplus.demo', 'Nashik'],
      ];

      for (const [name, gst, phone, email, city] of suppliers) {
        await this.dataSource.query(
          `INSERT INTO suppliers (tenant_id, name, gst_number, phone, email, address, payment_terms, is_active)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, 30, true)
           ON CONFLICT DO NOTHING`,
          [tenantId, name, gst, phone, email, JSON.stringify({ city })],
        );
      }
    }
  }
}
