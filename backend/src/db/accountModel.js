/**
 * Balance is never stored — it's computed on read from initial_balance plus the
 * account's income/expense ledger. This avoids balance drift bugs that come from
 * incrementally updating a stored total (e.g. a failed transaction leaving it stale).
 *
 * name/bank_name/initial_balance are encrypted at rest (see lib/crypto.js), so
 * balance can no longer be summed in SQL (can't SUM() ciphertext) — incomes and
 * expenses are fetched and summed here instead, after decrypting.
 */
import db from "./index.js";
import { encrypt, decrypt, encryptAmount, decryptAmount } from "../lib/crypto.js";

const toCents = (v) => Math.round(parseFloat(v) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

const serialize = (row, balanceCents) => ({
  id:              row.id,
  name:            decrypt(row.name),
  bank_name:       row.bank_name != null ? decrypt(row.bank_name) : null,
  initial_balance: fromCents(decryptAmount(row.initial_balance)),
  balance:         fromCents(balanceCents),
  created_at:      row.created_at,
});

const sumByAccount = (rows) => {
  const map = {};
  for (const r of rows) {
    map[r.account_id] = (map[r.account_id] || 0) + decryptAmount(r.amount);
  }
  return map;
};

export const createAccount = async ({ id, userId, name, bank_name, initial_balance }) => {
  await db.execute({
    sql: `
      INSERT INTO accounts (id, user_id, name, bank_name, initial_balance)
      VALUES ($id, $user_id, $name, $bank_name, $initial_balance)
    `,
    args: {
      $id:              id,
      $user_id:         userId,
      $name:            encrypt(name.trim()),
      $bank_name:       bank_name?.trim() ? encrypt(bank_name.trim()) : null,
      $initial_balance: encryptAmount(toCents(initial_balance ?? 0)),
    },
  });

  return getAccountById(id, userId);
};

export const getAccountById = async (id, userId) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM accounts WHERE id = $id AND user_id = $user_id",
    args: { $id: id, $user_id: userId },
  });
  if (!rows[0]) return null;

  const [{ rows: incomeRows }, { rows: expenseRows }] = await Promise.all([
    db.execute({ sql: "SELECT amount FROM incomes WHERE account_id = $id", args: { $id: id } }),
    db.execute({ sql: "SELECT amount FROM expenses WHERE account_id = $id", args: { $id: id } }),
  ]);

  const incomeCents = incomeRows.reduce((sum, r) => sum + decryptAmount(r.amount), 0);
  const expenseCents = expenseRows.reduce((sum, r) => sum + decryptAmount(r.amount), 0);
  const initialCents = decryptAmount(rows[0].initial_balance);

  return serialize(rows[0], initialCents + incomeCents - expenseCents);
};

// Deleting an account cascades to its expenses/incomes — there's no FK
// enforcement at the DB level (see db/index.js), and leaving orphaned
// transaction rows behind would silently break every join that expects
// e.account_id/i.account_id to resolve to a real account. Runs as one atomic
// batch so a failure partway through can't leave transactions half-deleted.
export const deleteAccount = async (id, userId) => {
  const existing = await db.execute({
    sql: "SELECT id FROM accounts WHERE id = $id AND user_id = $user_id",
    args: { $id: id, $user_id: userId },
  });
  if (!existing.rows[0]) return false;

  await db.batch([
    { sql: "DELETE FROM expenses WHERE account_id = $id", args: { $id: id } },
    { sql: "DELETE FROM incomes WHERE account_id = $id", args: { $id: id } },
    { sql: "DELETE FROM accounts WHERE id = $id AND user_id = $user_id", args: { $id: id, $user_id: userId } },
  ], "write");

  return true;
};

export const listAccounts = async (userId) => {
  const { rows: accountRows } = await db.execute({
    sql: "SELECT * FROM accounts WHERE user_id = $user_id ORDER BY created_at ASC",
    args: { $user_id: userId },
  });
  if (!accountRows.length) return [];

  const [{ rows: incomeRows }, { rows: expenseRows }] = await Promise.all([
    db.execute({
      sql: `SELECT i.account_id, i.amount FROM incomes i JOIN accounts a ON a.id = i.account_id WHERE a.user_id = $user_id`,
      args: { $user_id: userId },
    }),
    db.execute({
      sql: `SELECT e.account_id, e.amount FROM expenses e JOIN accounts a ON a.id = e.account_id WHERE a.user_id = $user_id`,
      args: { $user_id: userId },
    }),
  ]);

  const incomeByAccount = sumByAccount(incomeRows);
  const expenseByAccount = sumByAccount(expenseRows);

  return accountRows.map((row) => {
    const initialCents = decryptAmount(row.initial_balance);
    const balanceCents = initialCents + (incomeByAccount[row.id] || 0) - (expenseByAccount[row.id] || 0);
    return serialize(row, balanceCents);
  });
};
