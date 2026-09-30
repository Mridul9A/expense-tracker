import { useState } from "react";
import { useAccounts } from "./hooks/useAccounts.js";
import { useCategories } from "./hooks/useCategories.js";
import { useExpenses } from "./hooks/useExpenses.js";
import { useIncomes } from "./hooks/useIncomes.js";
import { ExpenseForm } from "./components/ExpenseForm.jsx";
import { ExpenseList } from "./components/ExpenseList.jsx";
import { IncomeForm } from "./components/IncomeForm.jsx";
import { IncomeList } from "./components/IncomeList.jsx";
import { AccountForm } from "./components/AccountForm.jsx";
import { AccountList } from "./components/AccountList.jsx";
import { CategorySummary } from "./components/CategorySummary.jsx";
import { PieChart } from "./components/PieChart.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "expenses", label: "Expenses" },
  { id: "income", label: "Income" },
  { id: "accounts", label: "Accounts" },
];

export function AuthenticatedApp({ user, onLogout }) {
  const [tab, setTab] = useState("dashboard");
  const [editingExpense, setEditingExpense] = useState(null);
  const [editingIncome, setEditingIncome] = useState(null);

  const changeTab = (next) => {
    setTab(next);
    setEditingExpense(null);
    setEditingIncome(null);
  };

  const accountsHook = useAccounts();
  const categoriesHook = useCategories();
  const expensesHook = useExpenses();
  const incomesHook = useIncomes();

  const { accounts } = accountsHook;
  const { categories, addCategory } = categoriesHook;

  const handleAddCategory = async (formData) => {
    const result = await addCategory(formData);
    if (result.success) return { success: true, category: result.category };
    return { success: false, error: result.error };
  };

  // Expenses and income both move money in/out of an account's computed balance,
  // so accounts must be refreshed after any create/update/delete succeeds.
  const handleSubmitExpense = async (formData) => {
    const result = editingExpense
      ? await expensesHook.updateExpense(editingExpense.id, formData)
      : await expensesHook.addExpense(formData);
    if (result.success) accountsHook.reload();
    return result;
  };

  const handleDeleteExpense = async (id) => {
    const result = await expensesHook.deleteExpense(id);
    if (result.success) {
      accountsHook.reload();
      if (editingExpense?.id === id) setEditingExpense(null);
    }
    return result;
  };

  const handleSubmitIncome = async (formData) => {
    const result = editingIncome
      ? await incomesHook.updateIncome(editingIncome.id, formData)
      : await incomesHook.addIncome(formData);
    if (result.success) accountsHook.reload();
    return result;
  };

  const handleDeleteIncome = async (id) => {
    const result = await incomesHook.deleteIncome(id);
    if (result.success) {
      accountsHook.reload();
      if (editingIncome?.id === id) setEditingIncome(null);
    }
    return result;
  };

  // Deleting an account cascades to its expenses/income server-side, so both
  // lists (and anything derived from them, like the dashboard charts) need a
  // refresh or they'd keep showing now-deleted entries until the next reload.
  const handleDeleteAccount = async (id) => {
    const result = await accountsHook.deleteAccount(id);
    if (result.success) {
      expensesHook.reload();
      incomesHook.reload();
    }
    return result;
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">₹</span>
            <span className="logo-text">Ledger</span>
          </div>
          <p className="tagline">Track what you earn, spend, and keep.</p>
          <div className="header-user">
            <span className="header-email">{user.email}</span>
            <button className="btn-logout" onClick={onLogout}>Log out</button>
          </div>
        </div>
      </header>

      <nav className="tab-bar">
        <div className="tab-bar-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? "active" : ""}`}
              onClick={() => changeTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="app-main">
        {tab === "dashboard" && (
          <div className="dashboard">
            <AccountList
              accounts={accounts}
              loading={accountsHook.loading}
              error={accountsHook.error}
              onRetry={accountsHook.reload}
            />
            <div className="dashboard-charts">
              <PieChart expenses={expensesHook.expenses} />
              <CategorySummary expenses={expensesHook.expenses} />
            </div>
          </div>
        )}

        {tab === "expenses" && (
          <div className="layout">
            <aside className="sidebar">
              <ExpenseForm
                accounts={accounts}
                categories={categories}
                onSubmit={handleSubmitExpense}
                onAddCategory={handleAddCategory}
                editingExpense={editingExpense}
                onCancelEdit={() => setEditingExpense(null)}
                submitting={expensesHook.submitting}
                submitError={expensesHook.submitError}
                onClearError={expensesHook.clearSubmitError}
              />
            </aside>
            <div className="content">
              <ExpenseList
                expenses={expensesHook.expenses}
                meta={expensesHook.meta}
                filters={expensesHook.filters}
                accounts={accounts}
                categories={categories}
                onFilterChange={expensesHook.updateFilters}
                loading={expensesHook.loading}
                error={expensesHook.error}
                onRetry={expensesHook.reload}
                onEdit={setEditingExpense}
                onDelete={handleDeleteExpense}
                deletingId={expensesHook.deletingId}
                editingId={editingExpense?.id}
              />
            </div>
          </div>
        )}

        {tab === "income" && (
          <div className="layout">
            <aside className="sidebar">
              <IncomeForm
                accounts={accounts}
                onSubmit={handleSubmitIncome}
                editingIncome={editingIncome}
                onCancelEdit={() => setEditingIncome(null)}
                submitting={incomesHook.submitting}
                submitError={incomesHook.submitError}
                onClearError={incomesHook.clearSubmitError}
              />
            </aside>
            <div className="content">
              <IncomeList
                incomes={incomesHook.incomes}
                meta={incomesHook.meta}
                filters={incomesHook.filters}
                accounts={accounts}
                onFilterChange={incomesHook.updateFilters}
                loading={incomesHook.loading}
                error={incomesHook.error}
                onRetry={incomesHook.reload}
                onEdit={setEditingIncome}
                onDelete={handleDeleteIncome}
                deletingId={incomesHook.deletingId}
                editingId={editingIncome?.id}
              />
            </div>
          </div>
        )}

        {tab === "accounts" && (
          <div className="layout">
            <aside className="sidebar">
              <AccountForm
                onSubmit={accountsHook.addAccount}
                submitting={accountsHook.submitting}
                submitError={accountsHook.submitError}
                onClearError={accountsHook.clearSubmitError}
              />
            </aside>
            <div className="content">
              <AccountList
                accounts={accounts}
                loading={accountsHook.loading}
                error={accountsHook.error}
                onRetry={accountsHook.reload}
                onDelete={handleDeleteAccount}
                deletingId={accountsHook.deletingId}
                deleteError={accountsHook.deleteError}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
