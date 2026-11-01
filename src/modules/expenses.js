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

async function listExpenses(env, url) {
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const category = url.searchParams.get("category");

  let sql = `
    SELECT *
    FROM business_expenses
    WHERE 1 = 1
  `;

  const params = [];

  if (start) {
    if (!validDate(start)) {
      return json({
        success: false,
        message: "Tanggal awal tidak valid."
      }, 400);
    }

    sql += " AND expense_date >= ?";
    params.push(start);
  }

  if (end) {
    if (!validDate(end)) {
      return json({
        success: false,
        message: "Tanggal akhir tidak valid."
      }, 400);
    }

    sql += " AND expense_date <= ?";
    params.push(end);
  }

  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }

  sql += " ORDER BY expense_date DESC, created_at DESC";

  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all();

  return json({ success: true, data: result.results });
}

async function createExpense(request, env) {
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
    expense_date,
    category,
    description = "",
    amount,
    recipient = "",
    evidence_url = null,
    notes = ""
  } = body || {};

  if (
    typeof document_no !== "string" ||
    !document_no.trim() ||
    !validDate(expense_date) ||
    typeof category !== "string" ||
    !category.trim() ||
    !validAmount(amount)
  ) {
    return json({
      success: false,
      message: "Nomor dokumen, tanggal, kategori, dan nominal wajib valid."
    }, 400);
  }

  if (
    evidence_url !== null &&
    (typeof evidence_url !== "string" || evidence_url.length > 2048)
  ) {
    return json({
      success: false,
      message: "Alamat bukti pengeluaran tidak valid."
    }, 400);
  }

  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO business_expenses (
        id,
        document_no,
        expense_date,
        category,
        description,
        amount,
        recipient,
        evidence_url,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      document_no.trim(),
      expense_date,
      category.trim(),
      typeof description === "string" ? description.trim() : "",
      amount,
      typeof recipient === "string" ? recipient.trim() : "",
      evidence_url,
      typeof notes === "string" ? notes.trim() : ""
    ).run();
  } catch (error) {
    console.error("Create expense:", error);

    return json({
      success: false,
      message: "Pengeluaran gagal disimpan. Periksa nomor dokumen."
    }, 400);
  }

  return json({
    success: true,
    message: "Pengeluaran berhasil dicatat.",
    data: {
      id,
      document_no: document_no.trim(),
      expense_date,
      category: category.trim(),
      amount
    }
  }, 201);
}

async function getExpense(id, env) {
  const result = await env.DB.prepare(`
    SELECT *
    FROM business_expenses
    WHERE id = ?
  `).bind(id).first();

  if (!result) {
    return json({
      success: false,
      message: "Data pengeluaran tidak ditemukan."
    }, 404);
  }

  return json({ success: true, data: result });
}

export async function handleExpenses(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const base = "/api/expenses";

  if (path === base && request.method === "GET") {
    return listExpenses(env, url);
  }

  if (path === base && request.method === "POST") {
    return createExpense(request, env);
  }

  if (path.startsWith(`${base}/`) && request.method === "GET") {
    const id = path.slice(base.length + 1);

    if (!id || id.includes("/")) {
      return json({
        success: false,
        message: "ID pengeluaran tidak valid."
      }, 400);
    }

    return getExpense(id, env);
  }

  return json({
    success: false,
    message: "Endpoint pengeluaran tidak ditemukan."
  }, 404);
}
