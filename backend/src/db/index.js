/**
 * Uses @libsql/client, which speaks the same SQLite dialect locally (via an
 * embedded `file:` database — no server, no native compilation) and against a
 * hosted Turso database in production by swapping the URL/auth token. This lets
 * the exact same query code run unchanged in both environments.
 */
import { createClient } from "@libsql/client";
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

// Every row in accounts/categories/incomes/expenses belongs to exactly one user —
// there is no shared/global data. Categories are seeded per-user at signup
// (see categoryModel.seedDefaultCategoriesForUser), not here.
await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT    NOT NULL REFERENCES users(id),
    name            TEXT    NOT NULL,
    bank_name       TEXT,
    initial_balance INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id),
    name        TEXT    NOT NULL,
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

// Migration: CREATE TABLE IF NOT EXISTS is a no-op against a database that
// already has the pre-auth schema (accounts/categories with no user_id
// column) — this happened on the very first Turso deploy, before auth
// existed. Rows left behind with a NULL user_id are that old, pre-auth data —
// every query filters by user_id, so they just become invisible, never deleted.
async function hasColumn(table, column) {
  const { rows } = await db.execute(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

if (!(await hasColumn("accounts", "user_id"))) {
  await db.execute("ALTER TABLE accounts ADD COLUMN user_id TEXT REFERENCES users(id)");
}

if (!(await hasColumn("categories", "user_id"))) {
  // categories can't just get a column added: the pre-auth table has a bare
  // UNIQUE(name) constraint (global, not per-user), which SQLite has no ALTER
  // TABLE command to drop. Left in place, the first signed-up user to get a
  // category named "Family" would permanently block every other user from
  // ever having one. Rebuild the table instead via SQLite's standard
  // rename-create-copy-drop pattern.
  await db.executeMultiple(`
    ALTER TABLE categories RENAME TO categories_old;

    CREATE TABLE categories (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id),
      name        TEXT    NOT NULL,
      color       TEXT    NOT NULL,
      is_default  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO categories (id, user_id, name, color, is_default, created_at)
      SELECT id, NULL, name, color, is_default, created_at FROM categories_old;

    DROP TABLE categories_old;
  `);
}

await db.executeMultiple(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);
  CREATE INDEX IF NOT EXISTS idx_accounts_user    ON accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user   ON categories(user_id);
`);

export default db;
