BEGIN;

DROP TABLE IF EXISTS tmp_medplus_context;
CREATE TEMP TABLE tmp_medplus_context AS
SELECT
  t.id AS tenant_id,
  s.id AS shop_id,
  u.id AS admin_user_id,
  u.password_hash AS admin_password_hash
FROM tenants t
JOIN shops s ON s.tenant_id = t.id
LEFT JOIN users u ON u.tenant_id = t.id AND u.email = 'admin@medplus.com'
WHERE t.slug = 'medplus'
LIMIT 1;

INSERT INTO categories (tenant_id, name, parent_id, level, icon, is_active)
SELECT
  ctx.tenant_id,
  seed.name,
  NULL,
  0,
  seed.icon,
  TRUE
FROM tmp_medplus_context ctx
JOIN (
  VALUES
    ('Analgesics', 'pill'),
    ('Cold & Cough', 'stethoscope'),
    ('Vitamins', 'sparkles'),
    ('Personal Care', 'droplets'),
    ('Devices', 'activity'),
    ('Wellness', 'heart'),
    ('Diabetes Care', 'test-tube'),
    ('First Aid', 'shield')
) AS seed(name, icon) ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM categories c
  WHERE c.tenant_id = ctx.tenant_id
    AND c.name = seed.name
);

INSERT INTO users (
  tenant_id,
  shop_id,
  email,
  phone,
  name,
  password_hash,
  profile_id,
  role_id,
  is_active,
  is_platform_admin
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  seed.email,
  seed.phone,
  seed.name,
  ctx.admin_password_hash,
  seed.profile_id,
  seed.role_id,
  TRUE,
  FALSE
FROM tmp_medplus_context ctx
JOIN (
  SELECT
    'manager@medplus.com'::varchar AS email,
    '9876543220'::varchar AS phone,
    'Store Manager'::varchar AS name,
    (SELECT id FROM profiles p WHERE p.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND p.name = 'Manager' LIMIT 1) AS profile_id,
    (SELECT id FROM roles r WHERE r.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND r.name = 'Manager' LIMIT 1) AS role_id
  UNION ALL
  SELECT
    'cashier@medplus.com',
    '9876543221',
    'Front Desk Cashier',
    (SELECT id FROM profiles p WHERE p.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND p.name = 'Cashier' LIMIT 1),
    (SELECT id FROM roles r WHERE r.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND r.name = 'Cashier' LIMIT 1)
  UNION ALL
  SELECT
    'stockist@medplus.com',
    '9876543222',
    'Inventory Stockist',
    (SELECT id FROM profiles p WHERE p.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND p.name = 'Stockist' LIMIT 1),
    (SELECT id FROM roles r WHERE r.tenant_id = (SELECT tenant_id FROM tmp_medplus_context) AND r.name = 'Stockist' LIMIT 1)
) AS seed
ON TRUE
WHERE ctx.admin_password_hash IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.tenant_id = ctx.tenant_id
      AND u.email = seed.email
  );

DROP TABLE IF EXISTS tmp_seed_products;
CREATE TEMP TABLE tmp_seed_products AS
WITH ctx AS (
  SELECT tenant_id, shop_id FROM tmp_medplus_context
),
series AS (
  SELECT generate_series(1, 56) AS n
),
category_map AS (
  SELECT
    c.id,
    c.name,
    ROW_NUMBER() OVER (ORDER BY c.name) AS rn
  FROM categories c
  WHERE c.tenant_id = (SELECT tenant_id FROM ctx)
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  CASE
    WHEN s.n BETWEEN 1 AND 7 THEN (SELECT id FROM category_map WHERE name = 'Analgesics')
    WHEN s.n BETWEEN 8 AND 14 THEN (SELECT id FROM category_map WHERE name = 'Cold & Cough')
    WHEN s.n BETWEEN 15 AND 21 THEN (SELECT id FROM category_map WHERE name = 'Vitamins')
    WHEN s.n BETWEEN 22 AND 28 THEN (SELECT id FROM category_map WHERE name = 'Personal Care')
    WHEN s.n BETWEEN 29 AND 35 THEN (SELECT id FROM category_map WHERE name = 'Devices')
    WHEN s.n BETWEEN 36 AND 42 THEN (SELECT id FROM category_map WHERE name = 'Wellness')
    WHEN s.n BETWEEN 43 AND 49 THEN (SELECT id FROM category_map WHERE name = 'Diabetes Care')
    ELSE (SELECT id FROM category_map WHERE name = 'First Aid')
  END AS category_id,
  CASE
    WHEN s.n BETWEEN 1 AND 7 THEN 'Pain Relief Tablet ' || LPAD(s.n::text, 2, '0')
    WHEN s.n BETWEEN 8 AND 14 THEN 'Cough Syrup Variant ' || LPAD((s.n - 7)::text, 2, '0')
    WHEN s.n BETWEEN 15 AND 21 THEN 'Vitamin Supplement ' || LPAD((s.n - 14)::text, 2, '0')
    WHEN s.n BETWEEN 22 AND 28 THEN 'Personal Care Item ' || LPAD((s.n - 21)::text, 2, '0')
    WHEN s.n BETWEEN 29 AND 35 THEN 'Diagnostic Device ' || LPAD((s.n - 28)::text, 2, '0')
    WHEN s.n BETWEEN 36 AND 42 THEN 'Wellness Product ' || LPAD((s.n - 35)::text, 2, '0')
    WHEN s.n BETWEEN 43 AND 49 THEN 'Glucose Care Product ' || LPAD((s.n - 42)::text, 2, '0')
    ELSE 'First Aid Product ' || LPAD((s.n - 49)::text, 2, '0')
  END AS name,
  'MPX-' || LPAD(s.n::text, 3, '0') AS sku,
  '89012346' || LPAD((2000 + s.n)::text, 5, '0') AS barcode,
  CASE
    WHEN s.n BETWEEN 1 AND 21 THEN 'strip'
    WHEN s.n BETWEEN 22 AND 28 THEN 'bottle'
    WHEN s.n BETWEEN 29 AND 35 THEN 'piece'
    WHEN s.n BETWEEN 36 AND 42 THEN 'pack'
    WHEN s.n BETWEEN 43 AND 49 THEN 'box'
    ELSE 'kit'
  END AS unit,
  ROUND(
    CASE
      WHEN s.n BETWEEN 1 AND 14 THEN 25 + s.n * 6.5
      WHEN s.n BETWEEN 15 AND 28 THEN 80 + s.n * 7.25
      WHEN s.n BETWEEN 29 AND 35 THEN 350 + s.n * 45
      WHEN s.n BETWEEN 36 AND 49 THEN 90 + s.n * 8.25
      ELSE 120 + s.n * 18
    END,
    2
  )::numeric AS mrp,
  ROUND(
    CASE
      WHEN s.n BETWEEN 1 AND 14 THEN 20 + s.n * 5.6
      WHEN s.n BETWEEN 15 AND 28 THEN 68 + s.n * 6.4
      WHEN s.n BETWEEN 29 AND 35 THEN 300 + s.n * 38
      WHEN s.n BETWEEN 36 AND 49 THEN 72 + s.n * 7.2
      ELSE 95 + s.n * 15
    END,
    2
  )::numeric AS selling_price,
  ROUND(
    CASE
      WHEN s.n BETWEEN 1 AND 14 THEN 12 + s.n * 4.1
      WHEN s.n BETWEEN 15 AND 28 THEN 42 + s.n * 4.5
      WHEN s.n BETWEEN 29 AND 35 THEN 225 + s.n * 28
      WHEN s.n BETWEEN 36 AND 49 THEN 48 + s.n * 4.2
      ELSE 68 + s.n * 10.5
    END,
    2
  )::numeric AS purchase_price,
  CASE
    WHEN s.n % 6 = 0 THEN 18::numeric
    WHEN s.n % 5 = 0 THEN 5::numeric
    ELSE 12::numeric
  END AS gst_rate
FROM series s
CROSS JOIN ctx;

INSERT INTO products (
  tenant_id,
  shop_id,
  category_id,
  name,
  sku,
  barcode,
  unit,
  mrp,
  selling_price,
  purchase_price,
  gst_rate,
  is_active,
  images,
  attributes,
  custom_fields
)
SELECT
  p.tenant_id,
  p.shop_id,
  p.category_id,
  p.name,
  p.sku,
  p.barcode,
  p.unit,
  p.mrp,
  p.selling_price,
  p.purchase_price,
  p.gst_rate,
  TRUE,
  '[]'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb
FROM tmp_seed_products p
WHERE NOT EXISTS (
  SELECT 1
  FROM products existing
  WHERE existing.tenant_id = p.tenant_id
    AND existing.sku = p.sku
);

INSERT INTO customers (
  tenant_id,
  name,
  phone,
  email,
  loyalty_points,
  credit_balance,
  tags,
  custom_fields
)
SELECT
  ctx.tenant_id,
  'Customer ' || LPAD(gs::text, 2, '0'),
  '980000' || LPAD(gs::text, 4, '0'),
  'customer' || gs || '@medplus.demo',
  (gs * 3) % 80,
  CASE WHEN gs % 8 = 0 THEN (gs * 25)::numeric ELSE 0::numeric END,
  CASE
    WHEN gs % 5 = 0 THEN ARRAY['vip', 'repeat']::text[]
    WHEN gs % 3 = 0 THEN ARRAY['wellness']::text[]
    WHEN gs % 2 = 0 THEN ARRAY['family']::text[]
    ELSE ARRAY['regular']::text[]
  END,
  jsonb_build_object('source', 'demo-seed')
FROM tmp_medplus_context ctx
CROSS JOIN generate_series(1, 35) gs
WHERE NOT EXISTS (
  SELECT 1
  FROM customers c
  WHERE c.tenant_id = ctx.tenant_id
    AND c.phone = '980000' || LPAD(gs::text, 4, '0')
);

INSERT INTO suppliers (
  tenant_id,
  name,
  gst_number,
  phone,
  email,
  address,
  payment_terms,
  credit_limit,
  custom_fields,
  is_active
)
SELECT
  ctx.tenant_id,
  'Vendor Partner ' || LPAD(gs::text, 2, '0'),
  '27AADCV' || LPAD(gs::text, 4, '0') || 'A1Z5',
  '992200' || LPAD(gs::text, 4, '0'),
  'vendor' || gs || '@medplus.demo',
  jsonb_build_object(
    'line1', gs || ' Supplier Lane',
    'city', CASE WHEN gs % 4 = 0 THEN 'Pune' WHEN gs % 3 = 0 THEN 'Nashik' ELSE 'Mumbai' END,
    'state', 'Maharashtra',
    'pincode', '4000' || LPAD(gs::text, 2, '0')
  ),
  CASE WHEN gs % 3 = 0 THEN 21 ELSE 30 END,
  (15000 + gs * 4000)::numeric,
  jsonb_build_object('rating', 3 + (gs % 3)),
  TRUE
FROM tmp_medplus_context ctx
CROSS JOIN generate_series(1, 9) gs
WHERE NOT EXISTS (
  SELECT 1
  FROM suppliers s
  WHERE s.tenant_id = ctx.tenant_id
    AND s.name = 'Vendor Partner ' || LPAD(gs::text, 2, '0')
);

DROP TABLE IF EXISTS tmp_product_index;
CREATE TEMP TABLE tmp_product_index AS
SELECT
  p.id,
  p.tenant_id,
  p.shop_id,
  p.name,
  p.sku,
  p.unit,
  p.selling_price,
  p.purchase_price,
  p.gst_rate,
  ROW_NUMBER() OVER (ORDER BY p.sku) AS rn
FROM products p
JOIN tmp_medplus_context ctx
  ON ctx.tenant_id = p.tenant_id
 AND ctx.shop_id = p.shop_id
WHERE p.is_active = TRUE;

DROP TABLE IF EXISTS tmp_supplier_index;
CREATE TEMP TABLE tmp_supplier_index AS
SELECT
  s.id,
  ROW_NUMBER() OVER (ORDER BY s.name) AS rn
FROM suppliers s
JOIN tmp_medplus_context ctx ON ctx.tenant_id = s.tenant_id
WHERE s.is_active = TRUE;

DROP TABLE IF EXISTS tmp_customer_index;
CREATE TEMP TABLE tmp_customer_index AS
SELECT
  c.id,
  c.phone,
  ROW_NUMBER() OVER (ORDER BY c.name, c.phone) AS rn
FROM customers c
JOIN tmp_medplus_context ctx ON ctx.tenant_id = c.tenant_id;

DROP TABLE IF EXISTS tmp_base_inventory;
CREATE TEMP TABLE tmp_base_inventory AS
SELECT
  p.id AS product_id,
  (40 + ((p.rn - 1) % 18) * 4 + CASE WHEN p.unit IN ('piece', 'kit') THEN 8 ELSE 16 END)::numeric AS base_qty,
  CASE
    WHEN p.unit IN ('piece', 'kit') AND p.selling_price > 1000 THEN 2::numeric
    WHEN p.unit IN ('piece', 'kit') THEN 4::numeric
    ELSE 8::numeric
  END AS reorder_level,
  CASE
    WHEN p.unit IN ('piece', 'kit') AND p.selling_price > 1000 THEN 6::numeric
    WHEN p.unit IN ('piece', 'kit') THEN 12::numeric
    ELSE 24::numeric
  END AS reorder_qty
FROM tmp_product_index p;

INSERT INTO inventory (
  tenant_id,
  shop_id,
  product_id,
  quantity,
  reserved_qty,
  reorder_level,
  reorder_qty,
  batch_details
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  bi.product_id,
  bi.base_qty,
  0,
  bi.reorder_level,
  bi.reorder_qty,
  '[]'::jsonb
FROM tmp_medplus_context ctx
JOIN tmp_base_inventory bi ON TRUE
ON CONFLICT (tenant_id, shop_id, product_id)
DO UPDATE SET
  reorder_level = EXCLUDED.reorder_level,
  reorder_qty = EXCLUDED.reorder_qty,
  batch_details = EXCLUDED.batch_details,
  updated_at = NOW();

DROP TABLE IF EXISTS tmp_po_seed;
CREATE TEMP TABLE tmp_po_seed AS
SELECT
  gs AS seed,
  'PO-2026-' || LPAD((3000 + gs)::text, 5, '0') AS po_number,
  CASE
    WHEN gs % 5 = 0 THEN 'sent'
    WHEN gs % 7 = 0 THEN 'cancelled'
    ELSE 'received'
  END AS status,
  CURRENT_DATE - ((gs * 2) % 75) AS expected_date,
  'Demo replenishment cycle ' || gs AS notes,
  ((gs - 1) % (SELECT COUNT(*) FROM tmp_supplier_index) + 1) AS supplier_rn
FROM generate_series(1, 18) gs;

INSERT INTO purchase_orders (
  tenant_id,
  shop_id,
  supplier_id,
  po_number,
  status,
  subtotal,
  tax_amount,
  total,
  expected_date,
  notes
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  supplier.id,
  seed.po_number,
  seed.status,
  0,
  0,
  0,
  seed.expected_date,
  seed.notes
FROM tmp_medplus_context ctx
JOIN tmp_po_seed seed ON TRUE
JOIN tmp_supplier_index supplier ON supplier.rn = seed.supplier_rn
WHERE NOT EXISTS (
  SELECT 1
  FROM purchase_orders po
  WHERE po.tenant_id = ctx.tenant_id
    AND po.shop_id = ctx.shop_id
    AND po.po_number = seed.po_number
);

INSERT INTO purchase_order_items (
  tenant_id,
  purchase_order_id,
  product_id,
  quantity,
  received_qty,
  unit_price,
  gst_rate,
  total
)
SELECT
  ctx.tenant_id,
  po.id,
  product.id,
  calc.qty,
  CASE WHEN seed.status = 'received' THEN calc.qty WHEN seed.status = 'sent' THEN calc.qty / 2 ELSE 0 END,
  product.purchase_price,
  product.gst_rate,
  ROUND((calc.qty * product.purchase_price) + ((calc.qty * product.purchase_price) * product.gst_rate / 100), 2)
FROM tmp_medplus_context ctx
JOIN tmp_po_seed seed ON TRUE
JOIN purchase_orders po
  ON po.tenant_id = ctx.tenant_id
 AND po.shop_id = ctx.shop_id
 AND po.po_number = seed.po_number
JOIN generate_series(1, 4) off(idx) ON TRUE
JOIN tmp_product_index product
  ON product.rn = (((seed.seed * 4) + off.idx * 5) % (SELECT COUNT(*) FROM tmp_product_index)) + 1
CROSS JOIN LATERAL (
  SELECT (6 + ((seed.seed + off.idx) % 10))::numeric AS qty
) calc
WHERE NOT EXISTS (
  SELECT 1
  FROM purchase_order_items poi
  WHERE poi.purchase_order_id = po.id
    AND poi.product_id = product.id
);

UPDATE purchase_orders po
SET
  subtotal = agg.subtotal,
  tax_amount = agg.tax_amount,
  total = agg.total,
  updated_at = NOW()
FROM (
  SELECT
    purchase_order_id,
    ROUND(SUM(quantity * unit_price), 2) AS subtotal,
    ROUND(SUM((quantity * unit_price) * gst_rate / 100), 2) AS tax_amount,
    ROUND(SUM(total), 2) AS total
  FROM purchase_order_items
  GROUP BY purchase_order_id
) agg
WHERE po.id = agg.purchase_order_id
  AND po.tenant_id = (SELECT tenant_id FROM tmp_medplus_context);

INSERT INTO stock_movements (
  tenant_id,
  shop_id,
  product_id,
  type,
  quantity,
  reference_id,
  reference_type,
  notes,
  created_by
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  poi.product_id,
  'purchase',
  poi.received_qty,
  po.id,
  'purchase_order',
  'Seeded purchase order receipt',
  ctx.admin_user_id
FROM tmp_medplus_context ctx
JOIN purchase_orders po
  ON po.tenant_id = ctx.tenant_id
 AND po.shop_id = ctx.shop_id
JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
WHERE po.po_number LIKE 'PO-2026-03%'
  AND po.status = 'received'
  AND poi.received_qty > 0
  AND NOT EXISTS (
    SELECT 1
    FROM stock_movements sm
    WHERE sm.reference_id = po.id
      AND sm.reference_type = 'purchase_order'
      AND sm.product_id = poi.product_id
      AND sm.type = 'purchase'
  );

DROP TABLE IF EXISTS tmp_order_seed;
CREATE TEMP TABLE tmp_order_seed AS
SELECT
  gs AS seed,
  'ORD-2026-' || LPAD((10000 + gs)::text, 5, '0') AS bill_number,
  NOW() - ((gs % 45) || ' days')::interval - ((gs % 9) || ' hours')::interval AS created_at,
  CASE
    WHEN gs % 9 = 0 THEN 'credit'
    WHEN gs % 3 = 0 THEN 'upi'
    WHEN gs % 4 = 0 THEN 'card'
    ELSE 'cash'
  END AS payment_method,
  CASE
    WHEN gs % 9 = 0 THEN 'Doctor clinic monthly credit'
    WHEN gs % 5 = 0 THEN 'Family basket order'
    WHEN gs % 2 = 0 THEN 'Evening counter sale'
    ELSE 'Daily pharmacy order'
  END AS notes,
  ((gs - 1) % (SELECT COUNT(*) FROM tmp_customer_index) + 1) AS customer_rn
FROM generate_series(1, 60) gs;

INSERT INTO orders (
  tenant_id,
  shop_id,
  bill_number,
  customer_id,
  status,
  type,
  subtotal,
  discount_amount,
  tax_amount,
  total,
  payment_status,
  notes,
  created_by,
  metadata,
  created_at,
  updated_at
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  seed.bill_number,
  customer.id,
  'confirmed',
  'sale',
  0,
  0,
  0,
  0,
  CASE WHEN seed.payment_method = 'credit' THEN 'pending' ELSE 'paid' END,
  seed.notes,
  ctx.admin_user_id,
  '{}'::jsonb,
  seed.created_at,
  seed.created_at
FROM tmp_medplus_context ctx
JOIN tmp_order_seed seed ON TRUE
JOIN tmp_customer_index customer ON customer.rn = seed.customer_rn
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.tenant_id = ctx.tenant_id
    AND o.shop_id = ctx.shop_id
    AND o.bill_number = seed.bill_number
);

INSERT INTO order_items (
  tenant_id,
  order_id,
  product_id,
  quantity,
  unit_price,
  discount,
  gst_rate,
  gst_amount,
  total,
  batch_no
)
SELECT
  ctx.tenant_id,
  o.id,
  product.id,
  calc.qty,
  product.selling_price,
  calc.discount,
  product.gst_rate,
  ROUND(((calc.qty * product.selling_price - calc.discount) * product.gst_rate / 100), 2),
  ROUND((calc.qty * product.selling_price - calc.discount) + ((calc.qty * product.selling_price - calc.discount) * product.gst_rate / 100), 2),
  NULL
FROM tmp_medplus_context ctx
JOIN tmp_order_seed seed ON TRUE
JOIN orders o
  ON o.tenant_id = ctx.tenant_id
 AND o.shop_id = ctx.shop_id
 AND o.bill_number = seed.bill_number
JOIN generate_series(1, 3) off(idx) ON TRUE
JOIN tmp_product_index product
  ON product.rn = (((seed.seed * 5) + off.idx * 7) % (SELECT COUNT(*) FROM tmp_product_index)) + 1
CROSS JOIN LATERAL (
  SELECT
    (1 + ((seed.seed + off.idx) % 4))::numeric AS qty,
    CASE
      WHEN off.idx = 3 AND seed.seed % 5 = 0 THEN ROUND(product.selling_price * 0.08, 2)
      ELSE 0::numeric
    END AS discount
) calc
WHERE NOT EXISTS (
  SELECT 1
  FROM order_items oi
  WHERE oi.order_id = o.id
    AND oi.product_id = product.id
);

WITH order_totals AS (
  SELECT
    oi.order_id,
    ROUND(SUM(oi.quantity * oi.unit_price), 2) AS subtotal,
    ROUND(SUM(oi.discount), 2) AS discount_amount,
    ROUND(SUM(oi.gst_amount), 2) AS tax_amount,
    ROUND(SUM(oi.total), 2) AS total
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = (SELECT tenant_id FROM tmp_medplus_context)
    AND o.bill_number LIKE 'ORD-2026-1%'
  GROUP BY oi.order_id
),
order_gst_lines AS (
  SELECT
    oi.order_id,
    oi.gst_rate::text || '%' AS rate_label,
    ROUND(SUM(oi.quantity * oi.unit_price - oi.discount), 2) AS taxable_amount,
    ROUND(SUM(oi.gst_amount), 2) AS tax_component
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.tenant_id = (SELECT tenant_id FROM tmp_medplus_context)
    AND o.bill_number LIKE 'ORD-2026-1%'
  GROUP BY oi.order_id, oi.gst_rate
),
order_gst AS (
  SELECT
    ogl.order_id,
    jsonb_object_agg(
      ogl.rate_label,
      jsonb_build_object(
        'taxable', ogl.taxable_amount,
        'tax', ogl.tax_component
      )
    ) AS gst_breakdown
  FROM order_gst_lines ogl
  GROUP BY ogl.order_id
)
UPDATE orders o
SET
  subtotal = totals.subtotal,
  discount_amount = totals.discount_amount,
  tax_amount = totals.tax_amount,
  total = totals.total,
  metadata = jsonb_build_object('gstBreakdown', gst.gst_breakdown),
  payment_status = CASE
    WHEN EXISTS (
      SELECT 1
      FROM tmp_order_seed seed
      WHERE seed.bill_number = o.bill_number
        AND seed.payment_method = 'credit'
    ) THEN 'pending'
    ELSE 'paid'
  END
FROM order_totals totals
JOIN order_gst gst ON gst.order_id = totals.order_id
WHERE o.id = totals.order_id;

INSERT INTO payments (
  tenant_id,
  order_id,
  amount,
  method,
  reference,
  status,
  created_at
)
SELECT
  ctx.tenant_id,
  o.id,
  o.total,
  seed.payment_method,
  CASE
    WHEN seed.payment_method = 'upi' THEN 'UPI-' || LPAD(seed.seed::text, 6, '0')
    WHEN seed.payment_method = 'card' THEN 'CARD-' || LPAD((4400 + seed.seed)::text, 4, '0')
    ELSE NULL
  END,
  'success',
  o.created_at
FROM tmp_medplus_context ctx
JOIN tmp_order_seed seed ON TRUE
JOIN orders o
  ON o.tenant_id = ctx.tenant_id
 AND o.shop_id = ctx.shop_id
 AND o.bill_number = seed.bill_number
WHERE seed.payment_method <> 'credit'
  AND NOT EXISTS (
    SELECT 1
    FROM payments p
    WHERE p.order_id = o.id
  );

INSERT INTO stock_movements (
  tenant_id,
  shop_id,
  product_id,
  type,
  quantity,
  reference_id,
  reference_type,
  notes,
  created_by,
  created_at
)
SELECT
  ctx.tenant_id,
  ctx.shop_id,
  oi.product_id,
  'sale',
  -oi.quantity,
  o.id,
  'order',
  'Seeded sale order',
  ctx.admin_user_id,
  o.created_at
FROM tmp_medplus_context ctx
JOIN orders o
  ON o.tenant_id = ctx.tenant_id
 AND o.shop_id = ctx.shop_id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.bill_number LIKE 'ORD-2026-1%'
  AND NOT EXISTS (
    SELECT 1
    FROM stock_movements sm
    WHERE sm.reference_id = o.id
      AND sm.reference_type = 'order'
      AND sm.product_id = oi.product_id
      AND sm.type = 'sale'
  );

WITH purchase_totals AS (
  SELECT
    product_id,
    COALESCE(SUM(quantity), 0) AS total_qty
  FROM stock_movements
  WHERE tenant_id = (SELECT tenant_id FROM tmp_medplus_context)
    AND shop_id = (SELECT shop_id FROM tmp_medplus_context)
    AND type = 'purchase'
  GROUP BY product_id
),
sale_totals AS (
  SELECT
    product_id,
    COALESCE(-SUM(quantity), 0) AS total_qty
  FROM stock_movements
  WHERE tenant_id = (SELECT tenant_id FROM tmp_medplus_context)
    AND shop_id = (SELECT shop_id FROM tmp_medplus_context)
    AND type = 'sale'
  GROUP BY product_id
)
UPDATE inventory i
SET
  quantity = GREATEST(
    0,
    bi.base_qty
      + COALESCE(pt.total_qty, 0)
      - COALESCE(st.total_qty, 0)
  ),
  reserved_qty = 0,
  reorder_level = bi.reorder_level,
  reorder_qty = bi.reorder_qty,
  updated_at = NOW()
FROM tmp_base_inventory bi
LEFT JOIN purchase_totals pt ON pt.product_id = bi.product_id
LEFT JOIN sale_totals st ON st.product_id = bi.product_id
WHERE i.tenant_id = (SELECT tenant_id FROM tmp_medplus_context)
  AND i.shop_id = (SELECT shop_id FROM tmp_medplus_context)
  AND i.product_id = bi.product_id;

UPDATE bill_sequences bs
SET last_number = GREATEST(bs.last_number, 10060)
FROM tmp_medplus_context ctx
WHERE bs.tenant_id = ctx.tenant_id
  AND bs.shop_id = ctx.shop_id;

COMMIT;
