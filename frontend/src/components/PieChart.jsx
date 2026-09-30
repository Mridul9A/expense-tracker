const formatMoney = (amount) =>
  parseFloat(amount).toLocaleString("en-IN", { style: "currency", currency: "INR" });

function groupByCategory(expenses) {
  const totals = new Map();
  let grand = 0;

  for (const e of expenses) {
    const cents = Math.round(parseFloat(e.amount) * 100);
    const key = e.category_id;
    const existing = totals.get(key);
    if (existing) {
      existing.cents += cents;
    } else {
      totals.set(key, { name: e.category_name, color: e.category_color || "#6b7280", cents });
    }
    grand += cents;
  }

  return {
    grand,
    slices: [...totals.values()].sort((a, b) => b.cents - a.cents),
  };
}

export function PieChart({ expenses }) {
  if (!expenses.length) return null;

  const { grand, slices } = groupByCategory(expenses);

  // Build a conic-gradient string: each slice occupies its percentage of the circle,
  // in sequence, with no external charting library needed.
  let cursor = 0;
  const stops = slices.map((s) => {
    const pct = grand > 0 ? (s.cents / grand) * 100 : 0;
    const start = cursor;
    cursor += pct;
    return `${s.color} ${start}% ${cursor}%`;
  });
  const gradient = `conic-gradient(${stops.join(", ")})`;

  return (
    <section className="pie-chart-section">
      <h2>Spending Mix</h2>
      <div className="pie-chart-body">
        <div className="pie-chart-ring" style={{ background: gradient }}>
          <div className="pie-chart-hole">
            <span className="pie-chart-total-label">Total</span>
            <span className="pie-chart-total-value">{formatMoney(grand / 100)}</span>
          </div>
        </div>

        <ul className="pie-chart-legend">
          {slices.map((s) => {
            const pct = grand > 0 ? (s.cents / grand) * 100 : 0;
            return (
              <li key={s.name} className="pie-chart-legend-row">
                <span className="legend-swatch" style={{ background: s.color }} />
                <span className="legend-name">{s.name}</span>
                <span className="legend-pct">{pct.toFixed(1)}%</span>
                <span className="legend-amount">{formatMoney(s.cents / 100)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
