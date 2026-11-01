const modules = {
  dashboard: "/api/dashboard",
  factories: "/api/factories",
  workers: "/api/workers",
  models: "/api/models",
  colors: "/api/colors",
  rates: "/api/rates",
  orders: "/api/orders",
  receipts: "/api/receipts",
  allocations: "/api/allocations",
  outputs: "/api/outputs",
  deliveries: "/api/deliveries",
  inspections: "/api/inspections",
  repairs: "/api/repairs",
  payroll: "/api/payroll",
  payments: "/api/payments",
  bon: "/api/bon",
  expenses: "/api/expenses",
  reports: "/api/reports"
};

export function getModuleRoute(path) {
  for (const [name, route] of Object.entries(modules)) {
    if (path === route || path.startsWith(`${route}/`)) {
      return name;
    }
  }

  return null;
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function routeApi(request, env) {
  const url = new URL(request.url);
  const moduleName = getModuleRoute(url.pathname);

  if (!moduleName) {
    return jsonResponse({
      success: false,
      message: "Jalur API tidak ditemukan."
    }, 404);
  }

  return jsonResponse({
    success: false,
    module: moduleName,
    message: "Modul belum diaktifkan."
  }, 501);
}
