
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
  "contact_person",
  "phone",
  "address",
  "notes",
  "status"
];

export async function handleFactories(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[3];

  // GET: daftar pabrik
  if (request.method === "GET" && !id) {
    const search = url.searchParams.get("search")?.trim() || "";
    const status = url.searchParams.get("status") || "";

    let query = `
      SELECT *
      FROM factories
      WHERE 1 = 1
    `;

    const values = [];

    if (search) {
      query += `
        AND (
          name LIKE ?
          OR contact_person LIKE ?
          OR phone LIKE ?
        )
      `;

      const keyword = `%${search}%`;
      values.push(keyword, keyword, keyword);
    }

    if (status) {
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

  // GET: detail satu pabrik
  if (request.method === "GET" && id) {
    const factory = await env.DB
      .prepare("SELECT * FROM factories WHERE id = ?")
      .bind(id)
      .first();

    if (!factory) {
      return json({
        success: false,
        message: "Data pabrik tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      data: factory
    });
  }

  // POST: tambah pabrik
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
        message: "Nama pabrik wajib diisi."
      }, 400);
    }

    const factoryId = createId();

    await env.DB.prepare(`
      INSERT INTO factories (
        id,
        name,
        contact_person,
        phone,
        address,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).bind(
      factoryId,
      name,
      body.contact_person || null,
      body.phone || null,
      body.address || null,
      body.notes || null
    ).run();

    const factory = await env.DB
      .prepare("SELECT * FROM factories WHERE id = ?")
      .bind(factoryId)
      .first();

    return json({
      success: true,
      message: "Pabrik berhasil ditambahkan.",
      data: factory
    }, 201);
  }

  // PATCH: ubah data pabrik
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
      .prepare("SELECT * FROM factories WHERE id = ?")
      .bind(id)
      .first();

    if (!current) {
      return json({
        success: false,
        message: "Data pabrik tidak ditemukan."
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
        message: "Nama pabrik tidak boleh kosong."
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
      UPDATE factories
      SET ${assignments},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(...values, id).run();

    const updated = await env.DB
      .prepare("SELECT * FROM factories WHERE id = ?")
      .bind(id)
      .first();

    return json({
      success: true,
      message: "Data pabrik berhasil diperbarui.",
      data: updated
    });
  }

  // DELETE: nonaktifkan pabrik
  if (request.method === "DELETE" && id) {
    const result = await env.DB.prepare(`
      UPDATE factories
      SET status = 'inactive',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({
        success: false,
        message: "Data pabrik tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      message: "Pabrik berhasil dinonaktifkan."
    });
  }

  return json({
    success: false,
    message: "Metode permintaan tidak didukung."
  }, 405);
}
