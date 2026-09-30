/**
 * Balance is never stored — it's computed on read from initial_balance plus the
 * account's income/expense ledger. This avoids balance drift bugs that come from
 * incrementally updating a stored total (e.g. a failed transaction leaving it stale).
 */
import db from "./index.js";

const toCents = (v) => Math.round(parseFloat(v) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

const serialize = (row) => ({
  id:              row.id,
  name:            row.name,
  bank_name:       row.bank_name,
  initial_balance: fromCents(row.initial_balance),
  balance:         fromCents(row.balance),
  created_at:      row.created_at,
});

const BALANCE_EXPR = `
  a.initial_balance
    + COALESCE((SELECT SUM(amount) FROM incomes  WHERE account_id = a.id), 0)
    - COALESCE((SELECT SUM(amount) FROM expenses WHERE account_id = a.id), 0)
`;

export const createAccount = async ({ id, userId, name, bank_name, initial_balance }) => {
  await db.execute({
    sql: `
      INSERT INTO accounts (id, user_id, name, bank_name, initial_balance)
      VALUES ($id, $user_id, $name, $bank_name, $initial_balance)
    `,
    args: {
      $id:              id,
      $user_id:         userId,
      $name:            name.trim(),
      $bank_name:       bank_name?.trim() || null,
      $initial_balance: toCents(initial_balance ?? 0),
    },
  });

  return getAccountById(id, userId);
};

export const getAccountById = async (id, userId) => {
  const { rows } = await db.execute({
    sql: `
      SELECT a.*, (${BALANCE_EXPR}) AS balance
      FROM accounts a
      WHERE a.id = $id AND a.user_id = $user_id
    `,
    args: { $id: id, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const listAccounts = async (userId) => {
  const { rows } = await db.execute({
    sql: `
      SELECT a.*, (${BALANCE_EXPR}) AS balance
      FROM accounts a
      WHERE a.user_id = $user_id
      ORDER BY a.created_at ASC
    `,
    args: { $user_id: userId },
  });
  return rows.map(serialize);
};
