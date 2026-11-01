const json = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};

const isValidDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

async function listDeliveries(request, env) {
  const url = new URL(request.url);
  const factoryId = url.searchParams.get("factory_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100
  );

  let sql = `
    SELECT
      d.id,
      d.document_no,
      d.factory_id,
      f.name AS factory_name,
      d.delivery_date,
      d.delivery_status,
      d.notes,
      d.created_at,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.delivered_qty), 0) AS total_qty
    FROM factory_deliveries d
    JOIN factories f ON f.id = d.factory_id
    LEFT JOIN factory_delivery_items i ON i.delivery_id = d.id
  `;

  const params = [];

  if (factoryId) {
    sql += " WHERE d.factory_id = ?";
    params.push(factoryId);
  }

  sql += `
    GROUP BY d.id
    ORDER BY d.delivery_date DESC, d.created_at DESC
    LIMIT ?
  `;

  params.push(limit);

  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  return json({
    success: true,
    data: result.results
  });
}

async function getDelivery(id, env) {
  const delivery = await env.DB.prepare(`
    SELECT
      d.*,
      f.name AS factory_name,
      f.phone AS factory_phone,
      f.contact_person
    FROM factory_deliveries d
    JOIN factories f ON f.id = d.factory_id
    WHERE d.id = ?
  `).bind(id).first();

  if (!delivery) {
    return json({
      success: false,
      message: "Data pengiriman tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      i.*,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name,
      o.document_no AS output_document_no,
      o.output_date,
      w.id AS worker_id,
      w.name AS worker_name
    FROM factory_delivery_items i
    JOIN sewing_output_items oi ON oi.id = i.output_item_id
    JOIN sewing_outputs o ON o.id = oi.output_id
    JOIN workers w ON w.id = o.worker_id
    JOIN product_models m ON m.id = i.model_id
    LEFT JOIN product_colors c ON c.id = i.color_id
    WHERE i.delivery_id = ?
    ORDER BY w.name, m.name, c.name
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...delivery,
      items: items.results
    }
  });
}

async function createDelivery(request, env) {
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
    delivery_date,
    notes = "",
    items
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof factory_id !== "string" ||
    !factory_id.trim() ||
    !isValidDate(delivery_date) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, pabrik, tanggal, dan rincian pengiriman wajib diisi."
    }, 400);
  }

  if (items.length > 100) {
    return json({
      success: false,
      message: "Maksimal 100 rincian dalam satu pengiriman."
    }, 400);
  }

  const factory = await env.DB.prepare(`
    SELECT id, name
    FROM factories
    WHERE id = ? AND status = 'active'
  `).bind(factory_id).first();

  if (!factory) {
    return json({
      success: false,
      message: "Pabrik tidak ditemukan atau tidak aktif."
    }, 404);
  }

  const normalizedItems = [];
  const seenOutputItems = new Set();

  for (const item of items) {
    if (
      !item ||
      typeof item.output_item_id !== "string" ||
      !item.output_item_id.trim() ||
      !Number.isSafeInteger(item.delivered_qty) ||
      item.delivered_qty <= 0
    ) {
      return json({
        success: false,
        message: "Rincian pengiriman tidak valid. Jumlah kirim harus bilangan bulat lebih dari nol."
      }, 400);
    }

    const outputItemId = item.output_item_id.trim();

    if (seenOutputItems.has(outputItemId)) {
      return json({
        success: false,
        message: "Hasil jahitan yang sama tidak boleh dimasukkan dua kali dalam satu pengiriman."
      }, 400);
    }

    seenOutputItems.add(outputItemId);

    const outputItem = await env.DB.prepare(`
      SELECT
        oi.id,
        oi.model_id,
        oi.color_id,
        oi.good_qty,
        o.worker_id,
        r.factory_id,
        ai.factory_rate
      FROM sewing_output_items oi
      JOIN sewing_outputs o ON o.id = oi.output_id
      JOIN work_allocation_items ai ON ai.id = oi.allocation_item_id
      JOIN material_receipt_items ri ON ri.id = ai.material_item_id
      JOIN material_receipts r ON r.id = ri.receipt_id
      WHERE oi.id = ?
    `).bind(outputItemId).first();

    if (!outputItem) {
      return json({
        success: false,
        message: "Data hasil jahitan tidak ditemukan."
      }, 400);
    }

    if (outputItem.factory_id !== factory_id) {
      return json({
        success: false,
        message: "Hasil jahitan ini berasal dari pabrik yang berbeda."
      }, 400);
    }

    const previous = await env.DB.prepare(`
      SELECT COALESCE(SUM(delivered_qty), 0) AS delivered_qty
      FROM factory_delivery_items
      WHERE output_item_id = ?
    `).bind(outputItemId).first();

    const remaining = outputItem.good_qty - Number(previous.delivered_qty || 0);

    if (item.delivered_qty > remaining) {
      return json({
        success: false,
        message: `Jumlah kirim melebihi hasil bagus yang tersedia. Sisa yang bisa dikirim: ${Math.max(remaining, 0)} pcs.`
      }, 400);
    }

    normalizedItems.push({
      output_item_id: outputItemId,
      model_id: outputItem.model_id,
      color_id: outputItem.color_id,
      delivered_qty: item.delivered_qty,
      factory_rate: outputItem.factory_rate,
      notes: typeof item.notes === "string" ? item.notes.trim() : ""
    });
  }

  const deliveryId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO factory_deliveries (
        id,
        document_no,
        factory_id,
        delivery_date,
        delivery_status,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      deliveryId,
      document_no.trim(),
      factory_id,
      delivery_date,
      "submitted",
      typeof notes === "string" ? notes.trim() : ""
    )
  ];

  for (const item of normalizedItems) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO factory_delivery_items (
          id,
          delivery_id,
          output_item_id,
          model_id,
          color_id,
          delivered_qty,
          factory_rate,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        deliveryId,
        item.output_item_id,
        item.model_id,
        item.color_id,
        item.delivered_qty,
        item.factory_rate,
        item.notes
      )
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Create factory delivery:", error);

    return json({
      success: false,
      message: "Pengiriman gagal disimpan. Periksa nomor dokumen dan rincian barang."
    }, 400);
  }

  return json({
    success: true,
    message: "Pengiriman ke pabrik berhasil dicatat.",
    data: {
      id: deliveryId,
      document_no: document_no.trim(),
      factory_id,
      delivery_date,
      item_count: normalizedItems.length,
      total_qty: normalizedItems.reduce(
        (sum, item) => sum + item.delivered_qty,
        0
      )
    }
  }, 201);
}

export async function handleDeliveries(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/deliveries";

  if (path === base && request.method === "GET") {
    return listDeliveries(request, env);
  }

  if (path === base && request.method === "POST") {
    return createDelivery(request, env);
  }

  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID pengiriman tidak valid."
      }, 400);
    }

    return getDelivery(id, env);
  }

  return json({
    success: false,
    message: "Endpoint pengiriman tidak ditemukan."
  }, 404);
}
