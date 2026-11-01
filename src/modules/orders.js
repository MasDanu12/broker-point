const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const allowedStatuses = [
  "open",
  "in_progress",
  "completed",
  "cancelled"
];

async function listOrders(request, env) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const factoryId = url.searchParams.get("factory_id");
  const status = url.searchParams.get("status");

  let sql = `
    SELECT
      o.*,
      f.name AS factory_name,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.ordered_qty), 0) AS total_qty
    FROM factory_orders o
    JOIN factories f ON f.id = o.factory_id
    LEFT JOIN factory_order_items i ON i.order_id = o.id
    WHERE 1 = 1
  `;

  const values = [];

  if (search) {
    sql += ` AND (
      o.document_no LIKE ?
      OR f.name LIKE ?
    )`;
    values.push(`%${search}%`, `%${search}%`);
  }

  if (factoryId) {
    sql += " AND o.factory_id = ?";
    values.push(factoryId);
  }

  if (status) {
    sql += " AND o.status = ?";
    values.push(status);
  }

  sql += `
    GROUP BY o.id
    ORDER BY o.order_date DESC, o.created_at DESC
  `;

  const result = await env.DB.prepare(sql)
    .bind(...values)
    .all();

  return json({
    success: true,
    data: result.results
  });
}

async function getOrder(id, env) {
  const order = await env.DB.prepare(`
    SELECT
      o.*,
      f.name AS factory_name
    FROM factory_orders o
    JOIN factories f ON f.id = o.factory_id
    WHERE o.id = ?
  `).bind(id).first();

  if (!order) {
    return json({
      success: false,
      message: "Pesanan tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      i.*,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name
    FROM factory_order_items i
    JOIN product_models m ON m.id = i.model_id
    LEFT JOIN product_colors c ON c.id = i.color_id
    WHERE i.order_id = ?
    ORDER BY i.id ASC
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...order,
      items: items.results
    }
  });
}

async function createOrder(request, env) {
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
    order_date,
    due_date = null,
    status = "open",
    notes = null,
    items
  } = body;

  if (
    !document_no ||
    !factory_id ||
    !order_date ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, pabrik, tanggal pesanan, dan minimal satu item wajib diisi."
    }, 400);
  }

  if (!allowedStatuses.includes(status)) {
    return json({
      success: false,
      message: "Status pesanan tidak valid."
    }, 400);
  }

  for (const item of items) {
    if (
      !item.model_id ||
      !Number.isInteger(Number(item.ordered_qty)) ||
      Number(item.ordered_qty) < 0 ||
      !Number.isInteger(Number(item.factory_rate)) ||
      Number(item.factory_rate) < 0
    ) {
      return json({
        success: false,
        message: "Setiap item wajib memiliki model, jumlah, dan tarif pabrik yang valid."
      }, 400);
    }
  }

  const factory = await env.DB.prepare(
    "SELECT id FROM factories WHERE id = ? AND status = 'active'"
  ).bind(factory_id).first();

  if (!factory) {
    return json({
      success: false,
      message: "Pabrik tidak ditemukan atau tidak aktif."
    }, 404);
  }

  const orderId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO factory_orders (
        id, document_no, factory_id, order_date,
        due_date, status, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      String(document_no).trim(),
      factory_id,
      order_date,
      due_date,
      status,
      notes
    )
  ];

  for (const item of items) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO factory_order_items (
          id, order_id, model_id, color_id,
          ordered_qty, factory_rate, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        orderId,
        item.model_id,
        item.color_id || null,
        Number(item.ordered_qty),
        Number(item.factory_rate),
        item.notes || null
      )
    );
  }

  try {
    await env.DB.batch(statements);

    return json({
      success: true,
      message: "Pesanan pabrik berhasil disimpan.",
      data: {
        id: orderId,
        document_no,
        item_count: items.length
      }
    }, 201);
  } catch (error) {
    console.error("Create order:", error);

    return json({
      success: false,
      message: "Pesanan gagal disimpan. Periksa nomor dokumen dan data item."
    }, 400);
  }
}

async function updateOrder(id, request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      message: "Format JSON tidak valid."
    }, 400);
  }

  const current = await env.DB.prepare(
    "SELECT id FROM factory_orders WHERE id = ?"
  ).bind(id).first();

  if (!current) {
    return json({
      success: false,
      message: "Pesanan tidak ditemukan."
    }, 404);
  }

  const fields = [];
  const values = [];

  if (body.order_date !== undefined) {
    fields.push("order_date = ?");
    values.push(body.order_date);
  }

  if (body.due_date !== undefined) {
    fields.push("due_date = ?");
    values.push(body.due_date || null);
  }

  if (body.status !== undefined) {
    if (!allowedStatuses.includes(body.status)) {
      return json({
        success: false,
        message: "Status pesanan tidak valid."
      }, 400);
    }

    fields.push("status = ?");
    values.push(body.status);
  }

  if (body.notes !== undefined) {
    fields.push("notes = ?");
    values.push(body.notes || null);
  }

  if (fields.length === 0) {
    return json({
      success: false,
      message: "Tidak ada data yang diubah."
    }, 400);
  }

  values.push(id);

  await env.DB.prepare(`
    UPDATE factory_orders
    SET ${fields.join(", ")}
    WHERE id = ?
  `).bind(...values).run();

  return json({
    success: true,
    message: "Pesanan berhasil diperbarui."
  });
}

export async function handleOrders(request, env) {
  const url = new URL(request.url);
  const method = request.method;

  if (url.pathname === "/api/orders" && method === "GET") {
    return listOrders(request, env);
  }

  if (url.pathname === "/api/orders" && method === "POST") {
    return createOrder(request, env);
  }

  const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);

  if (match) {
    const id = match[1];

    if (method === "GET") {
      return getOrder(id, env);
    }

    if (method === "PATCH") {
      return updateOrder(id, request, env);
    }
  }

  return json({
    success: false,
    message: "Metode atau jalur pesanan tidak tersedia."
  }, 405);
}
