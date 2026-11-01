const json = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};

const createId = () => crypto.randomUUID();

const allowedFields = [
  "factory_id",
  "worker_id",
  "model_id",
  "factory_rate",
  "worker_rate",
  "effective_from",
  "effective_until",
  "notes"
];

const validRate = value =>
  Number.isSafeInteger(Number(value)) &&
  Number(value) >= 0;

const rateQuery = `
  SELECT
    r.*,
    f.name AS factory_name,
    w.name AS worker_name,
    m.code AS model_code,
    m.name AS model_name
  FROM rate_cards r
  LEFT JOIN factories f ON f.id = r.factory_id
  LEFT JOIN workers w ON w.id = r.worker_id
  LEFT JOIN product_models m ON m.id = r.model_id
`;

export async function handleRates(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[3];

  if (request.method === "GET" && !id) {
    const search = url.searchParams.get("search")?.trim() || "";
    const factoryId = url.searchParams.get("factory_id") || "";
    const workerId = url.searchParams.get("worker_id") || "";
    const modelId = url.searchParams.get("model_id") || "";

    let query = rateQuery + " WHERE 1 = 1";
    const values = [];

    if (search) {
      query += `
        AND (
          f.name LIKE ?
          OR w.name LIKE ?
          OR m.name LIKE ?
          OR m.code LIKE ?
        )
      `;

      const keyword = `%${search}%`;
      values.push(keyword, keyword, keyword, keyword);
    }

    if (factoryId) {
      query += " AND r.factory_id = ?";
      values.push(factoryId);
    }

    if (workerId) {
      query += " AND r.worker_id = ?";
      values.push(workerId);
    }

    if (modelId) {
      query += " AND r.model_id = ?";
      values.push(modelId);
    }

    query += " ORDER BY r.effective_from DESC, r.created_at DESC";

    const result = await env.DB
      .prepare(query)
      .bind(...values)
      .all();

    return json({
      success: true,
      total: result.results.length,
      data: result.results
    });
  }

  if (request.method === "GET" && id) {
    const rate = await env.DB
      .prepare(rateQuery + " WHERE r.id = ?")
      .bind(id)
      .first();

    if (!rate) {
      return json({
        success: false,
        message: "Data tarif tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      data: rate
    });
  }

  if (request.method === "POST" && !id) {
    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        success: false,
        message: "Format JSON tidak valid."
      }, 400);
    }

    if (!body.model_id || !body.effective_from) {
      return json({
        success: false,
        message: "Model dan tanggal mulai berlaku wajib diisi."
      }, 400);
    }

    const factoryRate = body.factory_rate ?? 0;
    const workerRate = body.worker_rate ?? 0;

    if (
      !validRate(factoryRate) ||
      !validRate(workerRate)
    ) {
      return json({
        success: false,
        message: "Tarif harus berupa angka bulat dan tidak boleh negatif."
      }, 400);
    }

    if (
      body.effective_until &&
      body.effective_until < body.effective_from
    ) {
      return json({
        success: false,
        message: "Tanggal akhir tidak boleh lebih awal dari tanggal mulai."
      }, 400);
    }

    const rateId = createId();

    await env.DB.prepare(`
      INSERT INTO rate_cards (
        id,
        factory_id,
        worker_id,
        model_id,
        factory_rate,
        worker_rate,
        effective_from,
        effective_until,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      rateId,
      body.factory_id || null,
      body.worker_id || null,
      body.model_id,
      Number(factoryRate),
      Number(workerRate),
      body.effective_from,
      body.effective_until || null,
      body.notes || null
    ).run();

    const rate = await env.DB
      .prepare(rateQuery + " WHERE r.id = ?")
      .bind(rateId)
      .first();

    return json({
      success: true,
      message: "Tarif berhasil ditambahkan.",
      data: rate
    }, 201);
  }

  if (request.method === "PATCH" && id) {
    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        success: false,
        message: "Format JSON tidak valid."
      }, 400);
    }

    const current = await env.DB
      .prepare("SELECT * FROM rate_cards WHERE id = ?")
      .bind(id)
      .first();

    if (!current) {
      return json({
        success: false,
        message: "Data tarif tidak ditemukan."
      }, 404);
    }

    const fields = allowedFields.filter(
      field => Object.hasOwn(body, field)
    );

    if (!fields.length) {
      return json({
        success: false,
        message: "Tidak ada data yang diubah."
      }, 400);
    }

    for (const field of ["factory_rate", "worker_rate"]) {
      if (
        Object.hasOwn(body, field) &&
        !validRate(body[field])
      ) {
        return json({
          success: false,
          message: "Tarif harus berupa angka bulat dan tidak boleh negatif."
        }, 400);
      }
    }

    const newStart = body.effective_from ?? current.effective_from;
    const newEnd = Object.hasOwn(body, "effective_until")
      ? body.effective_until
      : current.effective_until;

    if (newEnd && newEnd < newStart) {
      return json({
        success: false,
        message: "Tanggal akhir tidak boleh lebih awal dari tanggal mulai."
      }, 400);
    }

    const values = fields.map(field => {
      if (field === "factory_rate" || field === "worker_rate") {
        return Number(body[field]);
      }

      return body[field] === "" ? null : body[field];
    });

    const assignments = fields
      .map(field => `${field} = ?`)
      .join(", ");

    await env.DB.prepare(`
      UPDATE rate_cards
      SET ${assignments}
      WHERE id = ?
    `).bind(...values, id).run();

    const updated = await env.DB
      .prepare(rateQuery + " WHERE r.id = ?")
      .bind(id)
      .first();

    return json({
      success: true,
      message: "Tarif berhasil diperbarui.",
      data: updated
    });
  }

  return json({
    success: false,
    message: "Metode permintaan tidak didukung."
  }, 405);
}
