const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

async function listReceipts(request, env) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search");
  const factoryId = url.searchParams.get("factory_id");

  let sql = `
    SELECT
      r.*,
      f.name AS factory_name,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.roll_count), 0) AS total_rolls,
      COALESCE(SUM(i.received_qty), 0) AS total_qty
    FROM material_receipts r
    JOIN factories f ON f.id = r.factory_id
    LEFT JOIN material_receipt_items i ON i.receipt_id = r.id
    WHERE 1 = 1
  `;

  const values = [];

  if (search) {
    sql += ` AND (
      r.document_no LIKE ?
      OR f.name LIKE ?
    )`;
    values.push(`%${search}%`, `%${search}%`);
  }

  if (factoryId) {
    sql += " AND r.factory_id = ?";
    values.push(factoryId);
  }

  sql += `
    GROUP BY r.id
    ORDER BY r.receipt_date DESC, r.created_at DESC
  `;

  const result = await env.DB.prepare(sql)
    .bind(...values)
    .all();

  return json({
    success: true,
    data: result.results
  });
}

async function getReceipt(id, env) {
  const receipt = await env.DB.prepare(`
    SELECT
      r.*,
      f.name AS factory_name,
      o.document_no AS order_document_no
    FROM material_receipts r
    JOIN factories f ON f.id = r.factory_id
    LEFT JOIN factory_orders o ON o.id = r.order_id
    WHERE r.id = ?
  `).bind(id).first();

  if (!receipt) {
    return json({
      success: false,
      message: "Data penerimaan tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      i.*,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name
    FROM material_receipt_items i
    JOIN product_models m ON m.id = i.model_id
    LEFT JOIN product_colors c ON c.id = i.color_id
    WHERE i.receipt_id = ?
    ORDER BY i.id ASC
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...receipt,
      items: items.results
    }
  });
}

async function createReceipt(request, env) {
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
    order_id = null,
    receipt_date,
    received_by = null,
    notes = null,
    items
  } = body;

  if (
    !document_no ||
    !factory_id ||
    !receipt_date ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, pabrik, tanggal penerimaan, dan minimal satu item wajib diisi."
    }, 400);
  }

  for (const item of items) {
    const rolls = Number(item.roll_count);
    const quantity = Number(item.received_qty);

    if (
      !item.model_id ||
      !Number.isInteger(rolls) ||
      rolls < 0 ||
      !Number.isInteger(quantity) ||
      quantity < 0
    ) {
      return json({
        success: false,
        message: "Model, jumlah roll, dan jumlah potongan harus valid."
      }, 400);
    }
  }

  const factory = await env.DB.prepare(`
    SELECT id
    FROM factories
    WHERE id = ? AND status = 'active'
  `).bind(factory_id).first();

  if (!factory) {
    return json({
      success: false,
      message: "Pabrik tidak ditemukan atau tidak aktif."
    }, 404);
  }

  if (order_id) {
    const order = await env.DB.prepare(`
      SELECT id
      FROM factory_orders
      WHERE id = ? AND factory_id = ?
    `).bind(order_id, factory_id).first();

    if (!order) {
      return json({
        success: false,
        message: "Pesanan tidak ditemukan atau bukan milik pabrik tersebut."
      }, 400);
    }
  }

  for (const item of items) {
    if (item.order_item_id) {
      if (!order_id) {
        return json({
          success: false,
          message: "Item pesanan hanya bisa dihubungkan jika penerimaan memiliki order_id."
        }, 400);
      }

      const orderItem = await env.DB.prepare(`
        SELECT id, model_id, color_id
        FROM factory_order_items
        WHERE id = ? AND order_id = ?
      `).bind(item.order_item_id, order_id).first();

      if (
        !orderItem ||
        orderItem.model_id !== item.model_id ||
        (orderItem.color_id || null) !== (item.color_id || null)
      ) {
        return json({
          success: false,
          message: "Item penerimaan tidak cocok dengan item pesanan."
        }, 400);
      }
    }
  }

  const receiptId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO material_receipts (
        id, document_no, factory_id, order_id,
        receipt_date, received_by, notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      receiptId,
      String(document_no).trim(),
      factory_id,
      order_id,
      receipt_date,
      received_by,
      notes
    )
  ];

  for (const item of items) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO material_receipt_items (
          id, receipt_id, order_item_id, model_id,
          color_id, roll_count, received_qty, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        receiptId,
        item.order_item_id || null,
        item.model_id,
        item.color_id || null,
        Number(item.roll_count),
        Number(item.received_qty),
        item.notes || null
      )
    );
  }

  try {
    await env.DB.batch(statements);

    return json({
      success: true,
      message: "Penerimaan potongan berhasil disimpan.",
      data: {
        id: receiptId,
        document_no: String(document_no).trim(),
        item_count: items.length
      }
    }, 201);
  } catch (error) {
    console.error("Create receipt:", error);

    return json({
      success: false,
      message: "Penerimaan gagal disimpan. Periksa nomor dokumen dan data item."
    }, 400);
  }
}

export async function handleReceipts(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/receipts" && method === "GET") {
    return listReceipts(request, env);
  }

  if (path === "/api/receipts" && method === "POST") {
    return createReceipt(request, env);
  }

  const match = path.match(/^\/api\/receipts\/([^/]+)$/);

  if (match && method === "GET") {
    return getReceipt(match[1], env);
  }

  return json({
    success: false,
    message: "Metode atau jalur penerimaan tidak tersedia."
  }, 405);
}
