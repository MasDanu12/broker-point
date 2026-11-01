const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const error = (message, status = 400) => json({
  success: false,
  message
}, status);

function getPeriod(url) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!start || !end || start > end) return null;
  return { start, end };
}

async function workerReport(env, url, period) {
  const workerId = url.searchParams.get("worker_id");

  if (!workerId) return error("worker_id wajib diisi.");

  const worker = await env.DB.prepare(`
    SELECT id, name, phone, location
    FROM workers
    WHERE id = ?
  `).bind(workerId).first();

  if (!worker) return error("Penjahit tidak ditemukan.", 404);

  const payroll = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(pi.eligible_qty), 0) AS accepted_qty,
      COALESCE(SUM(pi.gross_amount), 0) AS gross_amount
    FROM payroll_items pi
    JOIN payroll_periods pp ON pp.id = pi.payroll_period_id
    WHERE pi.worker_id = ?
      AND pp.period_start >= ?
      AND pp.period_end <= ?
  `).bind(workerId, period.start, period.end).first();

  const bon = await env.DB.prepare(`
    SELECT COALESCE(SUM(bp.amount), 0) AS total
    FROM worker_bon_payments bp
    JOIN worker_bon b ON b.id = bp.bon_id
    WHERE b.worker_id = ?
      AND bp.payment_date BETWEEN ? AND ?
  `).bind(workerId, period.start, period.end).first();

  const payments = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS transaction_count
    FROM worker_payments
    WHERE worker_id = ?
      AND payment_date BETWEEN ? AND ?
  `).bind(workerId, period.start, period.end).first();

  const gross = Number(payroll.gross_amount || 0);
  const bonPaid = Number(bon.total || 0);
  const paid = Number(payments.total || 0);

  return json({
    success: true,
    report: "worker",
    period,
    worker,
    summary: {
      accepted_qty: Number(payroll.accepted_qty || 0),
      gross_amount: gross,
      bon_deduction: bonPaid,
      payments: paid,
      payment_transactions: Number(payments.transaction_count || 0),
      remaining_wage: gross - bonPaid - paid
    }
  });
}

async function factoryReport(env, url, period) {
  const factoryId = url.searchParams.get("factory_id");

  if (!factoryId) return error("factory_id wajib diisi.");

  const factory = await env.DB.prepare(`
    SELECT id, name, contact_person, phone
    FROM factories
    WHERE id = ?
  `).bind(factoryId).first();

  if (!factory) return error("Pabrik tidak ditemukan.", 404);

  const earnedPeriod = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(ii.accepted_qty), 0) AS accepted_qty,
      COALESCE(SUM(ii.accepted_qty * di.factory_rate), 0) AS earned
    FROM factory_inspection_items ii
    JOIN factory_inspections ins ON ins.id = ii.inspection_id
    JOIN factory_delivery_items di ON di.id = ii.delivery_item_id
    JOIN factory_deliveries d ON d.id = di.delivery_id
    WHERE d.factory_id = ?
      AND ins.inspection_date BETWEEN ? AND ?
  `).bind(factoryId, period.start, period.end).first();

  const earnedToDate = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(ii.accepted_qty * di.factory_rate), 0) AS total
    FROM factory_inspection_items ii
    JOIN factory_inspections ins ON ins.id = ii.inspection_id
    JOIN factory_delivery_items di ON di.id = ii.delivery_item_id
    JOIN factory_deliveries d ON d.id = di.delivery_id
    WHERE d.factory_id = ?
      AND ins.inspection_date <= ?
  `).bind(factoryId, period.end).first();

  const paymentsPeriod = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS transaction_count
    FROM factory_payments
    WHERE factory_id = ?
      AND payment_date BETWEEN ? AND ?
  `).bind(factoryId, period.start, period.end).first();

  const paymentsToDate = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM factory_payments
    WHERE factory_id = ?
      AND payment_date <= ?
  `).bind(factoryId, period.end).first();

  const earned = Number(earnedPeriod.earned || 0);
  const paid = Number(paymentsPeriod.total || 0);
  const cumulativeEarned = Number(earnedToDate.total || 0);
  const cumulativePaid = Number(paymentsToDate.total || 0);

  return json({
    success: true,
    report: "factory",
    period,
    factory,
    summary: {
      accepted_qty: Number(earnedPeriod.accepted_qty || 0),
      earned_period: earned,
      payments_period: paid,
      payment_transactions: Number(paymentsPeriod.transaction_count || 0),
      cumulative_earned: cumulativeEarned,
      cumulative_paid: cumulativePaid,
      outstanding_balance: cumulativeEarned - cumulativePaid
    }
  });
}

async function productionReport(env, period) {
  const allocations = await env.DB.prepare(`
    SELECT COALESCE(SUM(ai.allocated_qty), 0) AS total
    FROM work_allocation_items ai
    JOIN work_allocations a ON a.id = ai.allocation_id
    WHERE a.allocation_date BETWEEN ? AND ?
  `).bind(period.start, period.end).first();

  const outputs = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(oi.good_qty), 0) AS good_qty,
      COALESCE(SUM(oi.defective_qty), 0) AS defective_qty,
      COALESCE(SUM(oi.repair_qty), 0) AS repair_qty
    FROM sewing_output_items oi
    JOIN sewing_outputs o ON o.id = oi.output_id
    WHERE o.output_date BETWEEN ? AND ?
  `).bind(period.start, period.end).first();

  const deliveries = await env.DB.prepare(`
    SELECT COALESCE(SUM(di.delivered_qty), 0) AS total
    FROM factory_delivery_items di
    JOIN factory_deliveries d ON d.id = di.delivery_id
    WHERE d.delivery_date BETWEEN ? AND ?
  `).bind(period.start, period.end).first();

  const inspections = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(ii.accepted_qty), 0) AS accepted_qty,
      COALESCE(SUM(ii.rejected_qty), 0) AS rejected_qty,
      COALESCE(SUM(ii.repair_qty), 0) AS repair_qty
    FROM factory_inspection_items ii
    JOIN factory_inspections i ON i.id = ii.inspection_id
    WHERE i.inspection_date BETWEEN ? AND ?
  `).bind(period.start, period.end).first();

  return json({
    success: true,
    report: "production",
    period,
    summary: {
      allocated_qty: Number(allocations.total || 0),
      worker_good_qty: Number(outputs.good_qty || 0),
      worker_defective_qty: Number(outputs.defective_qty || 0),
      worker_repair_qty: Number(outputs.repair_qty || 0),
      delivered_qty: Number(deliveries.total || 0),
      factory_accepted_qty: Number(inspections.accepted_qty || 0),
      factory_rejected_qty: Number(inspections.rejected_qty || 0),
      factory_repair_qty: Number(inspections.repair_qty || 0)
    }
  });
}

export async function handleReports(request, env) {
  if (request.method !== "GET") {
    return error("Metode tidak diizinkan.", 405);
  }

  const url = new URL(request.url);
  const period = getPeriod(url);

  if (!period) {
    return error("Parameter start dan end wajib diisi dengan format YYYY-MM-DD.");
  }

  const path = url.pathname;

  try {
    if (path === "/api/reports/worker") {
      return await workerReport(env, url, period);
    }

    if (path === "/api/reports/factory") {
      return await factoryReport(env, url, period);
    }

    if (path === "/api/reports/production") {
      return await productionReport(env, period);
    }

    return error("Jenis laporan tidak ditemukan.", 404);
  } catch (err) {
    console.error("Reports error:", err);
    return error("Gagal mengambil data laporan.", 500);
  }
}
