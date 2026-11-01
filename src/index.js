const json = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Pemeriksaan koneksi aplikasi dan database
  if (path === "/api/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();

      return json({
        success: true,
        app: "Broker Point",
        database: "connected",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return json({
        success: false,
        app: "Broker Point",
        database: "error",
        message: "Database belum dapat diakses."
      }, 503);
    }
  }

  // API yang belum tersedia
  return json({
    success: false,
    message: "API tidak ditemukan.",
    path
  }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // Semua alamat API diproses oleh Worker
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env);
      }

      // Halaman website dilayani dari folder public
      return await env.ASSETS.fetch(request);

    } catch (error) {
      console.error("Broker Point Error:", error);

      if (url.pathname.startsWith("/api/")) {
        return json({
          success: false,
          message: "Terjadi kesalahan pada server."
        }, 500);
      }

      return new Response("Terjadi kesalahan pada aplikasi.", {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  }
};
