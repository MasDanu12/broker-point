-- =========================================================
-- BROKER POINT
-- DATABASE SCHEMA
-- Cloudflare D1 / SQLite
-- Version 1.0
-- =========================================================

PRAGMA foreign_keys = ON;

-- =========================================================
-- 01. USERS & SETTINGS
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    old_data TEXT,
    new_data TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- =========================================================
-- 02. FACTORIES
-- =========================================================

CREATE TABLE IF NOT EXISTS factories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    location TEXT,
    joined_at TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- 03. PRODUCT MODELS & COLORS
-- =========================================================

CREATE TABLE IF NOT EXISTS product_models (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_colors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color_code TEXT,
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS rate_cards (
    id TEXT PRIMARY KEY,
    factory_id TEXT,
    worker_id TEXT,
    model_id TEXT NOT NULL,
    factory_rate INTEGER NOT NULL DEFAULT 0,
    worker_rate INTEGER NOT NULL DEFAULT 0,
    effective_from TEXT NOT NULL,
    effective_until TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factory_id) REFERENCES factories(id),
    FOREIGN KEY (worker_id) REFERENCES workers(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    CHECK (factory_rate >= 0),
    CHECK (worker_rate >= 0)
);

-- =========================================================
-- 04. FACTORY ORDERS
-- =========================================================

CREATE TABLE IF NOT EXISTS factory_orders (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    factory_id TEXT NOT NULL,
    order_date TEXT NOT NULL,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factory_id) REFERENCES factories(id)
);

CREATE TABLE IF NOT EXISTS factory_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    color_id TEXT,
    ordered_qty INTEGER NOT NULL DEFAULT 0,
    factory_rate INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES factory_orders(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    FOREIGN KEY (color_id) REFERENCES product_colors(id),
    CHECK (ordered_qty >= 0),
    CHECK (factory_rate >= 0)
);

-- =========================================================
-- 05. MATERIAL RECEIPTS
-- =========================================================

CREATE TABLE IF NOT EXISTS material_receipts (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    factory_id TEXT NOT NULL,
    order_id TEXT,
    receipt_date TEXT NOT NULL,
    received_by TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factory_id) REFERENCES factories(id),
    FOREIGN KEY (order_id) REFERENCES factory_orders(id)
);

CREATE TABLE IF NOT EXISTS material_receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL,
    order_item_id TEXT,
    model_id TEXT NOT NULL,
    color_id TEXT,
    roll_count INTEGER NOT NULL DEFAULT 0,
    received_qty INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (receipt_id) REFERENCES material_receipts(id),
    FOREIGN KEY (order_item_id) REFERENCES factory_order_items(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    FOREIGN KEY (color_id) REFERENCES product_colors(id),
    CHECK (roll_count >= 0),
    CHECK (received_qty >= 0)
);

-- =========================================================
-- 06. WORK ALLOCATIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS work_allocations (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    allocation_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS work_allocation_items (
    id TEXT PRIMARY KEY,
    allocation_id TEXT NOT NULL,
    material_item_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    color_id TEXT,
    allocated_qty INTEGER NOT NULL,
    worker_rate INTEGER NOT NULL DEFAULT 0,
    factory_rate INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (allocation_id) REFERENCES work_allocations(id),
    FOREIGN KEY (material_item_id) REFERENCES material_receipt_items(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    FOREIGN KEY (color_id) REFERENCES product_colors(id),
    CHECK (allocated_qty > 0),
    CHECK (worker_rate >= 0),
    CHECK (factory_rate >= 0)
);

-- =========================================================
-- 07. SEWING OUTPUTS
-- =========================================================

CREATE TABLE IF NOT EXISTS sewing_outputs (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    output_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS sewing_output_items (
    id TEXT PRIMARY KEY,
    output_id TEXT NOT NULL,
    allocation_item_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    color_id TEXT,
    good_qty INTEGER NOT NULL DEFAULT 0,
    defective_qty INTEGER NOT NULL DEFAULT 0,
    repair_qty INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (output_id) REFERENCES sewing_outputs(id),
    FOREIGN KEY (allocation_item_id) REFERENCES work_allocation_items(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    FOREIGN KEY (color_id) REFERENCES product_colors(id),
    CHECK (good_qty >= 0),
    CHECK (defective_qty >= 0),
    CHECK (repair_qty >= 0)
);

-- =========================================================
-- 08. FACTORY DELIVERIES
-- =========================================================

CREATE TABLE IF NOT EXISTS factory_deliveries (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    factory_id TEXT NOT NULL,
    delivery_date TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factory_id) REFERENCES factories(id)
);

CREATE TABLE IF NOT EXISTS factory_delivery_items (
    id TEXT PRIMARY KEY,
    delivery_id TEXT NOT NULL,
    output_item_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    color_id TEXT,
    delivered_qty INTEGER NOT NULL,
    factory_rate INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (delivery_id) REFERENCES factory_deliveries(id),
    FOREIGN KEY (output_item_id) REFERENCES sewing_output_items(id),
    FOREIGN KEY (model_id) REFERENCES product_models(id),
    FOREIGN KEY (color_id) REFERENCES product_colors(id),
    CHECK (delivered_qty > 0),
    CHECK (factory_rate >= 0)
);

-- =========================================================
-- 09. FACTORY INSPECTIONS
-- =========================================================

CREATE TABLE IF NOT EXISTS factory_inspections (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    delivery_id TEXT NOT NULL,
    inspection_date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_id) REFERENCES factory_deliveries(id)
);

CREATE TABLE IF NOT EXISTS factory_inspection_items (
    id TEXT PRIMARY KEY,
    inspection_id TEXT NOT NULL,
    delivery_item_id TEXT NOT NULL,
    accepted_qty INTEGER NOT NULL DEFAULT 0,
    rejected_qty INTEGER NOT NULL DEFAULT 0,
    repair_qty INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    FOREIGN KEY (inspection_id) REFERENCES factory_inspections(id),
    FOREIGN KEY (delivery_item_id) REFERENCES factory_delivery_items(id),
    CHECK (accepted_qty >= 0),
    CHECK (rejected_qty >= 0),
    CHECK (repair_qty >= 0)
);

-- =========================================================
-- 10. REPAIR CASES
-- =========================================================

CREATE TABLE IF NOT EXISTS repair_cases (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    inspection_item_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    repair_qty INTEGER NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TEXT,
    FOREIGN KEY (inspection_item_id) REFERENCES factory_inspection_items(id),
    FOREIGN KEY (worker_id) REFERENCES workers(id),
    CHECK (repair_qty > 0)
);

CREATE TABLE IF NOT EXISTS repair_history (
    id TEXT PRIMARY KEY,
    repair_case_id TEXT NOT NULL,
    action TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (repair_case_id) REFERENCES repair_cases(id),
    CHECK (quantity >= 0)
);

-- =========================================================
-- 11. FACTORY PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS factory_payments (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    factory_id TEXT NOT NULL,
    delivery_id TEXT,
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factory_id) REFERENCES factories(id),
    FOREIGN KEY (delivery_id) REFERENCES factory_deliveries(id),
    CHECK (amount > 0)
);

-- =========================================================
-- 12. PAYROLL
-- =========================================================

CREATE TABLE IF NOT EXISTS payroll_periods (
    id TEXT PRIMARY KEY,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payroll_items (
    id TEXT PRIMARY KEY,
    payroll_period_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    output_item_id TEXT NOT NULL,
    eligible_qty INTEGER NOT NULL,
    worker_rate INTEGER NOT NULL,
    gross_amount INTEGER NOT NULL,
    notes TEXT,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id),
    FOREIGN KEY (worker_id) REFERENCES workers(id),
    FOREIGN KEY (output_item_id) REFERENCES sewing_output_items(id),
    CHECK (eligible_qty >= 0),
    CHECK (worker_rate >= 0),
    CHECK (gross_amount >= 0),
    UNIQUE (payroll_period_id, output_item_id)
);

CREATE TABLE IF NOT EXISTS worker_payments (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    payroll_period_id TEXT,
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id),
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id),
    CHECK (amount > 0)
);

-- =========================================================
-- 13. WORKER BON
-- =========================================================

CREATE TABLE IF NOT EXISTS worker_bon (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    worker_id TEXT NOT NULL,
    bon_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount INTEGER NOT NULL,
    remaining_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'unpaid',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES workers(id),
    CHECK (amount > 0),
    CHECK (remaining_amount >= 0)
);

CREATE TABLE IF NOT EXISTS worker_bon_payments (
    id TEXT PRIMARY KEY,
    bon_id TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payroll_period_id TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bon_id) REFERENCES worker_bon(id),
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id),
    CHECK (amount > 0)
);

-- =========================================================
-- 14. BUSINESS EXPENSES
-- =========================================================

CREATE TABLE IF NOT EXISTS business_expenses (
    id TEXT PRIMARY KEY,
    document_no TEXT NOT NULL UNIQUE,
    expense_date TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount INTEGER NOT NULL,
    recipient TEXT,
    evidence_url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (amount > 0)
);

-- =========================================================
-- 15. INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_orders_factory
ON factory_orders(factory_id);

CREATE INDEX IF NOT EXISTS idx_receipts_factory
ON material_receipts(factory_id);

CREATE INDEX IF NOT EXISTS idx_receipt_items_model
ON material_receipt_items(model_id, color_id);

CREATE INDEX IF NOT EXISTS idx_allocations_worker
ON work_allocations(worker_id, allocation_date);

CREATE INDEX IF NOT EXISTS idx_allocation_items_material
ON work_allocation_items(material_item_id);

CREATE INDEX IF NOT EXISTS idx_outputs_worker
ON sewing_outputs(worker_id, output_date);

CREATE INDEX IF NOT EXISTS idx_output_items_allocation
ON sewing_output_items(allocation_item_id);

CREATE INDEX IF NOT EXISTS idx_deliveries_factory
ON factory_deliveries(factory_id, delivery_date);

CREATE INDEX IF NOT EXISTS idx_delivery_items_output
ON factory_delivery_items(output_item_id);

CREATE INDEX IF NOT EXISTS idx_inspections_delivery
ON factory_inspections(delivery_id);

CREATE INDEX IF NOT EXISTS idx_repair_worker
ON repair_cases(worker_id, status);

CREATE INDEX IF NOT EXISTS idx_factory_payments_factory
ON factory_payments(factory_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_payroll_worker
ON payroll_items(worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_payments_worker
ON worker_payments(worker_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_worker_bon_worker
ON worker_bon(worker_id, status);

CREATE INDEX IF NOT EXISTS idx_expenses_date
ON business_expenses(expense_date);

CREATE INDEX IF NOT EXISTS idx_audit_entity
ON audit_logs(entity_type, entity_id);

-- =========================================================
-- END OF BROKER POINT SCHEMA
-- =========================================================
