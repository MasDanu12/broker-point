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

const isValidQty = (value) =>
  Number.isSafeInteger(value) && value >= 0;

async function listInspections(request, env) {
  const url = new URL(request.url);
  const deliveryId = url.searchParams.get("delivery_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100
  );

  let sql = `
    SELECT
      i.id,
      i.document_no,
      i.delivery_id,
      d.document_no AS delivery_document_no,
      f.name AS factory_name,
      i.inspection_date,
      i.notes,
      i.created_at,
      COUNT(ii.id) AS item_count,
      COALESCE(SUM(ii.accepted_qty), 0) AS accepted_qty,
      COALESCE(SUM(ii.rejected_qty), 0) AS rejected_qty,
      COALESCE(SUM(ii.repair_qty), 0) AS repair_qty
    FROM factory_inspections i
    JOIN factory_deliveries d ON d.id = i.delivery_id
    JOIN factories f ON f.id = d.factory_id
    LEFT JOIN factory_inspection_items ii
      ON ii.inspection_id = i.id
  `;

  const params = [];

  if (deliveryId) {
    sql += " WHERE i.delivery_id = ?";
    params.push(deliveryId);
  }

  sql += `
    GROUP BY i.id
    ORDER BY i.inspection_date DESC, i.created_at DESC
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

async function getInspection(id, env) {
  const inspection = await env.DB.prepare(`
    SELECT
      i.*,
      d.document_no AS delivery_document_no,
      d.delivery_date,
      f.id AS factory_id,
      f.name AS factory_name
    FROM factory_inspections i
    JOIN factory_deliveries d ON d.id = i.delivery_id
    JOIN factories f ON f.id = d.factory_id
    WHERE i.id = ?
  `).bind(id).first();

  if (!inspection) {
    return json({
      success: false,
      message: "Data pemeriksaan tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      ii.*,
      di.output_item_id,
      di.delivered_qty,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name,
      w.id AS worker_id,
      w.name AS worker_name
    FROM factory_inspection_items ii
    JOIN factory_delivery_items di
      ON di.id = ii.delivery_item_id
    JOIN product_models m ON m.id = di.model_id
    LEFT JOIN product_colors c ON c.id = di.color_id
    JOIN sewing_output_items oi ON oi.id = di.output_item_id
    JOIN sewing_outputs o ON o.id = oi.output_id
    JOIN workers w ON w.id = o.worker_id
    WHERE ii.inspection_id = ?
    ORDER BY w.name, m.name, c.name
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...inspection,
      items: items.results
    }
  });
}

async function createInspection(request, env) {
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
    delivery_id,
    inspection_date,
    notes = "",
    items
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof delivery_id !== "string" ||
    !delivery_id.trim() ||
    !isValidDate(inspection_date) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, pengiriman, tanggal pemeriksaan, dan rincian wajib diisi."
    }, 400);
  }

  if (items.length > 100) {
    return json({
      success: false,
      message: "Maksimal 100 rincian dalam satu pemeriksaan."
    }, 400);
  }

  const delivery = await env.DB.prepare(`
    SELECT id, factory_id, document_no
    FROM factory_deliveries
    WHERE id = ?
  `).bind(delivery_id).first();

  if (!delivery) {
    return json({
      success: false,
      message: "Data pengiriman tidak ditemukan."
    }, 404);
  }

  const normalizedItems = [];
  const seenItems = new Set();

  for (const item of items) {
    if (
      !item ||
      typeof item.delivery_item_id !== "string" ||
      !item.delivery_item_id.trim() ||
      !isValidQty(item.accepted_qty) ||
      !isValidQty(item.rejected_qty) ||
      !isValidQty(item.repair_qty)
    ) {
      return json({
        success: false,
        message: "Rincian pemeriksaan tidak valid. Jumlah harus bilangan bulat nol atau lebih."
      }, 400);
    }

    const deliveryItemId = item.delivery_item_id.trim();

    if (seenItems.has(deliveryItemId)) {
      return json({
        success: false,
        message: "Barang yang sama tidak boleh dimasukkan dua kali dalam satu pemeriksaan."
      }, 400);
    }

    seenItems.add(deliveryItemId);

    const inspectedQty =
      item.accepted_qty +
      item.rejected_qty +
      item.repair_qty;

    if (
      !Number.isSafeInteger(inspectedQty) ||
      inspectedQty <= 0
    ) {
      return json({
        success: false,
        message: "Jumlah hasil pemeriksaan harus lebih dari nol."
      }, 400);
    }

    const deliveryItem = await env.DB.prepare(`
      SELECT id, delivered_qty
      FROM factory_delivery_items
      WHERE id = ? AND delivery_id = ?
    `).bind(deliveryItemId, delivery_id).first();

    if (!deliveryItem) {
      return json({
        success: false,
        message: "Rincian barang tidak ditemukan dalam pengiriman ini."
      }, 400);
    }

    const previous = await env.DB.prepare(`
      SELECT COALESCE(
        SUM(accepted_qty + rejected_qty + repair_qty),
        0
      ) AS inspected_qty
      FROM factory_inspection_items
      WHERE delivery_item_id = ?
    `).bind(deliveryItemId).first();

    const remaining =
      deliveryItem.delivered_qty -
      Number(previous.inspected_qty || 0);

    if (inspectedQty > remaining) {
      return json({
        success: false,
        message: `Jumlah pemeriksaan melebihi barang yang belum diperiksa. Sisa: ${Math.max(remaining, 0)} pcs.`
      }, 400);
    }

    normalizedItems.push({
      delivery_item_id: deliveryItemId,
      accepted_qty: item.accepted_qty,
      rejected_qty: item.rejected_qty,
      repair_qty: item.repair_qty,
      notes: typeof item.notes === "string"
        ? item.notes.trim()
        : ""
    });
  }

  const inspectionId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO factory_inspections (
        id,
        document_no,
        delivery_id,
        inspection_date,
        notes
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      inspectionId,
      document_no.trim(),
      delivery_id,
      inspection_date,
      typeof notes === "string" ? notes.trim() : ""
    )
  ];

  for (const item of normalizedItems) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO factory_inspection_items (
          id,
          inspection_id,
          delivery_item_id,
          accepted_qty,
          rejected_qty,
          repair_qty,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        inspectionId,
        item.delivery_item_id,
        item.accepted_qty,
        item.rejected_qty,
        item.repair_qty,
        item.notes
      )
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Create factory inspection:", error);

    return json({
      success: false,
      message: "Pemeriksaan gagal disimpan. Periksa nomor dokumen dan rincian."
    }, 400);
  }

  return json({
    success: true,
    message: "Hasil pemeriksaan pabrik berhasil disimpan.",
    data: {
      id: inspectionId,
      document_no: document_no.trim(),
      delivery_id,
      inspection_date,
      item_count: normalizedItems.length,
      accepted_qty: normalizedItems.reduce(
        (sum, item) => sum + item.accepted_qty, 0
      ),
      rejected_qty: normalizedItems.reduce(
        (sum, item) => sum + item.rejected_qty, 0
      ),
      repair_qty: normalizedItems.reduce(
        (sum, item) => sum + item.repair_qty, 0
      )
    }
  }, 201);
}

export async function handleInspections(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/inspections";

  if (path === base && request.method === "GET") {
    return listInspections(request, env);
  }

  if (path === base && request.method === "POST") {
    return createInspection(request, env);
  }

  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID pemeriksaan tidak valid."
      }, 400);
    }

    return getInspection(id, env);
  }

  return json({
    success: false,
    message: "Endpoint pemeriksaan tidak ditemukan."
  }, 404);
}
