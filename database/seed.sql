-- =========================================================
-- BROKER POINT
-- SEED DATA
-- Cloudflare D1 / SQLite
-- Version 1.0
-- =========================================================

PRAGMA foreign_keys = ON;

-- =========================================================
-- 01. SETTINGS
-- =========================================================

INSERT INTO settings (key, value)
VALUES
    ('app_name', 'Broker Point'),
    ('currency', 'IDR'),
    ('default_status', 'active'),
    ('version', '1.0.0')
ON CONFLICT(key) DO NOTHING;

-- =========================================================
-- 02. FACTORIES
-- =========================================================

INSERT INTO factories (id, name, contact_person, phone, address, notes, status)
VALUES
    ('fac_001', 'Pabrik A', 'Budi', '081234567890', 'Bandung', 'Pabrik utama untuk produksi bulk', 'active'),
    ('fac_002', 'Pabrik B', 'Sari', '081234567891', 'Garut', 'Pabrik pendukung untuk kapasitas tambahan', 'active')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 03. WORKERS
-- =========================================================

INSERT INTO workers (id, name, phone, address, location, joined_at, notes, status)
VALUES
    ('wrk_001', 'Rina', '0811111111', 'Bandung', 'Bandung', '2024-01-10', 'Penjahit reguler', 'active'),
    ('wrk_002', 'Dewi', '0822222222', 'Garut', 'Garut', '2024-02-15', 'Penjahit tetap', 'active'),
    ('wrk_003', 'Siti', '0833333333', 'Cimahi', 'Cimahi', '2024-03-06', 'Penjahit cadangan', 'active')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 04. PRODUCT MODELS
-- =========================================================

INSERT INTO product_models (id, code, name, description, status)
VALUES
    ('mod_001', 'MOD-001', 'Hijab Basic', 'Model dasar untuk produksi massal', 'active'),
    ('mod_002', 'MOD-002', 'Hijab Satin', 'Model satin premium', 'active'),
    ('mod_003', 'MOD-003', 'Hijab Sport', 'Model sport ringan', 'active')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 05. PRODUCT COLORS
-- =========================================================

INSERT INTO product_colors (id, name, color_code, status)
VALUES
    ('col_001', 'Hitam', '#111111', 'active'),
    ('col_002', 'Putih', '#FFFFFF', 'active'),
    ('col_003', 'Abu-Abu', '#9CA3AF', 'active'),
    ('col_004', 'Navy', '#1F2937', 'active')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 06. RATE CARDS
-- =========================================================

INSERT INTO rate_cards (id, factory_id, worker_id, model_id, factory_rate, worker_rate, effective_from, effective_until, notes)
VALUES
    ('rt_001', 'fac_001', 'wrk_001', 'mod_001', 18000, 12000, '2025-01-01', NULL, 'Tarif dasar untuk model basic'),
    ('rt_002', 'fac_001', 'wrk_002', 'mod_002', 22000, 15000, '2025-01-01', NULL, 'Tarif satin premium'),
    ('rt_003', 'fac_002', 'wrk_003', 'mod_003', 20000, 13000, '2025-01-01', NULL, 'Tarif sport premium')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 07. FACTORY ORDERS
-- =========================================================

INSERT INTO factory_orders (id, document_no, factory_id, order_date, due_date, status, notes)
VALUES
    ('ord_001', 'PO-2026-0001', 'fac_001', '2026-10-01', '2026-10-15', 'open', 'Pesanan awal bulan Oktober'),
    ('ord_002', 'PO-2026-0002', 'fac_002', '2026-10-05', '2026-10-20', 'open', 'Pesanan lanjutan bulan Oktober')
ON CONFLICT(id) DO NOTHING;

INSERT INTO factory_order_items (id, order_id, model_id, color_id, ordered_qty, factory_rate, notes)
VALUES
    ('ord_itm_001', 'ord_001', 'mod_001', 'col_001', 200, 18000, 'Hijab basic hitam'),
    ('ord_itm_002', 'ord_001', 'mod_002', 'col_002', 150, 22000, 'Hijab satin putih'),
    ('ord_itm_003', 'ord_002', 'mod_003', 'col_003', 120, 20000, 'Hijab sport abu-abu')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 08. MATERIAL RECEIPTS
-- =========================================================

INSERT INTO material_receipts (id, document_no, factory_id, order_id, receipt_date, received_by, notes)
VALUES
    ('mat_rec_001', 'MR-2026-0001', 'fac_001', 'ord_001', '2026-10-02', 'admin', 'Penerimaan bahan untuk order awal'),
    ('mat_rec_002', 'MR-2026-0002', 'fac_002', 'ord_002', '2026-10-06', 'manager', 'Penerimaan bahan untuk order lanjutan')
ON CONFLICT(id) DO NOTHING;

INSERT INTO material_receipt_items (id, receipt_id, order_item_id, model_id, color_id, roll_count, received_qty, notes)
VALUES
    ('mat_itm_001', 'mat_rec_001', 'ord_itm_001', 'mod_001', 'col_001', 2, 200, 'Bahan untuk hijab basic hitam'),
    ('mat_itm_002', 'mat_rec_001', 'ord_itm_002', 'mod_002', 'col_002', 2, 150, 'Bahan untuk hijab satin putih'),
    ('mat_itm_003', 'mat_rec_002', 'ord_itm_003', 'mod_003', 'col_003', 1, 120, 'Bahan untuk hijab sport abu-abu')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 09. WORK ALLOCATIONS
-- =========================================================

INSERT INTO work_allocations (id, document_no, worker_id, allocation_date, notes)
VALUES
    ('wa_001', 'AL-2026-0001', 'wrk_001', '2026-10-03', 'Alokasi untuk hijab basic hitam'),
    ('wa_002', 'AL-2026-0002', 'wrk_002', '2026-10-04', 'Alokasi untuk hijab satin putih'),
    ('wa_003', 'AL-2026-0003', 'wrk_003', '2026-10-07', 'Alokasi untuk hijab sport abu-abu')
ON CONFLICT(id) DO NOTHING;

INSERT INTO work_allocation_items (id, allocation_id, material_item_id, model_id, color_id, allocated_qty, worker_rate, factory_rate, notes)
VALUES
    ('wa_itm_001', 'wa_001', 'mat_itm_001', 'mod_001', 'col_001', 80, 12000, 18000, 'Batch 1 basic hitam'),
    ('wa_itm_002', 'wa_002', 'mat_itm_002', 'mod_002', 'col_002', 60, 15000, 22000, 'Batch 1 satin putih'),
    ('wa_itm_003', 'wa_003', 'mat_itm_003', 'mod_003', 'col_003', 50, 13000, 20000, 'Batch 1 sport abu-abu')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 10. SEWING OUTPUTS
-- =========================================================

INSERT INTO sewing_outputs (id, document_no, worker_id, output_date, notes)
VALUES
    ('so_001', 'SO-2026-0001', 'wrk_001', '2026-10-08', 'Setoran hasil jahitan awal'),
    ('so_002', 'SO-2026-0002', 'wrk_002', '2026-10-09', 'Setoran hasil jahitan kedua'),
    ('so_003', 'SO-2026-0003', 'wrk_003', '2026-10-10', 'Setoran hasil jahitan ketiga')
ON CONFLICT(id) DO NOTHING;

INSERT INTO sewing_output_items (id, output_id, allocation_item_id, model_id, color_id, good_qty, defective_qty, repair_qty, notes)
VALUES
    ('so_itm_001', 'so_001', 'wa_itm_001', 'mod_001', 'col_001', 70, 5, 5, 'Masih ada minor defect'),
    ('so_itm_002', 'so_002', 'wa_itm_002', 'mod_002', 'col_002', 55, 3, 2, 'Kualitas baik'),
    ('so_itm_003', 'so_003', 'wa_itm_003', 'mod_003', 'col_003', 45, 2, 3, 'Ada potensi repair')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 11. FACTORY DELIVERIES
-- =========================================================

INSERT INTO factory_deliveries (id, document_no, factory_id, delivery_date, delivery_status, notes)
VALUES
    ('fd_001', 'FD-2026-0001', 'fac_001', '2026-10-10', 'sent', 'Pengiriman hasil jahitan ke pabrik A'),
    ('fd_002', 'FD-2026-0002', 'fac_002', '2026-10-12', 'sent', 'Pengiriman hasil jahitan ke pabrik B')
ON CONFLICT(id) DO NOTHING;

INSERT INTO factory_delivery_items (id, delivery_id, output_item_id, model_id, color_id, delivered_qty, factory_rate, notes)
VALUES
    ('fd_itm_001', 'fd_001', 'so_itm_001', 'mod_001', 'col_001', 65, 18000, 'Pengiriman utama'),
    ('fd_itm_002', 'fd_002', 'so_itm_002', 'mod_002', 'col_002', 52, 22000, 'Pengiriman utama'),
    ('fd_itm_003', 'fd_002', 'so_itm_003', 'mod_003', 'col_003', 42, 20000, 'Pengiriman sedang proses')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 12. FACTORY INSPECTION
-- =========================================================

INSERT INTO factory_inspections (id, document_no, delivery_id, inspection_date, notes)
VALUES
    ('fi_001', 'IN-2026-0001', 'fd_001', '2026-10-11', 'Inspeksi hasil dari batch pertama'),
    ('fi_002', 'IN-2026-0002', 'fd_002', '2026-10-13', 'Inspeksi hasil dari batch kedua')
ON CONFLICT(id) DO NOTHING;

INSERT INTO factory_inspection_items (id, inspection_id, delivery_item_id, accepted_qty, rejected_qty, repair_qty, notes)
VALUES
    ('fi_itm_001', 'fi_001', 'fd_itm_001', 60, 3, 2, 'Ada beberapa item perlu perbaikan kecil'),
    ('fi_itm_002', 'fi_002', 'fd_itm_002', 50, 2, 0, 'Kualitas cukup baik'),
    ('fi_itm_003', 'fi_002', 'fd_itm_003', 38, 2, 2, 'Masih ada item benjol/ukuran kurang')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 13. REPAIR CASES
-- =========================================================

INSERT INTO repair_cases (id, document_no, inspection_item_id, worker_id, repair_qty, reason, status, opened_at)
VALUES
    ('rc_001', 'RP-2026-0001', 'fi_itm_001', 'wrk_001', 2, 'Ukuran perlu penyesuaian', 'pending', '2026-10-11T09:00:00'),
    ('rc_002', 'RP-2026-0002', 'fi_itm_003', 'wrk_003', 2, 'Jahitan perlu diperbaiki', 'pending', '2026-10-13T08:30:00')
ON CONFLICT(id) DO NOTHING;

INSERT INTO repair_history (id, repair_case_id, action, quantity, notes)
VALUES
    ('rh_001', 'rc_001', 'opened', 2, 'Kasus perbaikan dibuka setelah inspeksi'),
    ('rh_002', 'rc_002', 'opened', 2, 'Kasus perbaikan dibuka untuk barang yang rusak')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 14. FACTORY PAYMENTS
-- =========================================================

INSERT INTO factory_payments (id, document_no, factory_id, delivery_id, payment_date, amount, payment_method, notes)
VALUES
    ('fp_001', 'PAY-2026-0001', 'fac_001', 'fd_001', '2026-10-15', 1500000, 'transfer', 'Pembayaran terhadap pengiriman awal'),
    ('fp_002', 'PAY-2026-0002', 'fac_002', 'fd_002', '2026-10-16', 1200000, 'cash', 'Pembayaran tahap awal')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 15. PAYROLL PERIODS
-- =========================================================

INSERT INTO payroll_periods (id, period_start, period_end, status)
VALUES
    ('pay_period_001', '2026-10-01', '2026-10-31', 'draft')
ON CONFLICT(id) DO NOTHING;

-- Upah dihitung berdasarkan jumlah yang diterima pabrik.
-- Rina: 60 pcs x Rp12.000 = Rp720.000
-- Dewi: 50 pcs x Rp15.000 = Rp750.000
-- Siti: 38 pcs x Rp13.000 = Rp494.000

INSERT INTO payroll_items (
    id, payroll_period_id, worker_id, output_item_id,
    eligible_qty, worker_rate, gross_amount, notes
)
VALUES
    ('pay_item_001', 'pay_period_001', 'wrk_001', 'so_itm_001', 60, 12000, 720000, 'Upah berdasarkan 60 pcs diterima pabrik'),
    ('pay_item_002', 'pay_period_001', 'wrk_002', 'so_itm_002', 50, 15000, 750000, 'Upah berdasarkan 50 pcs diterima pabrik'),
    ('pay_item_003', 'pay_period_001', 'wrk_003', 'so_itm_003', 38, 13000, 494000, 'Upah berdasarkan 38 pcs diterima pabrik')
ON CONFLICT(id) DO NOTHING;

INSERT INTO worker_payments (
    id, document_no, worker_id, payroll_period_id,
    payment_date, amount, payment_method, notes
)
VALUES
    ('wp_001', 'WPAY-2026-0001', 'wrk_001', 'pay_period_001', '2026-10-20', 500000, 'transfer', 'Pembayaran sebagian upah'),
    ('wp_002', 'WPAY-2026-0002', 'wrk_002', 'pay_period_001', '2026-10-21', 400000, 'transfer', 'Pembayaran sebagian upah')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 16. WORKER BON
-- =========================================================

INSERT INTO worker_bon (id, document_no, worker_id, bon_date, category, description, amount, remaining_amount, status)
VALUES
    ('bon_001', 'BON-2026-0001', 'wrk_001', '2026-10-12', 'material', 'Pembelian kebutuhan jahitan', 250000, 150000, 'unpaid'),
    ('bon_002', 'BON-2026-0002', 'wrk_002', '2026-10-13', 'advance', 'Uang muka kebutuhan kerja', 200000, 80000, 'unpaid')
ON CONFLICT(id) DO NOTHING;

INSERT INTO worker_bon_payments (id, bon_id, payment_date, amount, payroll_period_id, notes)
VALUES
    ('bon_pay_001', 'bon_001', '2026-10-18', 100000, 'pay_period_001', 'Pembayaran cicilan pertama'),
    ('bon_pay_002', 'bon_002', '2026-10-19', 120000, 'pay_period_001', 'Pembayaran cicilan pertama')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- 17. BUSINESS EXPENSES
-- =========================================================

INSERT INTO business_expenses (id, document_no, expense_date, category, description, amount, recipient, notes)
VALUES
    ('exp_001', 'EXP-2026-0001', '2026-10-01', 'operasional', 'Pembelian benang', 500000, 'Supplier Benang', 'Pembelian bahan pendukung'),
    ('exp_002', 'EXP-2026-0002', '2026-10-05', 'transport', 'Biaya distribusi bahan', 250000, 'Logistik', 'Pengiriman bahan ke tempat kerja')
ON CONFLICT(id) DO NOTHING;

-- =========================================================
-- END OF SEED DATA
-- =========================================================
