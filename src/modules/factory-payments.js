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
  const factoryId = url.searchParams.get("factory_id");

  let sql = `
    SELECT
      p.*,
      f.name AS factory_name,
      d.document_no AS delivery_document_no
    FROM factory_payments p
    JOIN factories f ON f.id = p.factory_id
    LEFT JOIN factory_deliveries d ON d.id = p.delivery_id
    WHERE 1 = 1
  `;

  const params = [];

  if (factoryId) {
    sql += " AND p.factory_id = ?";
    params.push(factoryId);
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
    factory_id,
    delivery_id = null,
    payment_date,
    amount,
    payment_method = "transfer",
    notes = ""
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof factory_id !== "string" ||
    !factory_id.trim() ||
    !validDate(payment_date) ||
    !validAmount(amount)
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, pabrik, tanggal, dan nominal wajib valid."
    }, 400);
  }

  const factory = await env.DB.prepare(`
    SELECT id FROM factories WHERE id = ?
  `).bind(factory_id).first();

  if (!factory) {
    return json({
      success: false,
      message: "Pabrik tidak ditemukan."
    }, 404);
  }

  if (delivery_id !== null) {
    if (typeof delivery_id !== "string" || !delivery_id.trim()) {
      return json({
        success: false,
        message: "ID pengiriman tidak valid."
      }, 400);
    }

    const delivery = await env.DB.prepare(`
      SELECT id, factory_id
      FROM factory_deliveries
      WHERE id = ?
    `).bind(delivery_id).first();

    if (!delivery || delivery.factory_id !== factory_id) {
      return json({
        success: false,
        message: "Pengiriman tidak ditemukan atau bukan milik pabrik ini."
      }, 400);
    }
  }

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO factory_payments (
        id,
        document_no,
        factory_id,
        delivery_id,
        payment_date,
        amount,
        payment_method,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      document_no.trim(),
      factory_id,
      delivery_id,
      payment_date,
      amount,
      typeof payment_method === "string"
        ? payment_method.trim()
        : "transfer",
      typeof notes === "string" ? notes.trim() : ""
    ).run();
  } catch (error) {
    console.error("Create factory payment:", error);

    return json({
      success: false,
      message: "Pembayaran pabrik gagal disimpan. Periksa nomor dokumen."
    }, 400);
  }

  return json({
    success: true,
    message: "Pembayaran dari pabrik berhasil dicatat.",
    data: {
      id,
      document_no: document_no.trim(),
      factory_id,
      delivery_id,
      payment_date,
      amount
    }
  }, 201);
}

export async function handleFactoryPayments(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/factory-payments";

  if (path === base && request.method === "GET") {
    return listPayments(env, url);
  }

  if (path === base && request.method === "POST") {
    return createPayment(request, env);
  }

  return json({
    success: false,
    message: "Endpoint pembayaran pabrik tidak ditemukan."
  }, 404);
}
