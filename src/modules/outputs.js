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

const toNonNegativeInt = (value) =>
  Number.isSafeInteger(value) && value >= 0;

async function listOutputs(request, env) {
  const url = new URL(request.url);
  const workerId = url.searchParams.get("worker_id");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100
  );

  let sql = `
    SELECT
      o.id,
      o.document_no,
      o.worker_id,
      w.name AS worker_name,
      o.output_date,
      o.notes,
      o.created_at,
      COALESCE(SUM(i.good_qty), 0) AS good_qty,
      COALESCE(SUM(i.defective_qty), 0) AS defective_qty,
      COALESCE(SUM(i.repair_qty), 0) AS repair_qty
    FROM sewing_outputs o
    JOIN workers w ON w.id = o.worker_id
    LEFT JOIN sewing_output_items i ON i.output_id = o.id
  `;

  const params = [];

  if (workerId) {
    sql += " WHERE o.worker_id = ?";
    params.push(workerId);
  }

  sql += `
    GROUP BY o.id
    ORDER BY o.output_date DESC, o.created_at DESC
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

async function getOutput(id, env) {
  const output = await env.DB.prepare(`
    SELECT
      o.*,
      w.name AS worker_name,
      w.phone AS worker_phone
    FROM sewing_outputs o
    JOIN workers w ON w.id = o.worker_id
    WHERE o.id = ?
  `).bind(id).first();

  if (!output) {
    return json({
      success: false,
      message: "Data setoran tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      i.*,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name,
      a.document_no AS allocation_document_no,
      a.allocation_date
    FROM sewing_output_items i
    JOIN product_models m ON m.id = i.model_id
    LEFT JOIN product_colors c ON c.id = i.color_id
    JOIN work_allocation_items ai ON ai.id = i.allocation_item_id
    JOIN work_allocations a ON a.id = ai.allocation_id
    WHERE i.output_id = ?
    ORDER BY m.name, c.name
  `).bind(id).all();

  return json({
    success: true,
    data: {
      ...output,
      items: items.results
    }
  });
}

async function createOutput(request, env) {
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
    output_date,
    notes = "",
    items
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    typeof worker_id !== "string" ||
    !worker_id.trim() ||
    !isValidDate(output_date) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, penjahit, tanggal, dan rincian setoran wajib diisi."
    }, 400);
  }

  if (items.length > 100) {
    return json({
      success: false,
      message: "Maksimal 100 rincian dalam satu setoran."
    }, 400);
  }

  const worker = await env.DB.prepare(`
    SELECT id, name
    FROM workers
    WHERE id = ? AND status = 'active'
  `).bind(worker_id).first();

  if (!worker) {
    return json({
      success: false,
      message: "Penjahit tidak ditemukan atau tidak aktif."
    }, 404);
  }

  const normalizedItems = [];
  const seenAllocationItems = new Set();

  for (const item of items) {
    if (
      !item ||
      typeof item.allocation_item_id !== "string" ||
      !item.allocation_item_id.trim() ||
      !toNonNegativeInt(Number(item.good_qty)) ||
      !toNonNegativeInt(Number(item.defective_qty)) ||
      !toNonNegativeInt(Number(item.repair_qty))
    ) {
      return json({
        success: false,
        message: "Rincian setoran tidak valid. Jumlah harus berupa bilangan bulat nol atau lebih."
      }, 400);
    }

    const allocationItemId = item.allocation_item_id.trim();
    const goodQty = Number(item.good_qty);
    const defectiveQty = Number(item.defective_qty);
    const repairQty = Number(item.repair_qty);
    const totalReturned = goodQty + defectiveQty + repairQty;

    if (!Number.isSafeInteger(totalReturned) || totalReturned <= 0) {
      return json({
        success: false,
        message: "Jumlah hasil setiap rincian harus lebih dari nol."
      }, 400);
    }

    if (seenAllocationItems.has(allocationItemId)) {
      return json({
        success: false,
        message: "Potongan yang sama tidak boleh dimasukkan dua kali dalam satu setoran."
      }, 400);
    }

    seenAllocationItems.add(allocationItemId);

    const allocation = await env.DB.prepare(`
      SELECT
        ai.id,
        ai.model_id,
        ai.color_id,
        ai.allocated_qty,
        a.worker_id
      FROM work_allocation_items ai
      JOIN work_allocations a ON a.id = ai.allocation_id
      WHERE ai.id = ?
    `).bind(allocationItemId).first();

    if (!allocation || allocation.worker_id !== worker_id) {
      return json({
        success: false,
        message: "Potongan tidak ditemukan atau bukan milik penjahit ini."
      }, 400);
    }

    const previous = await env.DB.prepare(`
      SELECT COALESCE(
        SUM(i.good_qty + i.defective_qty + i.repair_qty),
        0
      ) AS returned_qty
      FROM sewing_output_items i
      WHERE i.allocation_item_id = ?
    `).bind(allocationItemId).first();

    const remaining = allocation.allocated_qty - Number(previous.returned_qty || 0);

    if (totalReturned > remaining) {
      return json({
        success: false,
        message: `Jumlah setoran melebihi sisa potongan. Sisa yang boleh disetor: ${Math.max(remaining, 0)} pcs.`
      }, 400);
    }

    normalizedItems.push({
      allocation_item_id: allocationItemId,
      model_id: allocation.model_id,
      color_id: allocation.color_id,
      good_qty: goodQty,
      defective_qty: defectiveQty,
      repair_qty: repairQty,
      notes: typeof item.notes === "string" ? item.notes.trim() : ""
    });
  }

  const outputId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO sewing_outputs (
        id, document_no, worker_id, output_date, notes
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      outputId,
      document_no.trim(),
      worker_id,
      output_date,
      typeof notes === "string" ? notes.trim() : ""
    )
  ];

  for (const item of normalizedItems) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO sewing_output_items (
          id,
          output_id,
          allocation_item_id,
          model_id,
          color_id,
          good_qty,
          defective_qty,
          repair_qty,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        outputId,
        item.allocation_item_id,
        item.model_id,
        item.color_id,
        item.good_qty,
        item.defective_qty,
        item.repair_qty,
        item.notes
      )
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Create sewing output:", error);

    return json({
      success: false,
      message: "Setoran gagal disimpan. Periksa nomor dokumen dan data rincian."
    }, 400);
  }

  return json({
    success: true,
    message: "Setoran hasil jahitan berhasil disimpan.",
    data: {
      id: outputId,
      document_no: document_no.trim(),
      worker_id,
      output_date,
      item_count: normalizedItems.length
    }
  }, 201);
}

export async function handleOutputs(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/outputs";

  if (path === base && request.method === "GET") {
    return listOutputs(request, env);
  }

  if (path === base && request.method === "POST") {
    return createOutput(request, env);
  }

  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID setoran tidak valid."
      }, 400);
    }

    return getOutput(id, env);
  }

  return json({
    success: false,
    message: "Endpoint setoran tidak ditemukan."
  }, 404);
}
