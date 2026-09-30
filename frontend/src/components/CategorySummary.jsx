const formatMoney = (amount) =>
  parseFloat(amount).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function CategorySummary({ expenses }) {
  if (!expenses.length) return null;

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

  const sorted = [...totals.values()].sort((a, b) => b.cents - a.cents);

  return (
    <section className="category-summary">
      <h2>By Category</h2>
      <div className="summary-bars">
        {sorted.map((s) => {
          const pct = grand > 0 ? (s.cents / grand) * 100 : 0;
          return (
            <div key={s.name} className="summary-row">
              <span className="summary-cat">{s.name}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${pct}%`, background: s.color }}
                />
              </div>
              <span className="summary-pct">{pct.toFixed(1)}%</span>
              <span className="summary-amount">{formatMoney(s.cents / 100)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
