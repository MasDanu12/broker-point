const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const makeId = () => crypto.randomUUID();

const toHex = (buffer) =>
  [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

async function hashText(value) {
  const result = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return toHex(result);
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: new TextEncoder().encode(salt),
    iterations: 100000,
    hash: "SHA-256"
  }, key, 256);

  return toHex(bits);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/api/auth/setup" && request.method === "POST") {
      if (!env.SETUP_KEY) {
        return json({
          success: false,
          message: "SETUP_KEY belum dikonfigurasi di Cloudflare."
        }, 503);
      }

      const setupKey = request.headers.get("X-Setup-Key");

      if (setupKey !== env.SETUP_KEY) {
        return json({
          success: false,
          message: "Kunci setup tidak valid."
        }, 403);
      }

      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM admin_users"
      ).first();

      if (Number(count.total) > 0) {
        return json({
          success: false,
          message: "Akun admin sudah dibuat. Setup awal ditutup."
        }, 409);
      }

      const body = await readBody(request);

      if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
        return json({
          success: false,
          message: "Username dan password wajib diisi."
        }, 400);
      }

      const username = body.username.trim().toLowerCase();
      const password = body.password;

      if (!/^[a-z0-9._-]{4,30}$/.test(username)) {
        return json({
          success: false,
          message: "Username harus 4–30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung."
        }, 400);
      }

      if (password.length < 10 || password.length > 200) {
        return json({
          success: false,
          message: "Password harus minimal 10 karakter."
        }, 400);
      }

      const salt = randomToken();
      const passwordHash = await hashPassword(password, salt);

      await env.DB.prepare(`
        INSERT INTO admin_users
          (id, username, password_hash, password_salt)
        VALUES (?, ?, ?, ?)
      `).bind(makeId(), username, passwordHash, salt).run();

      return json({
        success: true,
        message: "Akun admin berhasil dibuat. Silakan login."
      }, 201);
    }

    if (path === "/api/auth/login" && request.method === "POST") {
      const body = await readBody(request);

      if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
        return json({
          success: false,
          message: "Username dan password wajib diisi."
        }, 400);
      }

      const username = body.username.trim().toLowerCase();

      const user = await env.DB.prepare(`
        SELECT id, username, password_hash, password_salt
        FROM admin_users
        WHERE username = ? AND status = 'active'
      `).bind(username).first();

      if (!user) {
        return json({
          success: false,
          message: "Username atau password salah."
        }, 401);
      }

      const submittedHash = await hashPassword(body.password, user.password_salt);

      if (submittedHash !== user.password_hash) {
        return json({
          success: false,
          message: "Username atau password salah."
        }, 401);
      }

      const token = randomToken();
      const tokenHash = await hashText(token);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await env.DB.prepare(`
        INSERT INTO auth_sessions (token_hash, user_id, expires_at)
        VALUES (?, ?, ?)
      `).bind(tokenHash, user.id, expiresAt).run();

      return json({
        success: true,
        token,
        expires_at: expiresAt,
        user: {
          id: user.id,
          username: user.username
        }
      });
    }

    if (path === "/api/auth/logout" && request.method === "POST") {
      const header = request.headers.get("Authorization") || "";
      const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

      if (token) {
        const tokenHash = await hashText(token);
        await env.DB.prepare(
          "DELETE FROM auth_sessions WHERE token_hash = ?"
        ).bind(tokenHash).run();
      }

      return json({
        success: true,
        message: "Sesi berhasil diakhiri."
      });
    }

    if (path === "/api/auth/me" && request.method === "GET") {
      const user = await authenticate(request, env);

      if (!user) {
        return json({
          success: false,
          message: "Sesi tidak valid atau sudah kedaluwarsa."
        }, 401);
      }

      return json({ success: true, user });
    }

    return json({
      success: false,
      message: "Jalur autentikasi tidak ditemukan."
    }, 404);
  } catch (err) {
    console.error("Auth error:", err);
    return json({
      success: false,
      message: "Terjadi kesalahan pada proses autentikasi."
    }, 500);
  }
}

export async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";

  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const tokenHash = await hashText(token);

  const user = await env.DB.prepare(`
    SELECT u.id, u.username
    FROM auth_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > ?
      AND u.status = 'active'
  `).bind(tokenHash, new Date().toISOString()).first();

  return user || null;
}
