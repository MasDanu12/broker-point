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

async function listPayroll(env) {
  const result = await env.DB.prepare(`
    SELECT
      p.id,
      p.period_start,
      p.period_end,
      p.status,
      p.created_at,
      COUNT(pi.id) AS item_count,
      COALESCE(SUM(pi.eligible_qty), 0) AS total_qty,
      COALESCE(SUM(pi.gross_amount), 0) AS total_gross
    FROM payroll_periods p
    LEFT JOIN payroll_items pi
      ON pi.payroll_period_id = p.id
    GROUP BY p.id
    ORDER BY p.period_start DESC
  `).all();

  return json({ success: true, data: result.results });
}

async function getPayroll(id, env) {
  const period = await env.DB.prepare(`
    SELECT *
    FROM payroll_periods
    WHERE id = ?
  `).bind(id).first();

  if (!period) {
    return json({
      success: false,
      message: "Periode penggajian tidak ditemukan."
    }, 404);
  }

  const items = await env.DB.prepare(`
    SELECT
      pi.*,
      w.name AS worker_name,
      w.phone AS worker_phone,
      o.output_date,
      o.document_no AS output_document_no,
      m.code AS model_code,
      m.name AS model_name,
      c.name AS color_name
    FROM payroll_items pi
    JOIN workers w ON w.id = pi.worker_id
    JOIN sewing_output_items oi ON oi.id = pi.output_item_id
    JOIN sewing_outputs o ON o.id = oi.output_id
    JOIN product_models m ON m.id = oi.model_id
    LEFT JOIN product_colors c ON c.id = oi.color_id
    WHERE pi.payroll_period_id = ?
    ORDER BY w.name, m.name, c.name
  `).bind(id).all();

  const summary = await env.DB.prepare(`
    SELECT
      COUNT(DISTINCT worker_id) AS worker_count,
      COALESCE(SUM(eligible_qty), 0) AS total_qty,
      COALESCE(SUM(gross_amount), 0) AS total_gross
    FROM payroll_items
    WHERE payroll_period_id = ?
  `).bind(id).first();

  return json({
    success: true,
    data: {
      ...period,
      summary,
      items: items.results
    }
  });
}

async function createPayroll(request, env) {
  let body;

  try {
    body = await request.json();
  } catch {
    return json({
      success: false,
      message: "Format JSON tidak valid."
    }, 400);
  }

  const { period_start, period_end, notes = "" } = body || {};

  if (
    !validDate(period_start) ||
    !validDate(period_end) ||
    period_start > period_end
  ) {
    return json({
      success: false,
      message: "Tanggal awal dan akhir periode tidak valid."
    }, 400);
  }

  const overlap = await env.DB.prepare(`
    SELECT id, period_start, period_end
    FROM payroll_periods
    WHERE period_start <= ?
      AND period_end >= ?
    LIMIT 1
  `).bind(period_end, period_start).first();

  if (overlap) {
    return json({
      success: false,
      message: "Periode bertumpuk dengan penggajian yang sudah dibuat.",
      existing_period: overlap
    }, 409);
  }

  const acceptedItems = await env.DB.prepare(`
    SELECT
      oi.id AS output_item_id,
      o.worker_id,
      w.name AS worker_name,
      ai.worker_rate,
      m.name AS model_name,
      c.name AS color_name,
      COALESCE(SUM(ii.accepted_qty), 0) AS accepted_total
    FROM factory_inspection_items ii
    JOIN factory_inspections ins
      ON ins.id = ii.inspection_id
    JOIN factory_delivery_items di
      ON di.id = ii.delivery_item_id
    JOIN sewing_output_items oi
      ON oi.id = di.output_item_id
    JOIN sewing_outputs o
      ON o.id = oi.output_id
    JOIN workers w
      ON w.id = o.worker_id
    JOIN work_allocation_items ai
      ON ai.id = oi.allocation_item_id
    JOIN product_models m
      ON m.id = oi.model_id
    LEFT JOIN product_colors c
      ON c.id = oi.color_id
    WHERE ins.inspection_date <= ?
    GROUP BY
      oi.id,
      o.worker_id,
      w.name,
      ai.worker_rate,
      m.name,
      c.name
    HAVING SUM(ii.accepted_qty) > 0
    ORDER BY w.name, m.name, c.name
  `).bind(period_end).all();

  const payrollId = crypto.randomUUID();
  const payrollItems = [];

  for (const item of acceptedItems.results) {
    const previouslyIncluded = await env.DB.prepare(`
      SELECT COALESCE(SUM(eligible_qty), 0) AS paid_qty
      FROM payroll_items
      WHERE output_item_id = ?
    `).bind(item.output_item_id).first();

    const eligibleQty = Math.max(
      0,
      Number(item.accepted_total || 0) - Number(previouslyIncluded.paid_qty || 0)
    );

    if (eligibleQty <= 0) continue;

    const workerRate = Number(item.worker_rate || 0);
    const grossAmount = eligibleQty * workerRate;

    if (!Number.isSafeInteger(grossAmount)) {
      return json({
        success: false,
        message: "Nilai upah terlalu besar untuk diproses."
      }, 400);
    }

    payrollItems.push({
      id: crypto.randomUUID(),
      worker_id: item.worker_id,
      output_item_id: item.output_item_id,
      eligible_qty: eligibleQty,
      worker_rate: workerRate,
      gross_amount: grossAmount,
      notes: "Berdasarkan jumlah yang diterima pabrik."
    });
  }

  const statements = [
    env.DB.prepare(`
      INSERT INTO payroll_periods (
        id,
        period_start,
        period_end,
        status
      ) VALUES (?, ?, ?, 'draft')
    `).bind(
      payrollId,
      period_start,
      period_end
    )
  ];

  for (const item of payrollItems) {
    statements.push(
      env.DB.prepare(`
        INSERT INTO payroll_items (
          id,
          payroll_period_id,
          worker_id,
          output_item_id,
          eligible_qty,
          worker_rate,
          gross_amount,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        item.id,
        payrollId,
        item.worker_id,
        item.output_item_id,
        item.eligible_qty,
        item.worker_rate,
        item.gross_amount,
        item.notes
      )
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    console.error("Create payroll:", error);

    return json({
      success: false,
      message: "Penggajian gagal disimpan. Periksa data dan periode."
    }, 400);
  }

  return json({
    success: true,
    message: "Perhitungan upah berhasil dibuat.",
    data: {
      id: payrollId,
      period_start,
      period_end,
      status: "draft",
      worker_count: new Set(
        payrollItems.map(item => item.worker_id)
      ).size,
      item_count: payrollItems.length,
      total_qty: payrollItems.reduce(
        (sum, item) => sum + item.eligible_qty, 0
      ),
      total_gross: payrollItems.reduce(
        (sum, item) => sum + item.gross_amount, 0
      )
    }
  }, 201);
}

export async function handlePayroll(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/payroll";

  if (path === base && request.method === "GET") {
    return listPayroll(env);
  }

  if (path === base && request.method === "POST") {
    return createPayroll(request, env);
  }

  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID penggajian tidak valid."
      }, 400);
    }

    return getPayroll(id, env);
  }

  return json({
    success: false,
    message: "Endpoint penggajian tidak ditemukan."
  }, 404);
}
