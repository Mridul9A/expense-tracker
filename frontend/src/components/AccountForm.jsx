import { useState } from "react";

const EMPTY_FORM = { name: "", bank_name: "", initial_balance: "" };

export function AccountForm({ onSubmit, submitting, submitError, onClearError }) {
  const [form, setForm] = useState(EMPTY_FORM);
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
    if (!form.name.trim()) errors.name = "Account name is required";
    if (form.initial_balance && !/^\d+(\.\d{1,2})?$/.test(form.initial_balance)) {
      errors.initial_balance = "At most 2 decimal places";
    }
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setLocalErrors(errors);
      return;
    }

    const result = await onSubmit({
      name: form.name,
      bank_name: form.bank_name || undefined,
      initial_balance: form.initial_balance || undefined,
    });
    if (result.success) {
      setForm(EMPTY_FORM);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="form-title">Add Bank Account</h2>

      <div className="field">
        <label htmlFor="account-name">Account Name</label>
        <input
          id="account-name"
          type="text"
          placeholder="e.g. Chase Checking"
          value={form.name}
          onChange={set("name")}
          className={localErrors.name ? "error" : ""}
          disabled={submitting}
          maxLength={100}
        />
        {localErrors.name && <span className="field-error">{localErrors.name}</span>}
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="bank-name">Bank Name</label>
          <input
            id="bank-name"
            type="text"
            placeholder="Optional"
            value={form.bank_name}
            onChange={set("bank_name")}
            disabled={submitting}
            maxLength={100}
          />
        </div>

        <div className="field">
          <label htmlFor="initial-balance">Starting Balance</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">₹</span>
            <input
              id="initial-balance"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={form.initial_balance}
              onChange={set("initial_balance")}
              className={localErrors.initial_balance ? "error" : ""}
              disabled={submitting}
            />
          </div>
          {localErrors.initial_balance && (
            <span className="field-error">{localErrors.initial_balance}</span>
          )}
        </div>
      </div>

      {submitError && (
        <div className="alert alert-error" role="alert">{submitError}</div>
      )}
      {success && (
        <div className="alert alert-success" role="status">Account added!</div>
      )}

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? (
          <span className="btn-loading">
            <span className="spinner" aria-hidden="true" />
            Saving…
          </span>
        ) : (
          "Add Account"
        )}
      </button>
    </form>
  );
}
