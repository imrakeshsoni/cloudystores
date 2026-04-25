-- =============================================================
-- MIGRATION 001: Initial Schema
-- ShopOS — Multi-tenant SaaS for Indian shop owners
-- =============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- PLATFORM LEVEL
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  plan            VARCHAR(50) NOT NULL DEFAULT 'starter',
  status          VARCHAR(50) NOT NULL DEFAULT 'active',
  settings        JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL,
  price_monthly   DECIMAL(10,2) NOT NULL,
  price_yearly    DECIMAL(10,2),
  max_users       INT,
  max_products    INT,
  max_shops       INT NOT NULL DEFAULT 1,
  features        JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  razorpay_plan_id VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  plan_id              UUID NOT NULL REFERENCES subscription_plans(id),
  razorpay_sub_id      VARCHAR(255),
  status               VARCHAR(50) NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  trial_ends_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenant_subs_tenant ON tenant_subscriptions(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- SHOPS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(100),
  gst_number      VARCHAR(20),
  phone           VARCHAR(20),
  address         JSONB DEFAULT '{}',
  settings        JSONB DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shops_tenant ON shops(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- PROFILES & ROLES (RBAC)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  permissions     JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);

CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(100) NOT NULL,
  parent_role_id  UUID REFERENCES roles(id),
  level           INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  shop_id             UUID REFERENCES shops(id),
  cognito_sub         VARCHAR(255) UNIQUE,
  email               VARCHAR(255) NOT NULL,
  phone               VARCHAR(20),
  name                VARCHAR(255) NOT NULL,
  password_hash       VARCHAR(255),
  profile_id          UUID REFERENCES profiles(id),
  role_id             UUID REFERENCES roles(id),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  is_platform_admin   BOOLEAN NOT NULL DEFAULT false,
  last_login          TIMESTAMPTZ,
  refresh_token_hash  VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);

-- ─────────────────────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        VARCHAR(255) NOT NULL,
  parent_id   UUID REFERENCES categories(id),
  level       INT NOT NULL DEFAULT 0,
  icon        VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_tenant ON categories(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  category_id     UUID REFERENCES categories(id),
  name            VARCHAR(500) NOT NULL,
  sku             VARCHAR(100),
  barcode         VARCHAR(100),
  hsn_code        VARCHAR(20),
  unit            VARCHAR(50),
  mrp             DECIMAL(10,2),
  selling_price   DECIMAL(10,2),
  purchase_price  DECIMAL(10,2),
  gst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  images          JSONB NOT NULL DEFAULT '[]',
  attributes      JSONB NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_products_sku ON products(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_category ON products(tenant_id, category_id);
-- Full-text search
CREATE INDEX idx_products_search ON products USING GIN(to_tsvector('english', name));
-- Trigram index for ILIKE queries
CREATE INDEX idx_products_name_trgm ON products USING GIN(name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- INVENTORY
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        DECIMAL(10,3) NOT NULL DEFAULT 0,
  reserved_qty    DECIMAL(10,3) NOT NULL DEFAULT 0,
  reorder_level   DECIMAL(10,3) NOT NULL DEFAULT 0,
  reorder_qty     DECIMAL(10,3) NOT NULL DEFAULT 0,
  location        VARCHAR(100),
  batch_details   JSONB NOT NULL DEFAULT '[]',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, shop_id, product_id)
);

CREATE INDEX idx_inventory_tenant_shop ON inventory(tenant_id, shop_id);
CREATE INDEX idx_inventory_product ON inventory(tenant_id, product_id);
-- Index for low-stock queries
CREATE INDEX idx_inventory_low_stock ON inventory(tenant_id, shop_id)
  WHERE reorder_level > 0 AND quantity <= reorder_level;

CREATE TABLE IF NOT EXISTS stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  type            VARCHAR(50) NOT NULL,
  quantity        DECIMAL(10,3) NOT NULL,
  reference_id    UUID,
  reference_type  VARCHAR(50),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_product ON stock_movements(tenant_id, product_id, created_at DESC);
CREATE INDEX idx_stock_movements_shop ON stock_movements(tenant_id, shop_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  loyalty_points  INT NOT NULL DEFAULT 0,
  credit_balance  DECIMAL(10,2) NOT NULL DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customers_phone ON customers(tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_customers_tenant ON customers(tenant_id);

-- ─────────────────────────────────────────────────────────────
-- SUPPLIERS & PURCHASE ORDERS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  gst_number      VARCHAR(20),
  phone           VARCHAR(20),
  email           VARCHAR(255),
  address         JSONB DEFAULT '{}',
  payment_terms   INT NOT NULL DEFAULT 30,
  credit_limit    DECIMAL(12,2),
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  supplier_id     UUID NOT NULL REFERENCES suppliers(id),
  po_number       VARCHAR(100) NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'draft',
  subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  total           DECIMAL(12,2) NOT NULL DEFAULT 0,
  expected_date   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_tenant ON purchase_orders(tenant_id, shop_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  quantity            DECIMAL(10,3) NOT NULL,
  received_qty        DECIMAL(10,3) NOT NULL DEFAULT 0,
  unit_price          DECIMAL(10,2) NOT NULL,
  gst_rate            DECIMAL(5,2) NOT NULL DEFAULT 0,
  total               DECIMAL(10,2) NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- ORDERS / BILLS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID NOT NULL REFERENCES shops(id),
  bill_number     VARCHAR(50) NOT NULL,
  customer_id     UUID REFERENCES customers(id),
  status          VARCHAR(50) NOT NULL DEFAULT 'confirmed',
  type            VARCHAR(50) NOT NULL DEFAULT 'sale',
  subtotal        DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  total           DECIMAL(12,2) NOT NULL,
  payment_status  VARCHAR(50) NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, shop_id, bill_number)
);

CREATE INDEX idx_orders_tenant_shop_date ON orders(tenant_id, shop_id, created_at DESC);
CREATE INDEX idx_orders_customer ON orders(tenant_id, customer_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        DECIMAL(10,3) NOT NULL,
  unit_price      DECIMAL(10,2) NOT NULL,
  discount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  gst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
  gst_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL,
  batch_no        VARCHAR(100),
  manufacture_date DATE,
  expiry_date      DATE
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(tenant_id, product_id);

CREATE TABLE IF NOT EXISTS payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  order_id    UUID REFERENCES orders(id),
  amount      DECIMAL(12,2) NOT NULL,
  method      VARCHAR(50) NOT NULL,
  reference   VARCHAR(255),
  status      VARCHAR(50) NOT NULL DEFAULT 'success',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);

-- Atomic bill number sequences per tenant/shop
CREATE TABLE IF NOT EXISTS bill_sequences (
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  shop_id      UUID NOT NULL REFERENCES shops(id),
  prefix       VARCHAR(20) NOT NULL DEFAULT 'ORD',
  last_number  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, shop_id)
);

-- ─────────────────────────────────────────────────────────────
-- CUSTOM FIELDS
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  object_type     VARCHAR(100) NOT NULL,
  field_name      VARCHAR(100) NOT NULL,
  field_label     VARCHAR(255) NOT NULL,
  field_type      VARCHAR(50) NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  options         JSONB,
  default_value   TEXT,
  display_order   INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, object_type, field_name)
);

CREATE INDEX idx_custom_fields_tenant_type ON custom_field_definitions(tenant_id, object_type);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (backstop isolation)
-- ─────────────────────────────────────────────────────────────

-- Enable RLS on all tenant-scoped tables
ALTER TABLE shops               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

-- RLS policy: app sets session variable, RLS enforces it
CREATE POLICY tenant_isolation_shops ON shops
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_inventory ON inventory
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_orders ON orders
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_order_items ON order_items
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_payments ON payments
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_categories ON categories
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_suppliers ON suppliers
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_stock ON stock_movements
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_custom_fields ON custom_field_definitions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_profiles ON profiles
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_roles ON roles
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_bill_sequences ON bill_sequences
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_purchase_orders ON purchase_orders
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
CREATE POLICY tenant_isolation_purchase_order_items ON purchase_order_items
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ─────────────────────────────────────────────────────────────
-- SEED SUBSCRIPTION PLANS
-- ─────────────────────────────────────────────────────────────

INSERT INTO subscription_plans (name, price_monthly, price_yearly, max_users, max_products, max_shops, features) VALUES
  ('Starter',    299,  2990,  2,   500,   1, '{"pos":true,"inventory":true,"basic_reports":true,"gst_reports":false,"api_access":false,"multi_shop":false,"custom_fields":false}'),
  ('Growth',     799,  7990,  10,  5000,  3, '{"pos":true,"inventory":true,"basic_reports":true,"gst_reports":true,"api_access":true,"multi_shop":true,"custom_fields":false}'),
  ('Enterprise', 2499, 24990, -1,  -1,    -1,'{"pos":true,"inventory":true,"basic_reports":true,"gst_reports":true,"api_access":true,"multi_shop":true,"custom_fields":true,"white_label":true,"dedicated_support":true}')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','shops','profiles','roles','users','categories',
    'products','customers','suppliers','purchase_orders','orders'] LOOP
    EXECUTE format('CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t);
  END LOOP;
END;
$$;

COMMIT;
