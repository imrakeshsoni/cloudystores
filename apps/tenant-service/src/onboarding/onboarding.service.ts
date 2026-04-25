import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateSlug } from '@shoposphere/common';
import { EventBusService } from '@shoposphere/common';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';

const SYSTEM_PROFILES = {
  owner: {
    name: 'Owner',
    is_system: true,
    permissions: {
      products:  { read: true, write: true, delete: true, import: true, export: true },
      inventory: { read: true, write: true, adjust: true },
      orders:    { read: true, write: true, void: true, discount: true },
      customers: { read: true, write: true, delete: true },
      suppliers: { read: true, write: true, delete: true },
      reports:   { read: true, export: true },
      settings:  { read: true, write: true },
      billing:   { read: true, write: true },
      users:     { read: true, write: true, delete: true },
    },
  },
  manager: {
    name: 'Manager',
    is_system: true,
    permissions: {
      products:  { read: true, write: true, delete: false, import: true, export: true },
      inventory: { read: true, write: true, adjust: true },
      orders:    { read: true, write: true, void: true, discount: true },
      customers: { read: true, write: true, delete: false },
      suppliers: { read: true, write: true, delete: false },
      reports:   { read: true, export: true },
      settings:  { read: true, write: false },
      billing:   { read: false, write: false },
      users:     { read: true, write: false, delete: false },
    },
  },
  cashier: {
    name: 'Cashier',
    is_system: true,
    permissions: {
      products:  { read: true, write: false, delete: false, import: false, export: false },
      inventory: { read: true, write: false, adjust: false },
      orders:    { read: true, write: true, void: false, discount: false },
      customers: { read: true, write: true, delete: false },
      suppliers: { read: false, write: false, delete: false },
      reports:   { read: false, export: false },
      settings:  { read: false, write: false },
      billing:   { read: false, write: false },
      users:     { read: false, write: false, delete: false },
    },
  },
  stockist: {
    name: 'Stockist',
    is_system: true,
    permissions: {
      products:  { read: true, write: true, delete: false, import: true, export: false },
      inventory: { read: true, write: true, adjust: true },
      orders:    { read: true, write: false, void: false, discount: false },
      customers: { read: false, write: false, delete: false },
      suppliers: { read: true, write: true, delete: false },
      reports:   { read: false, export: false },
      settings:  { read: false, write: false },
      billing:   { read: false, write: false },
      users:     { read: false, write: false, delete: false },
    },
  },
};

const LARGE_DEMO_SEED_SQL_PATH = join(
  __dirname,
  '../../../../tools/seeds/medplus-large-demo.sql',
);

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBusService,
  ) {}

  async onboard(dto: OnboardTenantDto) {
    const slug = await this.generateUniqueSlug(dto.shopName);

    return this.dataSource.transaction(async (manager) => {
      // 1. Create tenant
      const [tenant] = await manager.query(
        `INSERT INTO tenants (name, slug, plan, status, settings)
         VALUES ($1, $2, $3, 'active', $4)
         RETURNING *`,
        [
          dto.shopName,
          slug,
          dto.plan ?? 'starter',
          JSON.stringify({
            gstNumber: dto.gstNumber,
            state: dto.state,
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            shopType: dto.shopType,
          }),
        ],
      );

      // Set RLS context so all subsequent inserts into tenant-scoped tables pass RLS policies
      await manager.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenant.id]);

      // 2. Create default shop (branch)
      const [shop] = await manager.query(
        `INSERT INTO shops (tenant_id, name, type, phone, address, gst_number)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          tenant.id,
          dto.shopName,
          dto.shopType,
          dto.phone,
          JSON.stringify(dto.address ?? {}),
          dto.gstNumber,
        ],
      );

      // 3. Seed system profiles
      const profileIds: Record<string, string> = {};
      for (const [key, profile] of Object.entries(SYSTEM_PROFILES)) {
        const [p] = await manager.query(
          `INSERT INTO profiles (tenant_id, name, is_system, permissions)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [tenant.id, profile.name, profile.is_system, JSON.stringify(profile.permissions)],
        );
        profileIds[key] = p.id;
      }

      // 4. Seed role hierarchy
      const [ownerRole] = await manager.query(
        `INSERT INTO roles (tenant_id, name, level)
         VALUES ($1, 'Owner', 0)
         RETURNING id`,
        [tenant.id],
      );
      const [managerRole] = await manager.query(
        `INSERT INTO roles (tenant_id, name, parent_role_id, level)
         VALUES ($1, 'Manager', $2, 1)
         RETURNING id`,
        [tenant.id, ownerRole.id],
      );
      await manager.query(
        `INSERT INTO roles (tenant_id, name, parent_role_id, level) VALUES
         ($1, 'Cashier', $2, 2),
         ($1, 'Stockist', $2, 2)`,
        [tenant.id, managerRole.id],
      );

      // 5. Create owner user
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const [user] = await manager.query(
        `INSERT INTO users (tenant_id, shop_id, email, phone, name, password_hash, profile_id, role_id)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7)
         RETURNING id, email, name`,
        [
          tenant.id,
          dto.email,
          dto.phone,
          dto.ownerName,
          passwordHash,
          profileIds.owner,
          ownerRole.id,
        ],
      );

      // 6. Seed bill number sequence
      await manager.query(
        `INSERT INTO bill_sequences (tenant_id, shop_id, prefix, last_number)
         VALUES ($1, $2, 'ORD', 0)`,
        [tenant.id, shop.id],
      );

      if (dto.seedDemoData ?? true) {
        await manager.query(this.buildLargeDemoSeedSql(tenant.id, tenant.slug, dto.email));
        this.logger.log(`Large demo data seeded for tenant: ${tenant.slug}`);
      }

      this.logger.log(`Tenant onboarded: ${tenant.slug} (id: ${tenant.id})`);

      // 7. Fire async events (welcome email, SMS)
      await this.eventBus.publish('tenant.onboarded', tenant.id, {
        tenantId: tenant.id,
        ownerEmail: dto.email,
        ownerPhone: dto.phone,
        shopName: dto.shopName,
        ownerName: dto.ownerName,
      });

      return {
        tenantId: tenant.id,
        slug: tenant.slug,
        shopId: shop.id,
        loginUrl: `https://${tenant.slug}.shoposphere.in`,
        userId: user.id,
      };
    });
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = generateSlug(name);
    let slug = base;
    let attempt = 0;

    while (true) {
      const [existing] = await this.dataSource.query(
        `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
        [slug],
      );
      if (!existing) return slug;
      attempt++;
      slug = `${base}-${attempt}`;
    }
  }

  private buildLargeDemoSeedSql(tenantId: string, tenantSlug: string, adminEmail: string): string {
    const sql = readFileSync(LARGE_DEMO_SEED_SQL_PATH, 'utf8');

    return [
      `SELECT set_config('app.current_tenant_id', '${this.escapeSqlLiteral(tenantId)}', false);`,
      sql
      .replace(/^BEGIN;\s*/m, '')
      .replace(/\s*COMMIT;\s*$/m, '')
      .replace("'admin@medplus.com'", `'${this.escapeSqlLiteral(adminEmail)}'`)
      .replace("'medplus'", `'${this.escapeSqlLiteral(tenantSlug)}'`),
    ].join('\n');
  }

  private escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }
}
