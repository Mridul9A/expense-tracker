const formatDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const formatMoney = (amount) =>
  parseFloat(amount).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function ExpenseList({
  expenses, meta, filters, accounts, categories,
  onFilterChange, loading, error, onRetry,
}) {
  return (
    <section className="expense-list-section">
      <div className="list-header">
        <div className="list-header-title">
          <h2>Expenses</h2>
          <span className="expense-count">{meta.count} {meta.count === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="total-badge">
          Total: <strong>{formatMoney(meta.total)}</strong>
        </div>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="filter-account">Account</label>
          <select
            id="filter-account"
            value={filters.account_id}
            onChange={(e) => onFilterChange({ account_id: e.target.value })}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-category">Category</label>
          <select
            id="filter-category"
            value={filters.category_id}
            onChange={(e) => onFilterChange({ category_id: e.target.value })}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-sort">Sort</label>
          <select
            id="filter-sort"
            value={filters.sort}
            onChange={(e) => onFilterChange({ sort: e.target.value })}
          >
            <option value="date_desc">Newest first</option>
          </select>
        </div>

        {(filters.account_id || filters.category_id) && (
          <button
            className="btn-clear-filter"
            onClick={() => onFilterChange({ account_id: "", category_id: "" })}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="btn-retry" onClick={onRetry}>Retry</button>
        </div>
      )}

      {loading && !expenses.length && (
        <div className="loading-state">
          <span className="spinner" />
          <span>Loading expenses…</span>
        </div>
      )}

      {!loading && !error && expenses.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">💸</span>
          <p>{filters.category_id || filters.account_id ? "No expenses match these filters" : "No expenses yet. Add one above!"}</p>
        </div>
      )}

      {expenses.length > 0 && (
        <div className="table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Category</th>
                <th>Description</th>
                <th className="col-amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className={loading ? "row-stale" : ""}>
                  <td className="col-date">{formatDate(e.date)}</td>
                  <td>{e.account_name}</td>
                  <td>
                    <span
                      className="category-pill"
                      style={{ "--pill-color": e.category_color || "#6b7280" }}
                    >
                      {e.category_name}
                    </span>
                  </td>
                  <td className="col-description">{e.description}</td>
                  <td className="col-amount">{formatMoney(e.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4" className="total-label">Total</td>
                <td className="col-amount total-value">{formatMoney(meta.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
