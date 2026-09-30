const formatDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
};

const formatMoney = (amount) =>
  parseFloat(amount).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function IncomeList({
  incomes, meta, filters, accounts, onFilterChange, loading, error, onRetry,
  onEdit, onDelete, deletingId, editingId,
}) {
  const handleDelete = (income) => {
    if (window.confirm(`Delete this ${formatMoney(income.amount)} income entry? This cannot be undone.`)) {
      onDelete(income.id);
    }
  };

  return (
    <section className="expense-list-section">
      <div className="list-header">
        <div className="list-header-title">
          <h2>Income</h2>
          <span className="expense-count">{meta.count} {meta.count === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="total-badge">
          Total: <strong>{formatMoney(meta.total)}</strong>
        </div>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="income-filter-account">Account</label>
          <select
            id="income-filter-account"
            value={filters.account_id}
            onChange={(e) => onFilterChange({ account_id: e.target.value })}
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {filters.account_id && (
          <button
            className="btn-clear-filter"
            onClick={() => onFilterChange({ account_id: "" })}
          >
            ✕ Clear filter
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="btn-retry" onClick={onRetry}>Retry</button>
        </div>
      )}

      {loading && !incomes.length && (
        <div className="loading-state">
          <span className="spinner" />
          <span>Loading income…</span>
        </div>
      )}

      {!loading && !error && incomes.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">💰</span>
          <p>No income recorded yet.</p>
        </div>
      )}

      {incomes.length > 0 && (
        <div className="table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Source</th>
                <th className="col-amount">Amount</th>
                {(onEdit || onDelete) && <th className="col-actions"></th>}
              </tr>
            </thead>
            <tbody>
              {incomes.map((i) => (
                <tr key={i.id} className={`${loading ? "row-stale" : ""} ${editingId === i.id ? "row-editing" : ""}`}>
                  <td className="col-date">{formatDate(i.date)}</td>
                  <td>{i.account_name}</td>
                  <td className="col-description">{i.source}</td>
                  <td className="col-amount income-amount">+{formatMoney(i.amount)}</td>
                  {(onEdit || onDelete) && (
                    <td className="col-actions">
                      {onEdit && (
                        <button
                          className="btn-row-action"
                          onClick={() => onEdit(i)}
                          disabled={deletingId === i.id}
                          title="Edit"
                          aria-label="Edit income"
                        >
                          ✎
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="btn-row-action btn-row-action-danger"
                          onClick={() => handleDelete(i)}
                          disabled={deletingId === i.id}
                          title="Delete"
                          aria-label="Delete income"
                        >
                          {deletingId === i.id ? "…" : "✕"}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="3" className="total-label">Total</td>
                <td className="col-amount total-value">{formatMoney(meta.total)}</td>
                {(onEdit || onDelete) && <td></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
