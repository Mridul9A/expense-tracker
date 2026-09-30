import { useState } from "react";

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = () => ({ amount: "", account_id: "", source: "", date: today() });

export function IncomeForm({ accounts, onSubmit, submitting, submitError, onClearError }) {
  const [form, setForm] = useState(emptyForm);
  const [localErrors, setLocalErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setLocalErrors((prev) => ({ ...prev, [field]: null }));
    if (submitError) onClearError();
    setSuccess(false);
  };

  const validate = () => {
    const errors = {};
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0)
      errors.amount = "Enter a positive amount";
    else if (!/^\d+(\.\d{1,2})?$/.test(form.amount))
      errors.amount = "At most 2 decimal places";
    if (!form.account_id) errors.account_id = "Select an account";
    if (!form.source.trim()) errors.source = "Source is required";
    if (!form.date) errors.date = "Date is required";
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }

    const result = await onSubmit(form);
    if (result.success) {
      setForm({ ...emptyForm(), account_id: form.account_id });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="form-title">Add Income</h2>

      <div className="form-row">
        <div className="field">
          <label htmlFor="income-amount">Amount</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">₹</span>
            <input
              id="income-amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={set("amount")}
              className={localErrors.amount ? "error" : ""}
              disabled={submitting}
            />
          </div>
          {localErrors.amount && <span className="field-error">{localErrors.amount}</span>}
        </div>

        <div className="field">
          <label htmlFor="income-account">Deposit To</label>
          <select
            id="income-account"
            value={form.account_id}
            onChange={set("account_id")}
            className={localErrors.account_id ? "error" : ""}
            disabled={submitting || accounts.length === 0}
          >
            <option value="">Select account...</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {localErrors.account_id && <span className="field-error">{localErrors.account_id}</span>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="income-source">Source</label>
        <input
          id="income-source"
          type="text"
          placeholder="e.g. Salary, Freelance, Gift"
          value={form.source}
          onChange={set("source")}
          className={localErrors.source ? "error" : ""}
          disabled={submitting}
          maxLength={200}
        />
        {localErrors.source && <span className="field-error">{localErrors.source}</span>}
      </div>

      <div className="field">
        <label htmlFor="income-date">Date</label>
        <input
          id="income-date"
          type="date"
          value={form.date}
          onChange={set("date")}
          className={localErrors.date ? "error" : ""}
          disabled={submitting}
        />
        {localErrors.date && <span className="field-error">{localErrors.date}</span>}
      </div>

      {accounts.length === 0 && (
        <div className="alert alert-error" role="alert">
          Add a bank account first so income has somewhere to go.
        </div>
      )}
      {submitError && (
        <div className="alert alert-error" role="alert">{submitError}</div>
      )}
      {success && (
        <div className="alert alert-success" role="status">Income added!</div>
      )}

      <button type="submit" className="btn-primary" disabled={submitting || accounts.length === 0}>
        {submitting ? (
          <span className="btn-loading">
            <span className="spinner" aria-hidden="true" />
            Saving…
          </span>
        ) : (
          "Add Income"
        )}
      </button>
    </form>
  );
}
