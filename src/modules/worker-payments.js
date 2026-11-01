const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const validAmount = (value) =>
  Number.isSafeInteger(value) && value > 0;

async function listPayments(env, url) {
  const workerId = url.searchParams.get("worker_id");
  const periodId = url.searchParams.get("payroll_period_id");

  let sql = `
    SELECT
      p.*,
      w.name AS worker_name,
      pp.period_start,
      pp.period_end
    FROM worker_payments p
    JOIN workers w ON w.id = p.worker_id
    LEFT JOIN payroll_periods pp
      ON pp.id = p.payroll_period_id
    WHERE 1 = 1
  `;

  const params = [];

  if (workerId) {
    sql += " AND p.worker_id = ?";
    params.push(workerId);
  }

  if (periodId) {
    sql += " AND p.payroll_period_id = ?";
    params.push(periodId);
  }

  sql += " ORDER BY p.payment_date DESC, p.created_at DESC";

  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  return json({ success: true, data: result.results });
}

async function createPayment(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      message: "Format JSON tidak valid."
    }, 400);
  }

  const {
    document_no,
    worker_id,
    payroll_period_id,
    payment_date,
    amount,
    payment_method = "cash",
    notes = ""
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof worker_id !== "string" ||
    !worker_id.trim() ||
    typeof payroll_period_id !== "string" ||
    !payroll_period_id.trim() ||
    !validDate(payment_date) ||
    !validAmount(amount)
  ) {
    return json({
      success: false,
      message: "Data pembayaran wajib diisi dengan benar."
    }, 400);
  }

  const period = await env.DB.prepare(`
    SELECT id, status
    FROM payroll_periods
    WHERE id = ?
  `).bind(payroll_period_id).first();

  if (!period) {
    return json({
      success: false,
      message: "Periode penggajian tidak ditemukan."
    }, 404);
  }

  if (period.status === "cancelled") {
    return json({
      success: false,
      message: "Periode penggajian sudah dibatalkan."
    }, 400);
  }

  const worker = await env.DB.prepare(`
    SELECT id FROM workers WHERE id = ?
  `).bind(worker_id).first();

  if (!worker) {
    return json({
      success: false,
      message: "Penjahit tidak ditemukan."
    }, 404);
  }

  const payroll = await env.DB.prepare(`
    SELECT COALESCE(SUM(gross_amount), 0) AS gross
    FROM payroll_items
    WHERE payroll_period_id = ?
      AND worker_id = ?
  `).bind(payroll_period_id, worker_id).first();

  const bonDeductions = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM worker_bon_payments
    WHERE payroll_period_id = ?
      AND bon_id IN (
        SELECT id FROM worker_bon WHERE worker_id = ?
      )
  `).bind(payroll_period_id, worker_id).first();

  const payments = await env.DB.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM worker_payments
    WHERE payroll_period_id = ?
      AND worker_id = ?
  `).bind(payroll_period_id, worker_id).first();

  const gross = Number(payroll.gross || 0);
  const deductions = Number(bonDeductions.total || 0);
  const alreadyPaid = Number(payments.total || 0);
  const net = Math.max(0, gross - deductions);
  const remaining = Math.max(0, net - alreadyPaid);

  if (amount > remaining) {
    return json({
      success: false,
      message: `Pembayaran melebihi sisa upah. Sisa yang dapat dibayar Rp${remaining}.`,
      data: {
        gross,
        bon_deductions: deductions,
        already_paid: alreadyPaid,
        net,
        remaining
      }
    }, 400);
  }

  const paymentId = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO worker_payments (
        id,
        document_no,
        worker_id,
        payroll_period_id,
        payment_date,
        amount,
        payment_method,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      paymentId,
      document_no.trim(),
      worker_id,
      payroll_period_id,
      payment_date,
      amount,
      typeof payment_method === "string"
        ? payment_method.trim()
        : "cash",
      typeof notes === "string" ? notes.trim() : ""
    ).run();
  } catch (error) {
    console.error("Create worker payment:", error);

    return json({
      success: false,
      message: "Pembayaran gagal disimpan. Periksa nomor dokumen."
    }, 400);
  }

  return json({
    success: true,
    message: "Pembayaran upah berhasil dicatat.",
    data: {
      id: paymentId,
      worker_id,
      payroll_period_id,
      amount,
      gross,
      bon_deductions: deductions,
      already_paid: alreadyPaid + amount,
      remaining: remaining - amount
    }
  }, 201);
}

export async function handleWorkerPayments(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/worker-payments";

  if (path === base && request.method === "GET") {
    return listPayments(env, url);
  }

  if (path === base && request.method === "POST") {
    return createPayment(request, env);
  }

  return json({
    success: false,
    message: "Endpoint pembayaran penjahit tidak ditemukan."
  }, 404);
}
