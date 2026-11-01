import { handleFactories } from "./modules/factories.js";
import { handleWorkers } from "./modules/workers.js";
import { handleModels } from "./modules/models.js";
import { handleColors } from "./modules/colors.js";
import { handleRates } from "./modules/rates.js";
import { handleOrders } from "./modules/orders.js";
import { handleReceipts } from "./modules/receipts.js";
import { handleOutputs } from "./modules/outputs.js";

const modules = {
  factories: handleFactories,
  workers: handleWorkers,
  models: handleModels,
  colors: handleColors,
  rates: handleRates,
  orders: handleOrders,
  receipts: handleReceipts
};

export async function routeApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (url.pathname === "/api/outputs" || url.pathname.startsWith("/api/outputs/")) {
    return handleOutputs(request, env);
  }

  for (const [name, handler] of Object.entries(modules)) {
    const route = `/api/${name}`;

    if (path === route || path.startsWith(`${route}/`)) {
      return handler(request, env);
    }
  }

  return new Response(JSON.stringify({
    success: false,
    message: "Jalur API tidak ditemukan."
  }), {
    status: 404,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
