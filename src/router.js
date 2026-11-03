import { handleFactories } from "./modules/factories.js";
import { handleWorkers } from "./modules/workers.js";
import { handleModels } from "./modules/models.js";
import { handleColors } from "./modules/colors.js";
import { handleRates } from "./modules/rates.js";
import { handleOrders } from "./modules/orders.js";
import { handleReceipts } from "./modules/receipts.js";
import { handleAllocations } from "./modules/allocations.js";
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
  allocations: handleAllocations,
  outputs: handleOutputs,
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
