const formatMoney = (amount) =>
  parseFloat(amount).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function AccountList({ accounts, loading, error, onRetry, onDelete, deletingId, deleteError }) {
  const grandTotal = accounts.reduce((sum, a) => sum + parseFloat(a.balance), 0);

  const handleDelete = (account) => {
    const confirmed = window.confirm(
      `Delete "${account.name}"? This also permanently deletes every expense and income entry on this account. This cannot be undone.`
    );
    if (confirmed) onDelete(account.id);
  };

  return (
    <section className="expense-list-section">
      <div className="list-header">
        <div className="list-header-title">
          <h2>Bank Accounts</h2>
          <span className="expense-count">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </span>
        </div>
        <div className="total-badge">
          Combined: <strong>{formatMoney(grandTotal)}</strong>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
          <button className="btn-retry" onClick={onRetry}>Retry</button>
        </div>
      )}

      {deleteError && (
        <div className="alert alert-error">{deleteError}</div>
      )}

      {loading && !accounts.length && (
        <div className="loading-state">
          <span className="spinner" />
          <span>Loading accounts…</span>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">🏦</span>
          <p>No bank accounts yet. Add one to start tracking your money.</p>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="account-cards">
          {accounts.map((a) => (
            <div key={a.id} className="account-card">
              {onDelete && (
                <button
                  className="account-card-delete"
                  onClick={() => handleDelete(a)}
                  disabled={deletingId === a.id}
                  title="Delete account"
                  aria-label={`Delete ${a.name}`}
                >
                  {deletingId === a.id ? "…" : "✕"}
                </button>
              )}
              <div className="account-card-name">{a.name}</div>
              {a.bank_name && <div className="account-card-bank">{a.bank_name}</div>}
              <div
                className={`account-card-balance ${parseFloat(a.balance) < 0 ? "negative" : ""}`}
              >
                {formatMoney(a.balance)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
