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
    name            TEXT    NOT NULL, -- encrypted (lib/crypto.js)
    bank_name       TEXT,             -- encrypted
    initial_balance TEXT    NOT NULL, -- encrypted integer-cents string
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES users(id),
    name        TEXT    NOT NULL, -- encrypted
    color       TEXT    NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    account_id      TEXT    NOT NULL REFERENCES accounts(id),
    amount          TEXT    NOT NULL, -- encrypted integer-cents string
    source          TEXT    NOT NULL, -- encrypted
    date            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id              TEXT PRIMARY KEY,
    idempotency_key TEXT UNIQUE,
    account_id      TEXT    NOT NULL REFERENCES accounts(id),
    category_id     TEXT    NOT NULL REFERENCES categories(id),
    amount          TEXT    NOT NULL, -- encrypted integer-cents string
    description     TEXT    NOT NULL, -- encrypted
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
//
// Migrations are tracked explicitly in this table (a plain SELECT) rather
// than re-derived via PRAGMA table_info on every boot, so each one runs at
// most once, ever, regardless of how many times the process restarts.
await db.execute(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

async function migrationApplied(name) {
  const { rows } = await db.execute({
    sql: "SELECT 1 FROM schema_migrations WHERE name = $name",
    args: { $name: name },
  });
  return rows.length > 0;
}

async function markMigrationApplied(name) {
  await db.execute({
    sql: "INSERT OR IGNORE INTO schema_migrations (name) VALUES ($name)",
    args: { $name: name },
  });
}

async function hasColumn(table, column) {
  const { rows } = await db.execute(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

const ADD_USER_ID_TO_ACCOUNTS = "add_user_id_to_accounts";
if (!(await migrationApplied(ADD_USER_ID_TO_ACCOUNTS))) {
  if (!(await hasColumn("accounts", "user_id"))) {
    await db.execute("ALTER TABLE accounts ADD COLUMN user_id TEXT REFERENCES users(id)");
  }
  await markMigrationApplied(ADD_USER_ID_TO_ACCOUNTS);
}

const REBUILD_CATEGORIES_WITH_USER_ID = "rebuild_categories_with_user_id";
if (!(await migrationApplied(REBUILD_CATEGORIES_WITH_USER_ID))) {
  if (!(await hasColumn("categories", "user_id"))) {
    // categories can't just get a column added: the pre-auth table has a bare
    // UNIQUE(name) constraint (global, not per-user), which SQLite has no ALTER
    // TABLE command to drop. Rebuild the table instead.
    //
    // Critical ordering detail: build the REPLACEMENT table under a temporary
    // name first, copy data into it, drop the original, then rename the
    // replacement into place. Doing it the other way around — renaming the
    // original OUT of the way first (categories -> categories_old) — silently
    // corrupts every other table that has a REFERENCES categories(id) clause:
    // SQLite auto-rewrites those clauses to point at the new name during a
    // rename, so expenses.category_id ends up permanently pointing at
    // "categories_old" even after a fresh categories table exists. That's
    // exactly what happened here in production (see the repair migration
    // right below this one) — the lesson is encoded in the ordering itself.
    await db.executeMultiple(`
      CREATE TABLE categories_new (
        id          TEXT PRIMARY KEY,
        user_id     TEXT REFERENCES users(id),
        name        TEXT    NOT NULL,
        color       TEXT    NOT NULL,
        is_default  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO categories_new (id, user_id, name, color, is_default, created_at)
        SELECT id, NULL, name, color, is_default, created_at FROM categories;

      DROP TABLE categories;

      ALTER TABLE categories_new RENAME TO categories;
    `);
  }
  await markMigrationApplied(REBUILD_CATEGORIES_WITH_USER_ID);
}

const REPAIR_EXPENSES_CATEGORY_FK = "repair_expenses_category_fk_2026_10";
if (!(await migrationApplied(REPAIR_EXPENSES_CATEGORY_FK))) {
  // One-time repair for the corruption described above: on any database
  // where the buggy rename-first ordering already ran, expenses.category_id's
  // stored REFERENCES clause literally says "categories_old" — a table that
  // no longer exists. That's inert as long as FK enforcement is off (it is —
  // we never PRAGMA foreign_keys = ON), right up until SQLite needs to
  // resolve the clause for something else, at which point every INSERT INTO
  // expenses fails with "no such table: categories_old". Detect the broken
  // clause by inspecting the table's actual stored SQL, and if it's there,
  // rebuild expenses the same safe way (new table under a temp name first),
  // preserving every row and column exactly as-is.
  const { rows } = await db.execute(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses'"
  );
  const isBroken = rows[0]?.sql?.includes("categories_old");

  if (isBroken) {
    await db.executeMultiple(`
      CREATE TABLE expenses_new (
        id              TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        account_id      TEXT    NOT NULL REFERENCES accounts(id),
        category_id     TEXT    NOT NULL REFERENCES categories(id),
        amount          TEXT    NOT NULL,
        description     TEXT    NOT NULL,
        date            TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO expenses_new
        (id, idempotency_key, account_id, category_id, amount, description, date, created_at)
        SELECT id, idempotency_key, account_id, category_id, amount, description, date, created_at
        FROM expenses;

      DROP TABLE expenses;

      ALTER TABLE expenses_new RENAME TO expenses;
    `);
  }
  await markMigrationApplied(REPAIR_EXPENSES_CATEGORY_FK);
}

await db.executeMultiple(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name ON categories(user_id, name);
  CREATE INDEX IF NOT EXISTS idx_accounts_user    ON accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_categories_user   ON categories(user_id);

  CREATE INDEX IF NOT EXISTS idx_expenses_account         ON expenses(account_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_category        ON expenses(category_id);
  CREATE INDEX IF NOT EXISTS idx_expenses_date            ON expenses(date DESC);
  CREATE INDEX IF NOT EXISTS idx_expenses_idempotency_key ON expenses(idempotency_key);
`);

export default db;
