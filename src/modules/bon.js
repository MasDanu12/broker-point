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

async function listBon(env, url) {
  const workerId = url.searchParams.get("worker_id");

  let sql = `
    SELECT
      b.*,
      w.name AS worker_name,
      COALESCE(SUM(bp.amount), 0) AS total_paid
    FROM worker_bon b
    JOIN workers w ON w.id = b.worker_id
    LEFT JOIN worker_bon_payments bp ON bp.bon_id = b.id
  `;

  const params = [];

  if (workerId) {
    sql += " WHERE b.worker_id = ?";
    params.push(workerId);
  }

  sql += `
    GROUP BY b.id
    ORDER BY b.bon_date DESC, b.created_at DESC
  `;

  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  return json({ success: true, data: result.results });
}

async function getBon(id, env) {
  const bon = await env.DB.prepare(`
    SELECT b.*, w.name AS worker_name
    FROM worker_bon b
    JOIN workers w ON w.id = b.worker_id
    WHERE b.id = ?
  `).bind(id).first();

  if (!bon) {
    return json({
      success: false,
      message: "Data bon tidak ditemukan."
    }, 404);
  }

  const payments = await env.DB.prepare(`
    SELECT *
    FROM worker_bon_payments
    WHERE bon_id = ?
    ORDER BY payment_date DESC, created_at DESC
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...bon,
      payments: payments.results
    }
  });
}

async function createBon(request, env) {
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
    bon_date,
    category,
    description = "",
    amount
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof worker_id !== "string" ||
    !worker_id.trim() ||
    !validDate(bon_date) ||
    typeof category !== "string" ||
    !category.trim() ||
    !validAmount(amount)
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, penjahit, tanggal, kategori, dan nominal wajib valid."
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

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO worker_bon (
        id,
        document_no,
        worker_id,
        bon_date,
        category,
        description,
        amount,
        remaining_amount,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')
    `).bind(
      id,
      document_no.trim(),
      worker_id,
      bon_date,
      category.trim(),
      typeof description === "string" ? description.trim() : "",
      amount,
      amount
    ).run();
  } catch (error) {
    console.error("Create bon:", error);

    return json({
      success: false,
      message: "Bon gagal disimpan. Periksa nomor dokumen."
    }, 400);
  }

  return json({
    success: true,
    message: "Bon berhasil dicatat.",
    data: {
      id,
      document_no: document_no.trim(),
      worker_id,
      amount,
      remaining_amount: amount,
      status: "unpaid"
    }
  }, 201);
}

async function payBon(request, env, bonId) {
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
    payment_date,
    amount,
    payroll_period_id = null,
    notes = ""
  } = body || {};

  if (!validDate(payment_date) || !validAmount(amount)) {
    return json({
      success: false,
      message: "Tanggal dan nominal cicilan tidak valid."
    }, 400);
  }

  const bon = await env.DB.prepare(`
    SELECT *
    FROM worker_bon
    WHERE id = ?
  `).bind(bonId).first();

  if (!bon) {
    return json({
      success: false,
      message: "Bon tidak ditemukan."
    }, 404);
  }

  if (amount > bon.remaining_amount) {
    return json({
      success: false,
      message: `Cicilan melebihi sisa bon Rp${bon.remaining_amount}.`
    }, 400);
  }

  if (payroll_period_id) {
    const period = await env.DB.prepare(`
      SELECT id FROM payroll_periods WHERE id = ?
    `).bind(payroll_period_id).first();

    if (!period) {
      return json({
        success: false,
        message: "Periode penggajian tidak ditemukan."
      }, 404);
    }
  }

  const paymentId = crypto.randomUUID();
  const newRemaining = bon.remaining_amount - amount;
  const newStatus = newRemaining === 0 ? "paid" : "partial";

  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO worker_bon_payments (
          id,
          bon_id,
          payment_date,
          amount,
          payroll_period_id,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        paymentId,
        bonId,
        payment_date,
        amount,
        payroll_period_id,
        typeof notes === "string" ? notes.trim() : ""
      ),

      env.DB.prepare(`
        UPDATE worker_bon
        SET remaining_amount = ?, status = ?
        WHERE id = ? AND remaining_amount = ?
      `).bind(
        newRemaining,
        newStatus,
        bonId,
        bon.remaining_amount
      )
    ]);
  } catch (error) {
    console.error("Pay bon:", error);

    return json({
      success: false,
      message: "Cicilan bon gagal disimpan."
    }, 400);
  }

  return json({
    success: true,
    message: "Cicilan bon berhasil dicatat.",
    data: {
      payment_id: paymentId,
      bon_id: bonId,
      paid_amount: amount,
      remaining_amount: newRemaining,
      status: newStatus
    }
  }, 201);
}

export async function handleBon(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/bon";

  if (path === base && request.method === "GET") {
    return listBon(env, url);
  }

  if (path === base && request.method === "POST") {
    return createBon(request, env);
  }

  if (path.startsWith(`${base}/`)) {
    const parts = path.slice(base.length + 1).split("/");
    const id = parts[0];

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID bon tidak valid."
      }, 400);
    }

    if (parts.length === 1 && request.method === "GET") {
      return getBon(id, env);
    }

    if (
      parts.length === 2 &&
      parts[1] === "payments" &&
      request.method === "POST"
    ) {
      return payBon(request, env, id);
    }
  }

  return json({
    success: false,
    message: "Endpoint bon tidak ditemukan."
  }, 404);
}
