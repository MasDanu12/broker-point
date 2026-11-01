import { routeApi } from "./router.js";
import { handleAuth, authenticate } from "./modules/auth.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

async function handleHealth(env) {
  try {
    await env.DB.prepare("SELECT 1").first();

    return json({
      success: true,
      app: "Broker Point",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Database health check:", error);

    return json({
      success: false,
      app: "Broker Point",
      database: "error",
      message: "Database belum dapat diakses."
    }, 503);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/health") {
        return await handleHealth(env);
      }

      if (path.startsWith("/api/auth/")) {
        return await handleAuth(request, env);
      }

      if (path.startsWith("/api/")) {
        const user = await authenticate(request, env);

        if (!user) {
          return json({
            success: false,
            message: "Silakan login untuk mengakses data."
          }, 401);
        }

        return await routeApi(request, env);
      }

      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Broker Point Error:", error);

      if (path.startsWith("/api/")) {
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
