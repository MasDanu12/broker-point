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
  "color_code",
  "status"
];

export async function handleColors(request, env) {
  const url = new URL(request.url);
  const id = url.pathname.split("/")[3];

  if (request.method === "GET" && !id) {
    const search = url.searchParams.get("search")?.trim() || "";
    const status = url.searchParams.get("status") || "";

    let query = `
      SELECT *
      FROM product_colors
      WHERE 1 = 1
    `;

    const values = [];

    if (search) {
      query += `
        AND (
          name LIKE ?
          OR color_code LIKE ?
        )
      `;

      const keyword = `%${search}%`;
      values.push(keyword, keyword);
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

    query += " ORDER BY name ASC";

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
    const color = await env.DB
      .prepare("SELECT * FROM product_colors WHERE id = ?")
      .bind(id)
      .first();

    if (!color) {
      return json({
        success: false,
        message: "Data warna tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      data: color
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
        message: "Nama warna wajib diisi."
      }, 400);
    }

    const duplicate = await env.DB
      .prepare("SELECT id FROM product_colors WHERE name = ?")
      .bind(name)
      .first();

    if (duplicate) {
      return json({
        success: false,
        message: "Nama warna sudah digunakan."
      }, 409);
    }

    const colorId = createId();

    await env.DB.prepare(`
      INSERT INTO product_colors (
        id,
        name,
        color_code,
        status
      )
      VALUES (?, ?, ?, 'active')
    `).bind(
      colorId,
      name,
      body.color_code || null
    ).run();

    const color = await env.DB
      .prepare("SELECT * FROM product_colors WHERE id = ?")
      .bind(colorId)
      .first();

    return json({
      success: true,
      message: "Warna berhasil ditambahkan.",
      data: color
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
      .prepare("SELECT * FROM product_colors WHERE id = ?")
      .bind(id)
      .first();

    if (!current) {
      return json({
        success: false,
        message: "Data warna tidak ditemukan."
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

    if (Object.hasOwn(body, "name") && !String(body.name || "").trim()) {
      return json({
        success: false,
        message: "Nama warna tidak boleh kosong."
      }, 400);
    }

    if (Object.hasOwn(body, "status") && !["active", "inactive"].includes(body.status)) {
      return json({
        success: false,
        message: "Status harus active atau inactive."
      }, 400);
    }

    if (Object.hasOwn(body, "name") && body.name !== current.name) {
      const duplicate = await env.DB
        .prepare("SELECT id FROM product_colors WHERE name = ? AND id != ?")
        .bind(body.name.trim(), id)
        .first();

      if (duplicate) {
        return json({
          success: false,
          message: "Nama warna sudah digunakan."
        }, 409);
      }
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
      UPDATE product_colors
      SET ${assignments}
      WHERE id = ?
    `).bind(...values, id).run();

    const updated = await env.DB
      .prepare("SELECT * FROM product_colors WHERE id = ?")
      .bind(id)
      .first();

    return json({
      success: true,
      message: "Warna berhasil diperbarui.",
      data: updated
    });
  }

  if (request.method === "DELETE" && id) {
    const result = await env.DB.prepare(`
      UPDATE product_colors
      SET status = 'inactive'
      WHERE id = ?
    `).bind(id).run();

    if (!result.meta.changes) {
      return json({
        success: false,
        message: "Data warna tidak ditemukan."
      }, 404);
    }

    return json({
      success: true,
      message: "Warna berhasil dinonaktifkan."
    });
  }

  return json({
    success: false,
    message: "Metode permintaan tidak didukung."
  }, 405);
}

