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

const BASE_URL = "http://localhost:3002";

let server;
let accountId;
let categoryId;

before(async () => {
  // Dynamic import so DB_PATH env var is picked up
  const { default: app } = await import("../index.js");
  server = app.listen(3002);
  // Wait for server to be ready
  await new Promise((r) => setTimeout(r, 100));

  const accountRes = await fetch(`${BASE_URL}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Checking", initial_balance: "100.00" }),
  });
  accountId = (await accountRes.json()).id;

  const categoriesRes = await fetch(`${BASE_URL}/categories`);
  categoryId = (await categoriesRes.json()).data[0].id;
});

after(() => {
  server?.close();
});

const postExpense = (body, headers = {}) =>
  fetch(`${BASE_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const getExpenses = (params = "") =>
  fetch(`${BASE_URL}/expenses${params}`);

const validExpense = () => ({
  amount: "12.50",
  account_id: accountId,
  category_id: categoryId,
  description: "Lunch",
  date: "2024-03-15",
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
    const createRes = await fetch(`${BASE_URL}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

describe("Accounts", () => {
  it("creates an account with default zero balance", async () => {
    const res = await fetch(`${BASE_URL}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Savings" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.balance, "0.00");
  });

  it("balance reflects income minus expenses", async () => {
    const createRes = await fetch(`${BASE_URL}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Balance Test", initial_balance: "50.00" }),
    });
    const account = await createRes.json();

    await fetch(`${BASE_URL}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: account.id, amount: "100.00", source: "Salary", date: "2024-03-01",
      }),
    });
    await postExpense({ ...validExpense(), account_id: account.id, amount: "30.00" });

    const listRes = await fetch(`${BASE_URL}/accounts`);
    const { data } = await listRes.json();
    const updated = data.find((a) => a.id === account.id);
    // 50 initial + 100 income - 30 expense = 120
    assert.equal(updated.balance, "120.00");
  });
});

describe("Categories", () => {
  it("lists seeded default categories", async () => {
    const res = await fetch(`${BASE_URL}/categories`);
    const body = await res.json();
    const names = body.data.map((c) => c.name);
    assert.ok(names.includes("Family"));
    assert.ok(names.includes("Rent"));
    assert.ok(names.includes("Money Waste"));
  });

  it("creates a custom category", async () => {
    const res = await fetch(`${BASE_URL}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Custom-${Date.now()}` }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.is_default, false);
    assert.match(body.color, /^#[0-9a-fA-F]{6}$/);
  });

  it("rejects duplicate category names", async () => {
    const res = await fetch(`${BASE_URL}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

    const res1 = await fetch(`${BASE_URL}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    assert.equal(res1.status, 201);
    const income1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
    assert.equal(res2.status, 200);
    const income2 = await res2.json();
    assert.equal(income1.id, income2.id);
  });

  it("returns 422 for unknown account_id", async () => {
    const res = await fetch(`${BASE_URL}/incomes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: "nope", amount: "10.00", source: "Gift", date: "2024-03-01",
      }),
    });
    assert.equal(res.status, 422);
  });
});
