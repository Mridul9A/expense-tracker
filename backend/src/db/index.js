/**
 * Uses @libsql/client, which speaks the same SQLite dialect locally (via an
 * embedded `file:` database — no server, no native compilation) and against a
 * hosted Turso database in production by swapping the URL/auth token. This lets
 * the exact same query code run unchanged in both environments.
 */
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isMemory = process.env.DB_PATH === ":memory:";
const isRemote = !!process.env.TURSO_DATABASE_URL;

let url;
if (isMemory) {
  url = ":memory:";
} else if (isRemote) {
  url = process.env.TURSO_DATABASE_URL;
} else {
  const localPath = path.resolve(__dirname, "../../data/expenses.db");
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  url = `file:${localPath}`;
}

const db = createClient({
  url,
  authToken: isRemote ? process.env.TURSO_AUTH_TOKEN : undefined,
});

await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT    NOT NULL,
    bank_name       TEXT,
    initial_balance INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    color       TEXT    NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    account_id      TEXT    NOT NULL REFERENCES accounts(id),
    amount          INTEGER NOT NULL,
    source          TEXT    NOT NULL,
    date            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    account_id      TEXT    NOT NULL REFERENCES accounts(id),
    category_id     TEXT    NOT NULL REFERENCES categories(id),
    amount          INTEGER NOT NULL,
    description     TEXT    NOT NULL,
    date            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_incomes_account         ON incomes(account_id);
  CREATE INDEX IF NOT EXISTS idx_incomes_date             ON incomes(date DESC);
  CREATE INDEX IF NOT EXISTS idx_incomes_idempotency_key  ON incomes(idempotency_key);

  CREATE INDEX IF NOT EXISTS idx_expenses_account         ON expenses(account_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_category        ON expenses(category_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_date            ON expenses(date DESC);
  CREATE INDEX IF NOT EXISTS idx_expenses_idempotency_key ON expenses(idempotency_key);
`);

// ── Seed default expense categories (first run only) ────────────────────────

const DEFAULT_CATEGORIES = [
  { name: "Family",      color: "#e86c4a" },
  { name: "Rent",        color: "#8b5cf6" },
  { name: "Self",        color: "#4a9ee8" },
  { name: "Stocks",      color: "#10b981" },
  { name: "Learning",    color: "#f59e0b" },
  { name: "Money Waste", color: "#ef4444" },
  { name: "Other",       color: "#6b7280" },
];

const { rows } = await db.execute("SELECT COUNT(*) AS count FROM categories");
if (rows[0].count === 0) {
  for (const cat of DEFAULT_CATEGORIES) {
    await db.execute({
      sql: `INSERT INTO categories (id, name, color, is_default) VALUES ($id, $name, $color, 1)`,
      args: { $id: randomUUID(), $name: cat.name, $color: cat.color },
    });
  }
}

export default db;
