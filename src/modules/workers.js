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
  "name",
  "phone",
  "address",
  "location",
  "joined_at",
  "notes",
  "status"
];

export async function handleWorkers(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[3];

  if (request.method === "GET" && !id) {
    const search = url.searchParams.get("search")?.trim() || "";
    const status = url.searchParams.get("status") || "";

    let query = `
      SELECT *
      FROM workers
      WHERE 1 = 1
    `;

    const values = [];

    if (search) {
      query += `
        AND (
          name LIKE ?
          OR phone LIKE ?
          OR address LIKE ?
          OR location LIKE ?
        )
      `;

      const keyword = `%${search}%`;
      values.push(keyword, keyword, keyword, keyword);
    }

    if (status) {
      if (!["active", "inactive"].includes(status)) {
        return json({
          success: false,
          message: "Status tidak valid."
        }, 400);
      }

      query += " AND status = ?";
      values.push(status);
    }

    query += " ORDER BY created_at DESC";

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
    const worker = await env.DB
      .prepare("SELECT * FROM workers WHERE id = ?")
      .bind(id)
      .first();

    if (!worker) {
      return json({
        success: false,
        message: "Data penjahit tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      data: worker
    });
  }

  if (request.method === "POST" && !id) {
    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        success: false,
        message: "Format data JSON tidak valid."
      }, 400);
    }

    const name = String(body.name || "").trim();

    if (!name) {
      return json({
        success: false,
        message: "Nama penjahit wajib diisi."
      }, 400);
    }

    const workerId = createId();

    await env.DB.prepare(`
      INSERT INTO workers (
        id,
        name,
        phone,
        address,
        location,
        joined_at,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).bind(
      workerId,
      name,
      body.phone || null,
      body.address || null,
      body.location || null,
      body.joined_at || null,
      body.notes || null
    ).run();

    const worker = await env.DB
      .prepare("SELECT * FROM workers WHERE id = ?")
      .bind(workerId)
      .first();

    return json({
      success: true,
      message: "Data penjahit berhasil ditambahkan.",
      data: worker
    }, 201);
  }

  if (request.method === "PATCH" && id) {
    let body;

    try {
      body = await request.json();
    } catch {
      return json({
        success: false,
        message: "Format data JSON tidak valid."
      }, 400);
    }

    const current = await env.DB
      .prepare("SELECT * FROM workers WHERE id = ?")
      .bind(id)
      .first();

    if (!current) {
      return json({
        success: false,
        message: "Data penjahit tidak ditemukan."
      }, 404);
    }

    const fields = allowedFields.filter(
      field => Object.hasOwn(body, field)
    );

    if (fields.length === 0) {
      return json({
        success: false,
        message: "Tidak ada data yang diubah."
      }, 400);
    }

    if (
      Object.hasOwn(body, "name") &&
      !String(body.name || "").trim()
    ) {
      return json({
        success: false,
        message: "Nama penjahit tidak boleh kosong."
      }, 400);
    }

    if (
      Object.hasOwn(body, "status") &&
      !["active", "inactive"].includes(body.status)
    ) {
      return json({
        success: false,
        message: "Status harus active atau inactive."
      }, 400);
    }

    const values = fields.map(field => {
      if (field === "name") {
        return String(body[field]).trim();
      }

      return body[field] === "" ? null : body[field];
    });

    const assignments = fields
      .map(field => `${field} = ?`)
      .join(", ");

    await env.DB.prepare(`
      UPDATE workers
      SET ${assignments},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(...values, id).run();

    const updated = await env.DB
      .prepare("SELECT * FROM workers WHERE id = ?")
      .bind(id)
      .first();

    return json({
      success: true,
      message: "Data penjahit berhasil diperbarui.",
      data: updated
    });
  }

  if (request.method === "DELETE" && id) {
    const result = await env.DB.prepare(`
      UPDATE workers
      SET status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({
        success: false,
        message: "Data penjahit tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      message: "Penjahit berhasil dinonaktifkan."
    });
  }

  return json({
    success: false,
    message: "Metode permintaan tidak didukung."
  }, 405);
}
