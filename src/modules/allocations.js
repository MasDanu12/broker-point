const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const isValidDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const isInt = (value) => Number.isSafeInteger(value);

async function listAllocations(request, env) {
  const url = new URL(request.url);
  const workerId = url.searchParams.get("worker_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100
  );
  let sql = `
    SELECT
      a.id,
      a.document_no,
      a.worker_id,
      w.name AS worker_name,
      a.allocation_date,
      a.notes,
      a.created_at,
      COUNT(i.id) AS item_count,
      COALESCE(SUM(i.allocated_qty), 0) AS total_qty
    FROM work_allocations a
    JOIN workers w ON w.id = a.worker_id
    LEFT JOIN work_allocation_items i ON i.allocation_id = a.id
  `;
  const params = [];
  if (workerId) {
    sql += " WHERE a.worker_id = ?";
    params.push(workerId);
  }
  sql += `
    GROUP BY a.id
    ORDER BY a.allocation_date DESC, a.created_at DESC
    LIMIT ?
  `;
  params.push(limit);
  const result = await env.DB.prepare(sql).bind(...params).all();
  return json({ success: true, data: result.results });
}

async function listAvailable(env) {
  const result = await env.DB.prepare(`
    SELECT * FROM (
      SELECT
        ri.id AS material_item_id,
        ri.model_id,
        m.code AS model_code,
        m.name AS model_name,
        ri.color_id,
        c.name AS color_name,
        r.document_no AS receipt_document_no,
        r.receipt_date,
        f.name AS factory_name,
        ri.received_qty,
        COALESCE((
          SELECT SUM(ai.allocated_qty)
          FROM work_allocation_items ai
          WHERE ai.material_item_id = ri.id
        ), 0) AS allocated_qty,
        oi.factory_rate AS suggested_factory_rate
      FROM material_receipt_items ri
      JOIN material_receipts r ON r.id = ri.receipt_id
      JOIN factories f ON f.id = r.factory_id
      JOIN product_models m ON m.id = ri.model_id
      LEFT JOIN product_colors c ON c.id = ri.color_id
      LEFT JOIN factory_order_items oi ON oi.id = ri.order_item_id
    )
    WHERE received_qty - allocated_qty > 0
    ORDER BY receipt_date DESC, material_item_id
  `).all();
  const data = result.results.map((row) => ({
    ...row,
    remaining_qty: row.received_qty - row.allocated_qty
  }));
  return json({ success: true, data });
}

async function getAllocation(id, env) {
  const allocation = await env.DB.prepare(`
    SELECT a.*, w.name AS worker_name, w.phone AS worker_phone
    FROM work_allocations a
    JOIN workers w ON w.id = a.worker_id
    WHERE a.id = ?
  `).bind(id).first();
  if (!allocation) {
    return json({
      success: false,
      message: "Data pembagian tidak ditemukan."
    }, 404);
  }
  const items = await env.DB.prepare(`
    SELECT
      ai.*,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name,
      r.document_no AS receipt_document_no
    FROM work_allocation_items ai
    JOIN product_models m ON m.id = ai.model_id
    LEFT JOIN product_colors c ON c.id = ai.color_id
    JOIN material_receipt_items ri ON ri.id = ai.material_item_id
    JOIN material_receipts r ON r.id = ri.receipt_id
    WHERE ai.allocation_id = ?
    ORDER BY m.name, c.name
  `).bind(id).all();
  return json({
    success: true,
    data: { ...allocation, items: items.results }
  });
}

async function createAllocation(request, env) {
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
    allocation_date,
    notes = "",
    items
  } = body || {};
  if (
    typeof document_no !== "string" || !document_no.trim() ||
    typeof worker_id !== "string" || !worker_id.trim() ||
    !isValidDate(allocation_date) ||
    !Array.isArray(items) || items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, penjahit, tanggal, dan rincian wajib diisi."
    }, 400);
  }
  if (items.length > 100) {
    return json({
      success: false,
      message: "Maksimal 100 rincian dalam satu pembagian."
    }, 400);
  }
  const worker = await env.DB.prepare(`
    SELECT id FROM workers WHERE id = ? AND status = 'active'
  `).bind(worker_id).first();
  if (!worker) {
    return json({
      success: false,
      message: "Penjahit tidak ditemukan atau tidak aktif."
    }, 404);
  }
  const normalized = [];
  const seen = new Set();
  for (const item of items) {
    const workerRate = item && item.worker_rate != null
      ? item.worker_rate : 0;
    const customFactoryRate = item ? item.factory_rate : null;
    if (
      !item ||
      typeof item.material_item_id !== "string" ||
      !item.material_item_id.trim() ||
      !isInt(item.allocated_qty) || item.allocated_qty <= 0 ||
      !isInt(workerRate) || workerRate < 0 ||
      (customFactoryRate != null &&
        (!isInt(customFactoryRate) || customFactoryRate < 0))
    ) {
      return json({
        success: false,
        message: "Rincian tidak valid. Jumlah harus bilangan bulat lebih dari nol dan tarif tidak boleh negatif."
      }, 400);
    }
    const materialItemId = item.material_item_id.trim();
    if (seen.has(materialItemId)) {
      return json({
        success: false,
        message: "Potongan yang sama tidak boleh dimasukkan dua kali."
      }, 400);
    }
    seen.add(materialItemId);
    const material = await env.DB.prepare(`
      SELECT
        ri.id,
        ri.model_id,
        ri.color_id,
        ri.received_qty,
        oi.factory_rate AS order_factory_rate
      FROM material_receipt_items ri
      LEFT JOIN factory_order_items oi ON oi.id = ri.order_item_id
      WHERE ri.id = ?
    `).bind(materialItemId).first();
    if (!material) {
      return json({
        success: false,
        message: "Data potongan tidak ditemukan."
      }, 400);
    }
    const previous = await env.DB.prepare(`
      SELECT COALESCE(SUM(allocated_qty), 0) AS allocated_qty
      FROM work_allocation_items
      WHERE material_item_id = ?
    `).bind(materialItemId).first();
    const remaining =
      material.received_qty - Number(previous.allocated_qty || 0);
    if (item.allocated_qty > remaining) {
      return json({
        success: false,
        message: `Jumlah melebihi sisa potongan. Sisa yang bisa dibagikan: ${Math.max(remaining, 0)} pcs.`
      }, 400);
    }
    normalized.push({
      material_item_id: materialItemId,
      model_id: material.model_id,
      color_id: material.color_id,
      allocated_qty: item.allocated_qty,
      worker_rate: workerRate,
      factory_rate:
        customFactoryRate ?? material.order_factory_rate ?? 0,
      notes: typeof item.notes === "string" ? item.notes.trim() : ""
    });
  }
  const allocationId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(`
      INSERT INTO work_allocations (
        id, document_no, worker_id, allocation_date, notes
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      allocationId,
      document_no.trim(),
      worker_id,
      allocation_date,
      typeof notes === "string" ? notes.trim() : ""
    )
  ];
  for (const item of normalized) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO work_allocation_items (
          id, allocation_id, material_item_id, model_id, color_id,
          allocated_qty, worker_rate, factory_rate, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        allocationId,
        item.material_item_id,
        item.model_id,
        item.color_id,
        item.allocated_qty,
        item.worker_rate,
        item.factory_rate,
        item.notes
      )
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Create allocation:", error);
    return json({
      success: false,
      message: "Pembagian gagal disimpan. Periksa nomor dokumen dan rincian."
    }, 400);
  }
  return json({
    success: true,
    message: "Pembagian potongan ke penjahit berhasil dicatat.",
    data: {
      id: allocationId,
      document_no: document_no.trim(),
      worker_id,
      allocation_date,
      item_count: normalized.length,
      total_qty: normalized.reduce((s, i) => s + i.allocated_qty, 0)
    }
  }, 201);
}

export async function handleAllocations(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/allocations";
  if (path === base && request.method === "GET") {
    return listAllocations(request, env);
  }
  if (path === base && request.method === "POST") {
    return createAllocation(request, env);
  }
  if (path === `${base}/available` && request.method === "GET") {
    return listAvailable(env);
  }
  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);
    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID pembagian tidak valid."
      }, 400);
    }
    return getAllocation(id, env);
  }
  return json({
    success: false,
    message: "Endpoint pembagian tidak ditemukan."
  }, 404);
}
