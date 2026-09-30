import { useState, useEffect } from "react";

const today = () => new Date().toISOString().split("T")[0];

const emptyForm = (accountId = "") => ({
  amount: "",
  account_id: accountId,
  category_id: "",
  description: "",
  date: today(),
});

const formFromExpense = (expense) => ({
  amount: expense.amount,
  account_id: expense.account_id,
  category_id: expense.category_id,
  description: expense.description,
  date: expense.date,
});

const NEW_CATEGORY = "__new__";

export function ExpenseForm({
  accounts, categories, onSubmit, onAddCategory, editingExpense, onCancelEdit,
  submitting, submitError, onClearError,
}) {
  const [form, setForm] = useState(() => (editingExpense ? formFromExpense(editingExpense) : emptyForm()));
  const [localErrors, setLocalErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState(null);

  // Swap the form's contents whenever the thing we're editing changes —
  // covers both entering edit mode and switching to a different expense.
  useEffect(() => {
    setForm(editingExpense ? formFromExpense(editingExpense) : emptyForm());
    setLocalErrors({});
    setSuccess(false);
  }, [editingExpense]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setLocalErrors((prev) => ({ ...prev, [field]: null }));
    if (submitError) onClearError();
    setSuccess(false);
  };

  const handleCategoryChange = (e) => {
    const value = e.target.value;
    if (value === NEW_CATEGORY) {
      setNewCategoryName("");
      setCategoryError(null);
      setForm((prev) => ({ ...prev, category_id: NEW_CATEGORY }));
    } else {
      set("category_id")(e);
    }
  };

  const confirmNewCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryError("Enter a category name");
      return;
    }
    setAddingCategory(true);
    setCategoryError(null);
    const result = await onAddCategory({ name: newCategoryName.trim() });
    setAddingCategory(false);
    if (result.success) {
      setForm((prev) => ({ ...prev, category_id: result.category.id }));
      setNewCategoryName("");
    } else {
      setCategoryError(result.error);
    }
  };

  const cancelNewCategory = () => {
    setForm((prev) => ({ ...prev, category_id: "" }));
    setNewCategoryName("");
    setCategoryError(null);
  };

  const validate = () => {
    const errors = {};
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0)
      errors.amount = "Enter a positive amount";
    else if (!/^\d+(\.\d{1,2})?$/.test(form.amount))
      errors.amount = "At most 2 decimal places";
    if (!form.account_id) errors.account_id = "Select an account";
    if (!form.category_id || form.category_id === NEW_CATEGORY)
      errors.category_id = "Select or add a category";
    if (!form.description.trim()) errors.description = "Description is required";
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
      if (editingExpense) {
        onCancelEdit();
      } else {
        setForm(emptyForm(form.account_id));
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    }
  };

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate>
      <h2 className="form-title">{editingExpense ? "Edit Expense" : "Add Expense"}</h2>

      <div className="form-row">
        <div className="field">
          <label htmlFor="amount">Amount</label>
          <div className="input-prefix-wrapper">
            <span className="input-prefix">₹</span>
            <input
              id="amount"
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
          <label htmlFor="expense-account">Account</label>
          <select
            id="expense-account"
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
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={form.category_id}
          onChange={handleCategoryChange}
          className={localErrors.category_id ? "error" : ""}
          disabled={submitting}
        >
          <option value="">Select...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
          <option value={NEW_CATEGORY}>+ Add custom category…</option>
        </select>
        {localErrors.category_id && <span className="field-error">{localErrors.category_id}</span>}

        {form.category_id === NEW_CATEGORY && (
          <div className="new-category-row">
            <input
              type="text"
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              disabled={addingCategory}
              maxLength={50}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={confirmNewCategory}
              disabled={addingCategory}
            >
              {addingCategory ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              className="btn-clear-filter"
              onClick={cancelNewCategory}
              disabled={addingCategory}
            >
              Cancel
            </button>
          </div>
        )}
        {categoryError && <span className="field-error">{categoryError}</span>}
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          type="text"
          placeholder="What was this for?"
          value={form.description}
          onChange={set("description")}
          className={localErrors.description ? "error" : ""}
          disabled={submitting}
          maxLength={500}
          autoComplete="off"
        />
        {localErrors.description && <span className="field-error">{localErrors.description}</span>}
      </div>

      <div className="field">
        <label htmlFor="date">Date</label>
        <input
          id="date"
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
          Add a bank account first so expenses have somewhere to draw from.
        </div>
      )}
      {submitError && (
        <div className="alert alert-error" role="alert">
          {submitError}
        </div>
      )}
      {success && (
        <div className="alert alert-success" role="status">
          Expense added successfully!
        </div>
      )}

      <div className="form-button-row">
        <button type="submit" className="btn-primary" disabled={submitting || accounts.length === 0}>
          {submitting ? (
            <span className="btn-loading">
              <span className="spinner" aria-hidden="true" />
              Saving…
            </span>
          ) : editingExpense ? (
            "Save Changes"
          ) : (
            "Add Expense"
          )}
        </button>
        {editingExpense && (
          <button type="button" className="btn-secondary" onClick={onCancelEdit} disabled={submitting}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
