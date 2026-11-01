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
  "code",
  "name",
  "description",
  "image_url",
  "status"
];

export async function handleModels(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[3];

  if (request.method === "GET" && !id) {
    const search = url.searchParams.get("search")?.trim() || "";
    const status = url.searchParams.get("status") || "";

    let query = `
      SELECT *
      FROM product_models
      WHERE 1 = 1
    `;

    const values = [];

    if (search) {
      query += `
        AND (
          code LIKE ?
          OR name LIKE ?
          OR description LIKE ?
        )
      `;

      const keyword = `%${search}%`;
      values.push(keyword, keyword, keyword);
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
    const model = await env.DB
      .prepare("SELECT * FROM product_models WHERE id = ?")
      .bind(id)
      .first();

    if (!model) {
      return json({
        success: false,
        message: "Data model tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      data: model
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

    const code = String(body.code || "").trim();
    const name = String(body.name || "").trim();

    if (!code || !name) {
      return json({
        success: false,
        message: "Kode dan nama model wajib diisi."
      }, 400);
    }

    const duplicate = await env.DB
      .prepare("SELECT id FROM product_models WHERE code = ?")
      .bind(code)
      .first();

    if (duplicate) {
      return json({
        success: false,
        message: "Kode model sudah digunakan."
      }, 409);
    }

    const modelId = createId();

    await env.DB.prepare(`
      INSERT INTO product_models (
        id,
        code,
        name,
        description,
        image_url,
        status
      )
      VALUES (?, ?, ?, ?, ?, 'active')
    `).bind(
      modelId,
      code,
      name,
      body.description || null,
      body.image_url || null
    ).run();

    const model = await env.DB
      .prepare("SELECT * FROM product_models WHERE id = ?")
      .bind(modelId)
      .first();

    return json({
      success: true,
      message: "Model berhasil ditambahkan.",
      data: model
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
      .prepare("SELECT * FROM product_models WHERE id = ?")
      .bind(id)
      .first();

    if (!current) {
      return json({
        success: false,
        message: "Data model tidak ditemukan."
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

    if (Object.hasOwn(body, "code") && !String(body.code || "").trim()) {
      return json({
        success: false,
        message: "Kode model tidak boleh kosong."
      }, 400);
    }

    if (Object.hasOwn(body, "name") && !String(body.name || "").trim()) {
      return json({
        success: false,
        message: "Nama model tidak boleh kosong."
      }, 400);
    }

    if (Object.hasOwn(body, "status") && !["active", "inactive"].includes(body.status)) {
      return json({
        success: false,
        message: "Status harus active atau inactive."
      }, 400);
    }

    if (Object.hasOwn(body, "code") && body.code !== current.code) {
      const duplicate = await env.DB
        .prepare("SELECT id FROM product_models WHERE code = ? AND id != ?")
        .bind(body.code.trim(), id)
        .first();

      if (duplicate) {
        return json({
          success: false,
          message: "Kode model sudah digunakan."
        }, 409);
      }
    }

    const values = fields.map(field => {
      if (field === "code" || field === "name") {
        return String(body[field]).trim();
      }

      return body[field] === "" ? null : body[field];
    });

    const assignments = fields
      .map(field => `${field} = ?`)
      .join(", ");

    await env.DB.prepare(`
      UPDATE product_models
      SET ${assignments}
      WHERE id = ?
    `).bind(...values, id).run();

    const updated = await env.DB
      .prepare("SELECT * FROM product_models WHERE id = ?")
      .bind(id)
      .first();

    return json({
      success: true,
      message: "Model berhasil diperbarui.",
      data: updated
    });
  }

  if (request.method === "DELETE" && id) {
    const result = await env.DB.prepare(`
      UPDATE product_models
      SET status = 'inactive'
      WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({
        success: false,
        message: "Data model tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      message: "Model berhasil dinonaktifkan."
    });
  }

  return json({
    success: false,
    message: "Metode permintaan tidak didukung."
  }, 405);
}
