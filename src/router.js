import { handleFactories } from "./modules/factories.js";
import { handleWorkers } from "./modules/workers.js";
import { handleModels } from "./modules/models.js";
import { handleColors } from "./modules/colors.js";
import { handleRates } from "./modules/rates.js";
import { handleOrders } from "./modules/orders.js";
import { handleReceipts } from "./modules/receipts.js";
import { handleOutputs } from "./modules/outputs.js";
import { handleDeliveries } from "./modules/deliveries.js";
import { handleInspections } from "./modules/inspections.js";
import { handleRepairs } from "./modules/repairs.js";
import { handlePayroll } from "./modules/payroll.js";
import { handleBon } from "./modules/bon.js";
import { handleWorkerPayments } from "./modules/worker-payments.js";
import { handleFactoryPayments } from "./modules/factory-payments.js";
import { handleExpenses } from "./modules/expenses.js";
import { handleFinance } from "./modules/finance.js";
import { handleReports } from "./modules/reports.js";

const modules = {
  factories: handleFactories,
  workers: handleWorkers,
  models: handleModels,
  colors: handleColors,
  rates: handleRates,
  orders: handleOrders,
  receipts: handleReceipts,
  deliveries: handleDeliveries,
  inspections: handleInspections,
  repairs: handleRepairs,
  payroll: handlePayroll,
  bon: handleBon,
  "worker-payments": handleWorkerPayments,
  "factory-payments": handleFactoryPayments,
  expenses: handleExpenses,
  finance: handleFinance,
  reports: handleReports
};

export async function routeApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  const specialRoutes = [
    "/api/outputs",
    "/api/deliveries",
    "/api/inspections",
    "/api/repairs",
    "/api/payroll",
    "/api/bon",
    "/api/worker-payments",
    "/api/factory-payments",
    "/api/expenses",
    "/api/finance",
    "/api/reports"
  ];

  if (specialRoutes.some(route => url.pathname === route || url.pathname.startsWith(`${route}/`))) {
    const routeMap = {
      "/api/outputs": handleOutputs,
      "/api/deliveries": handleDeliveries,
      "/api/inspections": handleInspections,
      "/api/repairs": handleRepairs,
      "/api/payroll": handlePayroll,
      "/api/bon": handleBon,
      "/api/worker-payments": handleWorkerPayments,
      "/api/factory-payments": handleFactoryPayments,
      "/api/expenses": handleExpenses,
      "/api/finance": handleFinance,
      "/api/reports": handleReports
    };

    const matchedRoute = specialRoutes.find(route =>
      url.pathname === route || url.pathname.startsWith(`${route}/`)
    );

    return routeMap[matchedRoute](request, env);
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
