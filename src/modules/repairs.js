const json = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};

async function listRepairs(request, env) {
  const url = new URL(request.url);
  const workerId = url.searchParams.get("worker_id");
  const status = url.searchParams.get("status");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100
  );

  let sql = `
    SELECT
      r.id,
      r.document_no,
      r.inspection_item_id,
      r.worker_id,
      w.name AS worker_name,
      r.repair_qty,
      r.reason,
      r.status,
      r.opened_at,
      r.closed_at,
      f.name AS factory_name,
      d.document_no AS delivery_document_no,
      m.name AS model_name,
      c.name AS color_name
    FROM repair_cases r
    JOIN workers w ON w.id = r.worker_id
    JOIN factory_inspection_items ii
      ON ii.id = r.inspection_item_id
    JOIN factory_inspections ins
      ON ins.id = ii.inspection_id
    JOIN factory_deliveries d ON d.id = ins.delivery_id
    JOIN factories f ON f.id = d.factory_id
    JOIN factory_delivery_items di
      ON di.id = ii.delivery_item_id
    JOIN product_models m ON m.id = di.model_id
    LEFT JOIN product_colors c ON c.id = di.color_id
    WHERE 1 = 1
  `;

  const params = [];

  if (workerId) {
    sql += " AND r.worker_id = ?";
    params.push(workerId);
  }

  if (status) {
    sql += " AND r.status = ?";
    params.push(status);
  }

  sql += `
    ORDER BY r.opened_at DESC
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

async function getRepair(id, env) {
  const repair = await env.DB.prepare(`
    SELECT
      r.*,
      w.name AS worker_name,
      w.phone AS worker_phone,
      f.name AS factory_name,
      d.document_no AS delivery_document_no,
      ins.document_no AS inspection_document_no,
      m.name AS model_name,
      c.name AS color_name
    FROM repair_cases r
    JOIN workers w ON w.id = r.worker_id
    JOIN factory_inspection_items ii
      ON ii.id = r.inspection_item_id
    JOIN factory_inspections ins
      ON ins.id = ii.inspection_id
    JOIN factory_deliveries d ON d.id = ins.delivery_id
    JOIN factories f ON f.id = d.factory_id
    JOIN factory_delivery_items di
      ON di.id = ii.delivery_item_id
    JOIN product_models m ON m.id = di.model_id
    LEFT JOIN product_colors c ON c.id = di.color_id
    WHERE r.id = ?
  `).bind(id).first();

  if (!repair) {
    return json({
      success: false,
      message: "Kasus perbaikan tidak ditemukan."
    }, 404);
  }

  const history = await env.DB.prepare(`
    SELECT id, action, quantity, notes, created_at
    FROM repair_history
    WHERE repair_case_id = ?
    ORDER BY created_at ASC
  `).bind(id).all();

  const totals = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(
        CASE WHEN action = 'sent_to_worker'
        THEN quantity ELSE 0 END
      ), 0) AS sent_qty,
      COALESCE(SUM(
        CASE WHEN action = 'received_from_worker'
        THEN quantity ELSE 0 END
      ), 0) AS received_qty,
      COALESCE(SUM(
        CASE WHEN action = 'resubmitted_to_factory'
        THEN quantity ELSE 0 END
      ), 0) AS resubmitted_qty
    FROM repair_history
    WHERE repair_case_id = ?
  `).bind(id).first();

  return json({
    success: true,
    data: {
      ...repair,
      progress: totals,
      history: history.results
    }
  });
}

async function addRepairHistory(request, env, id) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      message: "Format JSON tidak valid."
    }, 400);
  }

  const { action, quantity, notes = "" } = body || {};

  const allowedActions = [
    "sent_to_worker",
    "received_from_worker",
    "resubmitted_to_factory"
  ];

  if (
    !allowedActions.includes(action) ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    return json({
      success: false,
      message: "Jenis tindakan atau jumlah perbaikan tidak valid."
    }, 400);
  }

  const repair = await env.DB.prepare(`
    SELECT id, repair_qty, status
    FROM repair_cases
    WHERE id = ?
  `).bind(id).first();

  if (!repair) {
    return json({
      success: false,
      message: "Kasus perbaikan tidak ditemukan."
    }, 404);
  }

  if (repair.status === "completed") {
    return json({
      success: false,
      message: "Kasus perbaikan sudah selesai."
    }, 400);
  }

  const totals = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(
        CASE WHEN action = 'sent_to_worker'
        THEN quantity ELSE 0 END
      ), 0) AS sent_qty,
      COALESCE(SUM(
        CASE WHEN action = 'received_from_worker'
        THEN quantity ELSE 0 END
      ), 0) AS received_qty,
      COALESCE(SUM(
        CASE WHEN action = 'resubmitted_to_factory'
        THEN quantity ELSE 0 END
      ), 0) AS resubmitted_qty
    FROM repair_history
    WHERE repair_case_id = ?
  `).bind(id).first();

  const sent = Number(totals.sent_qty || 0);
  const received = Number(totals.received_qty || 0);
  const resubmitted = Number(totals.resubmitted_qty || 0);

  if (action === "sent_to_worker" &&
      quantity > repair.repair_qty - sent) {
    return json({
      success: false,
      message: "Jumlah yang dikirim ke penjahit melebihi sisa kasus perbaikan."
    }, 400);
  }

  if (action === "received_from_worker" &&
      quantity > sent - received) {
    return json({
      success: false,
      message: "Jumlah yang diterima melebihi jumlah yang pernah dikirim ke penjahit."
    }, 400);
  }

  if (action === "resubmitted_to_factory" &&
      quantity > received - resubmitted) {
    return json({
      success: false,
      message: "Jumlah yang dikirim ulang melebihi hasil perbaikan yang sudah diterima."
    }, 400);
  }

  const newResubmitted =
    action === "resubmitted_to_factory"
      ? resubmitted + quantity
      : resubmitted;

  const newStatus =
    newResubmitted === repair.repair_qty
      ? "completed"
      : "in_progress";

  const historyId = crypto.randomUUID();

  const statements = [
    env.DB.prepare(`
      INSERT INTO repair_history (
        id,
        repair_case_id,
        action,
        quantity,
        notes
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(
      historyId,
      id,
      action,
      quantity,
      typeof notes === "string" ? notes.trim() : ""
    ),
    env.DB.prepare(`
      UPDATE repair_cases
      SET status = ?,
          closed_at = CASE
            WHEN ? = 'completed' THEN CURRENT_TIMESTAMP
            ELSE NULL
          END
      WHERE id = ?
    `).bind(newStatus, newStatus, id)
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Add repair history:", error);

    return json({
      success: false,
      message: "Riwayat perbaikan gagal disimpan."
    }, 400);
  }

  return json({
    success: true,
    message: "Riwayat perbaikan berhasil dicatat.",
    data: {
      id: historyId,
      repair_case_id: id,
      action,
      quantity,
      status: newStatus
    }
  }, 201);
}

export async function handleRepairs(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/repairs";

  if (path === base && request.method === "GET") {
    return listRepairs(request, env);
  }

  if (path.startsWith(`${base}/`)) {
    const remainder = path.slice(base.length + 1);
    const parts = remainder.split("/");

    if (parts.length === 1 && parts[0] && request.method === "GET") {
      return getRepair(parts[0], env);
    }

    if (
      parts.length === 2 &&
      parts[0] &&
      parts[1] === "history" &&
      request.method === "POST"
    ) {
      return addRepairHistory(request, env, parts[0]);
    }
  }

  return json({
    success: false,
    message: "Endpoint perbaikan tidak ditemukan."
  }, 404);
}
