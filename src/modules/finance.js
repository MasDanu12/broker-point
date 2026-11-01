const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export async function handleFinance(request, env) {
  const url = new URL(request.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!validDate(start) || !validDate(end) || start > end) {
    return json({
      success: false,
      message: "Tanggal awal dan akhir wajib valid."
    }, 400);
  }

  const revenue = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(ii.accepted_qty), 0) AS accepted_qty,
      COALESCE(SUM(ii.accepted_qty * di.factory_rate), 0) AS earned
    FROM factory_inspection_items ii
    JOIN factory_inspections ins
      ON ins.id = ii.inspection_id
    JOIN factory_delivery_items di
      ON di.id = ii.delivery_item_id
    WHERE ins.inspection_date BETWEEN ? AND ?
  `).bind(start, end).first();

  const factoryPayments = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS transaction_count
    FROM factory_payments
    WHERE payment_date BETWEEN ? AND ?
  `).bind(start, end).first();

  const expenses = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS transaction_count
    FROM business_expenses
    WHERE expense_date BETWEEN ? AND ?
  `).bind(start, end).first();

  const expenseCategories = await env.DB.prepare(`
    SELECT
      category,
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS transaction_count
    FROM business_expenses
    WHERE expense_date BETWEEN ? AND ?
    GROUP BY category
    ORDER BY total DESC
  `).bind(start, end).all();

  const factoryReceivables = await env.DB.prepare(`
    SELECT
      f.id AS factory_id,
      f.name AS factory_name,
      COALESCE(earned.total, 0) AS earned,
      COALESCE(paid.total, 0) AS paid,
      COALESCE(earned.total, 0) - COALESCE(paid.total, 0) AS balance
    FROM factories f
    LEFT JOIN (
      SELECT
        d.factory_id,
        SUM(ii.accepted_qty * di.factory_rate) AS total
      FROM factory_inspection_items ii
      JOIN factory_inspections ins
        ON ins.id = ii.inspection_id
      JOIN factory_delivery_items di
        ON di.id = ii.delivery_item_id
      JOIN factory_deliveries d
        ON d.id = di.delivery_id
      WHERE ins.inspection_date <= ?
      GROUP BY d.factory_id
    ) earned ON earned.factory_id = f.id
    LEFT JOIN (
      SELECT factory_id, SUM(amount) AS total
      FROM factory_payments
      WHERE payment_date <= ?
      GROUP BY factory_id
    ) paid ON paid.factory_id = f.id
    WHERE COALESCE(earned.total, 0) > 0
       OR COALESCE(paid.total, 0) > 0
    ORDER BY balance DESC
  `).bind(end, end).all();

  const workerWages = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(gross_amount), 0) AS gross
    FROM payroll_items pi
    JOIN payroll_periods pp
      ON pp.id = pi.payroll_period_id
    WHERE pp.period_start >= ?
      AND pp.period_end <= ?
  `).bind(start, end).first();

  const earned = Number(revenue.earned || 0);
  const received = Number(factoryPayments.total || 0);
  const expenseTotal = Number(expenses.total || 0);
  const wages = Number(workerWages.gross || 0);

  return json({
    success: true,
    data: {
      period: { start, end },
      production: {
        accepted_qty: Number(revenue.accepted_qty || 0)
      },
      revenue: {
        earned,
        received,
        receivable_change: earned - received
      },
      expenses: {
        total: expenseTotal,
        transaction_count: Number(expenses.transaction_count || 0),
        categories: expenseCategories.results
      },
      worker_wages: {
        gross: wages
      },
      estimates: {
        operating_profit_before_wages: earned - expenseTotal,
        profit_after_recorded_wages: earned - expenseTotal - wages
      },
      factory_balances: factoryReceivables.results
    }
  });
}
