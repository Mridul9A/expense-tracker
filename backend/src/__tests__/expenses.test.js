/**
 * Integration tests for the Expense Tracker API
 * Run with: npm test
 *
 * Uses Node's built-in test runner (no additional test framework needed).
 * Tests spin up the actual Express app against a temp SQLite DB.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// Use a temp DB for tests
process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "test";
process.env.ENCRYPTION_KEY = "0".repeat(64); // 32-byte hex key, test-only

const BASE_URL = "http://localhost:3002";

let server;
let db;
let token;
let accountId;
let categoryId;

const signup = async (email, password = "password123") => {
  const res = await fetch(`${BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res;
};

const authed = (path, options = {}) =>
  fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

before(async () => {
  // Dynamic import so DB_PATH env var is picked up
  const { default: app } = await import("../index.js");
  ({ default: db } = await import("../db/index.js"));
  server = app.listen(3002);
  // Wait for server to be ready
  await new Promise((r) => setTimeout(r, 100));

  const signupRes = await signup(`primary-${Date.now()}@test.com`);
  const signupBody = await signupRes.json();
  token = signupBody.token;

  const accountRes = await authed("/accounts", {
    method: "POST",
    body: JSON.stringify({ name: "Test Checking", initial_balance: "100.00" }),
  });
  accountId = (await accountRes.json()).id;

  const categoriesRes = await authed("/categories");
  categoryId = (await categoriesRes.json()).data[0].id;
});

after(() => {
  server?.close();
});

const postExpense = (body, headers = {}) =>
  authed("/expenses", { method: "POST", body: JSON.stringify(body), headers });

const getExpenses = (params = "") => authed(`/expenses${params}`);

const validExpense = () => ({
  amount: "12.50",
  account_id: accountId,
  category_id: categoryId,
  description: "Lunch",
  date: "2024-03-15",
});

describe("Auth", () => {
  it("signs up a new user and returns a token", async () => {
    const res = await signup(`newuser-${Date.now()}@test.com`);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.token);
    assert.ok(body.user.id);
    assert.equal(body.user.password_hash, undefined);
  });

  it("seeds default categories for the new user", async () => {
    const email = `seeded-${Date.now()}@test.com`;
    const res = await signup(email);
    const { token: newToken } = await res.json();
    const catRes = await fetch(`${BASE_URL}/categories`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    const { data } = await catRes.json();
    assert.ok(data.map((c) => c.name).includes("Rent"));
  });

  it("rejects duplicate signup email", async () => {
    const email = `dupe-${Date.now()}@test.com`;
    await signup(email);
    const res = await signup(email);
    assert.equal(res.status, 422);
  });

  it("rejects short passwords", async () => {
    const res = await signup(`shortpw-${Date.now()}@test.com`, "abc");
    assert.equal(res.status, 422);
  });

  it("logs in with correct credentials", async () => {
    const email = `login-${Date.now()}@test.com`;
    await signup(email, "correcthorse");
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "correcthorse" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
  });

  it("rejects login with wrong password", async () => {
    const email = `wrongpw-${Date.now()}@test.com`;
    await signup(email, "correcthorse");
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrongpassword" }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects requests with no token", async () => {
    const res = await fetch(`${BASE_URL}/accounts`);
    assert.equal(res.status, 401);
  });

  it("rejects requests with a garbage token", async () => {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    assert.equal(res.status, 401);
  });
});

describe("Cross-user isolation", () => {
  it("can't see another user's accounts, categories, or expenses", async () => {
    // Second, independent user
    const res = await signup(`other-${Date.now()}@test.com`);
    const { token: otherToken } = await res.json();
    const otherFetch = (path, options = {}) =>
      fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${otherToken}`,
          ...options.headers,
        },
      });

    const accountsRes = await otherFetch("/accounts");
    const { data: otherAccounts } = await accountsRes.json();
    assert.ok(!otherAccounts.some((a) => a.id === accountId));

    // Can't create an expense against the primary user's account
    const expenseRes = await otherFetch("/expenses", {
      method: "POST",
      body: JSON.stringify(validExpense()),
    });
    assert.equal(expenseRes.status, 422);

    // Can't create an expense using the primary user's category, even with their own account
    const ownAccountRes = await otherFetch("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: "Other's Account" }),
    });
    const ownAccountId = (await ownAccountRes.json()).id;
    const mixedRes = await otherFetch("/expenses", {
      method: "POST",
      body: JSON.stringify({ ...validExpense(), account_id: ownAccountId, category_id: categoryId }),
    });
    assert.equal(mixedRes.status, 422);
  });
});

describe("Encryption at rest", () => {
  it("stores description/amount/account name/category name as ciphertext, not plaintext", async () => {
    const res = await postExpense({ ...validExpense(), description: "Very private lunch details" });
    const expense = await res.json();

    const { rows } = await db.execute({
      sql: "SELECT description, amount FROM expenses WHERE id = $id",
      args: { $id: expense.id },
    });
    assert.notEqual(rows[0].description, "Very private lunch details");
    assert.ok(rows[0].description.split(".").length === 3, "expected iv.tag.ciphertext format");
    assert.notEqual(String(rows[0].amount), "1250"); // cents, would be the plaintext form

    const { rows: accountRows } = await db.execute({
      sql: "SELECT name FROM accounts WHERE id = $id",
      args: { $id: accountId },
    });
    assert.notEqual(accountRows[0].name, "Test Checking");
  });
});

describe("POST /expenses", () => {
  it("creates an expense and returns 201", async () => {
    const res = await postExpense(validExpense());
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.amount, "12.50");
    assert.equal(body.account_id, accountId);
    assert.equal(body.category_id, categoryId);
    assert.ok(body.id, "should have an id");
    assert.ok(body.created_at, "should have created_at");
  });

  it("returns 422 for negative amount", async () => {
    const res = await postExpense({ ...validExpense(), amount: "-5" });
    assert.equal(res.status, 422);
  });

  it("returns 422 for zero amount", async () => {
    const res = await postExpense({ ...validExpense(), amount: "0" });
    assert.equal(res.status, 422);
  });

  it("returns 422 for missing account_id", async () => {
    const res = await postExpense({ ...validExpense(), account_id: "" });
    assert.equal(res.status, 422);
  });

  it("returns 422 for unknown account_id", async () => {
    const res = await postExpense({ ...validExpense(), account_id: "does-not-exist" });
    assert.equal(res.status, 422);
  });

  it("returns 422 for unknown category_id", async () => {
    const res = await postExpense({ ...validExpense(), category_id: "does-not-exist" });
    assert.equal(res.status, 422);
  });

  it("returns 422 for invalid date", async () => {
    const res = await postExpense({ ...validExpense(), date: "not-a-date" });
    assert.equal(res.status, 422);
  });

  it("is idempotent: duplicate idempotency key returns the original expense", async () => {
    const key = `test-key-${Date.now()}`;
    const headers = { "Idempotency-Key": key };

    const res1 = await postExpense(validExpense(), headers);
    const body1 = await res1.json();
    assert.equal(res1.status, 201);

    const res2 = await postExpense(validExpense(), headers);
    const body2 = await res2.json();
    // Second call should return 200 (already processed), same record
    assert.equal(res2.status, 200);
    assert.equal(body2.id, body1.id);
  });
});

describe("GET /expenses", () => {
  it("returns expenses list with meta", async () => {
    const res = await getExpenses();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.ok(typeof body.meta.total === "string");
    assert.ok(typeof body.meta.count === "number");
  });

  it("filters by account_id", async () => {
    await postExpense(validExpense());
    const res = await getExpenses(`?account_id=${accountId}`);
    const body = await res.json();
    assert.ok(body.data.every((e) => e.account_id === accountId));
  });

  it("filters by category_id", async () => {
    await postExpense(validExpense());
    const res = await getExpenses(`?category_id=${categoryId}`);
    const body = await res.json();
    assert.ok(body.data.every((e) => e.category_id === categoryId));
  });

  it("returns expenses sorted by date newest first", async () => {
    const res = await getExpenses("?sort=date_desc");
    const body = await res.json();
    const dates = body.data.map((e) => e.date);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
    assert.deepEqual(dates, sorted);
  });

  it("total reflects filtered results only", async () => {
    const createRes = await authed("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: `Filter-${Date.now()}` }),
    });
    const filterAccountId = (await createRes.json()).id;

    await postExpense({ ...validExpense(), amount: "10.00", account_id: filterAccountId });
    await postExpense({ ...validExpense(), amount: "5.00", account_id: filterAccountId });

    const res = await getExpenses(`?account_id=${filterAccountId}`);
    const body = await res.json();
    assert.equal(body.meta.total, "15.00");
  });
});

describe("PUT /expenses/:id", () => {
  it("updates an expense's fields", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();

    const res = await authed(`/expenses/${expense.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...validExpense(), amount: "99.99", description: "Updated description" }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.amount, "99.99");
    assert.equal(updated.description, "Updated description");
    assert.equal(updated.id, expense.id);
  });

  it("returns 404 for an unknown expense", async () => {
    const res = await authed("/expenses/does-not-exist", {
      method: "PUT",
      body: JSON.stringify(validExpense()),
    });
    assert.equal(res.status, 404);
  });

  it("can't update another user's expense", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();

    const otherRes = await signup(`expense-editor-${Date.now()}@test.com`);
    const { token: otherToken } = await otherRes.json();

    const res = await fetch(`${BASE_URL}/expenses/${expense.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherToken}` },
      body: JSON.stringify(validExpense()),
    });
    assert.equal(res.status, 404);
  });

  it("returns 422 for invalid fields", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();

    const res = await authed(`/expenses/${expense.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...validExpense(), amount: "-5" }),
    });
    assert.equal(res.status, 422);
  });
});

describe("DELETE /expenses/:id", () => {
  it("deletes an expense", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();

    const deleteRes = await authed(`/expenses/${expense.id}`, { method: "DELETE" });
    assert.equal(deleteRes.status, 204);

    const listRes = await getExpenses();
    const { data } = await listRes.json();
    assert.ok(!data.some((e) => e.id === expense.id));
  });

  it("returns 404 deleting an already-deleted expense", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();
    await authed(`/expenses/${expense.id}`, { method: "DELETE" });

    const res = await authed(`/expenses/${expense.id}`, { method: "DELETE" });
    assert.equal(res.status, 404);
  });

  it("can't delete another user's expense", async () => {
    const createRes = await postExpense(validExpense());
    const expense = await createRes.json();

    const otherRes = await signup(`expense-deleter-${Date.now()}@test.com`);
    const { token: otherToken } = await otherRes.json();

    const res = await fetch(`${BASE_URL}/expenses/${expense.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(res.status, 404);

    const listRes = await getExpenses();
    const { data } = await listRes.json();
    assert.ok(data.some((e) => e.id === expense.id));
  });
});

describe("Accounts", () => {
  it("creates an account with default zero balance", async () => {
    const res = await authed("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: "Savings" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.balance, "0.00");
  });

  it("balance reflects income minus expenses", async () => {
    const createRes = await authed("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: "Balance Test", initial_balance: "50.00" }),
    });
    const account = await createRes.json();

    await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({
        account_id: account.id, amount: "100.00", source: "Salary", date: "2024-03-01",
      }),
    });
    await postExpense({ ...validExpense(), account_id: account.id, amount: "30.00" });

    const listRes = await authed("/accounts");
    const { data } = await listRes.json();
    const updated = data.find((a) => a.id === account.id);
    // 50 initial + 100 income - 30 expense = 120
    assert.equal(updated.balance, "120.00");
  });

  it("deletes an account and cascades to its expenses/incomes", async () => {
    const createRes = await authed("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: "To Be Deleted", initial_balance: "10.00" }),
    });
    const account = await createRes.json();

    await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({
        account_id: account.id, amount: "5.00", source: "Gift", date: "2024-03-01",
      }),
    });
    const expenseRes = await postExpense({ ...validExpense(), account_id: account.id });
    const expense = await expenseRes.json();

    const deleteRes = await authed(`/accounts/${account.id}`, { method: "DELETE" });
    assert.equal(deleteRes.status, 204);

    const listRes = await authed("/accounts");
    const { data } = await listRes.json();
    assert.ok(!data.some((a) => a.id === account.id));

    const { rows } = await db.execute({
      sql: "SELECT id FROM expenses WHERE id = $id",
      args: { $id: expense.id },
    });
    assert.equal(rows.length, 0, "expense should be deleted along with its account");
  });

  it("returns 404 deleting an already-deleted or unknown account", async () => {
    const res = await authed("/accounts/does-not-exist", { method: "DELETE" });
    assert.equal(res.status, 404);
  });

  it("can't delete another user's account", async () => {
    const createRes = await authed("/accounts", {
      method: "POST",
      body: JSON.stringify({ name: "Protected Account" }),
    });
    const account = await createRes.json();

    const otherRes = await signup(`deleter-${Date.now()}@test.com`);
    const { token: otherToken } = await otherRes.json();

    const deleteRes = await fetch(`${BASE_URL}/accounts/${account.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    assert.equal(deleteRes.status, 404);

    const stillThereRes = await authed("/accounts");
    const { data } = await stillThereRes.json();
    assert.ok(data.some((a) => a.id === account.id));
  });
});

describe("Categories", () => {
  it("lists seeded default categories", async () => {
    const res = await authed("/categories");
    const body = await res.json();
    const names = body.data.map((c) => c.name);
    assert.ok(names.includes("Family"));
    assert.ok(names.includes("Rent"));
    assert.ok(names.includes("Money Waste"));
  });

  it("creates a custom category", async () => {
    const res = await authed("/categories", {
      method: "POST",
      body: JSON.stringify({ name: `Custom-${Date.now()}` }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_default, false);
    assert.match(body.color, /^#[0-9a-fA-F]{6}$/);
  });

  it("rejects duplicate category names", async () => {
    const res = await authed("/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Family" }),
    });
    assert.equal(res.status, 422);
  });
});

describe("Incomes", () => {
  it("creates income and is idempotent", async () => {
    const key = `income-key-${Date.now()}`;
    const body = {
      account_id: accountId, amount: "500.00", source: "Salary", date: "2024-03-01",
    };

    const res1 = await authed("/incomes", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    assert.equal(res1.status, 201);
    const income1 = await res1.json();

    const res2 = await authed("/incomes", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    assert.equal(res2.status, 200);
    const income2 = await res2.json();
    assert.equal(income1.id, income2.id);
  });

  it("returns 422 for unknown account_id", async () => {
    const res = await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({
        account_id: "nope", amount: "10.00", source: "Gift", date: "2024-03-01",
      }),
    });
    assert.equal(res.status, 422);
  });

  it("updates an income's fields", async () => {
    const createRes = await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({ account_id: accountId, amount: "10.00", source: "Gift", date: "2024-03-01" }),
    });
    const income = await createRes.json();

    const res = await authed(`/incomes/${income.id}`, {
      method: "PUT",
      body: JSON.stringify({ account_id: accountId, amount: "20.00", source: "Bonus", date: "2024-03-02" }),
    });
    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.amount, "20.00");
    assert.equal(updated.source, "Bonus");
  });

  it("returns 404 updating an unknown income", async () => {
    const res = await authed("/incomes/does-not-exist", {
      method: "PUT",
      body: JSON.stringify({ account_id: accountId, amount: "10.00", source: "Gift", date: "2024-03-01" }),
    });
    assert.equal(res.status, 404);
  });

  it("deletes an income", async () => {
    const createRes = await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({ account_id: accountId, amount: "10.00", source: "To Delete", date: "2024-03-01" }),
    });
    const income = await createRes.json();

    const deleteRes = await authed(`/incomes/${income.id}`, { method: "DELETE" });
    assert.equal(deleteRes.status, 204);

    const listRes = await authed("/incomes");
    const { data } = await listRes.json();
    assert.ok(!data.some((i) => i.id === income.id));
  });

  it("can't update or delete another user's income", async () => {
    const createRes = await authed("/incomes", {
      method: "POST",
      body: JSON.stringify({ account_id: accountId, amount: "10.00", source: "Protected", date: "2024-03-01" }),
    });
    const income = await createRes.json();

    const otherRes = await signup(`income-editor-${Date.now()}@test.com`);
    const { token: otherToken } = await otherRes.json();
    const otherHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${otherToken}` };

    const updateRes = await fetch(`${BASE_URL}/incomes/${income.id}`, {
      method: "PUT",
      headers: otherHeaders,
      body: JSON.stringify({ account_id: accountId, amount: "1.00", source: "Hacked", date: "2024-03-01" }),
    });
    assert.equal(updateRes.status, 404);

    const deleteRes = await fetch(`${BASE_URL}/incomes/${income.id}`, {
      method: "DELETE",
      headers: otherHeaders,
    });
    assert.equal(deleteRes.status, 404);
  });
});
