/**
 * API client for the Expense Tracker backend.
 *
 * Key design decisions:
 * - Generates a stable idempotency key per form submission (stored in sessionStorage
 *   until the request succeeds), so that refreshing or clicking submit twice never
 *   creates duplicate records.
 * - Surfaces structured errors from the server (validation messages).
 */

// Strip a trailing slash so a misconfigured env var (e.g. ".../ ") doesn't
// produce a double-slash path like ".com//accounts", which the backend 404s on.
const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || "Request failed");
    this.status = status;
    this.data = data;
    this.validationErrors = data?.errors ?? null;
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data;
}

// ── Idempotency key management ────────────────────────────────────────────────
// We persist a pending key in sessionStorage, keyed per resource type. On successful
// submission we clear it; on page reload mid-submission the same key is reused,
// preventing duplicates.

function getPendingKey(storageKey) {
  return sessionStorage.getItem(storageKey);
}

function setPendingKey(storageKey, key) {
  sessionStorage.setItem(storageKey, key);
}

function clearPendingKey(storageKey) {
  sessionStorage.removeItem(storageKey);
}

function newIdempotencyKey() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function postIdempotent(path, storageKey, body) {
  let key = getPendingKey(storageKey);
  if (!key) {
    key = newIdempotencyKey();
    setPendingKey(storageKey, key);
  }

  try {
    const result = await request(path, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    clearPendingKey(storageKey);
    return result;
  } catch (err) {
    if (err.status === 422) {
      clearPendingKey(storageKey);
    }
    throw err;
  }
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export function createExpense(formData) {
  return postIdempotent("/expenses", "pending_idempotency_key_expense", formData);
}

export async function fetchExpenses({ account_id, category_id, sort } = {}) {
  const params = new URLSearchParams();
  if (account_id) params.set("account_id", account_id);
  if (category_id) params.set("category_id", category_id);
  if (sort) params.set("sort", sort);
  const qs = params.toString() ? `?${params}` : "";
  return request(`/expenses${qs}`);
}

// ── Income ────────────────────────────────────────────────────────────────────

export function createIncome(formData) {
  return postIdempotent("/incomes", "pending_idempotency_key_income", formData);
}

export async function fetchIncomes({ account_id } = {}) {
  const params = new URLSearchParams();
  if (account_id) params.set("account_id", account_id);
  const qs = params.toString() ? `?${params}` : "";
  return request(`/incomes${qs}`);
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function fetchAccounts() {
  return request("/accounts");
}

export async function createAccount(formData) {
  return request("/accounts", {
    method: "POST",
    body: JSON.stringify(formData),
  });
}

// ── Categories ────────────────────────────────────────────────────────────────

export async function fetchCategories() {
  return request("/categories");
}

export async function createCategory(formData) {
  return request("/categories", {
    method: "POST",
    body: JSON.stringify(formData),
  });
}
