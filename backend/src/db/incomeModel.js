/**
 * Incomes don't carry their own user_id — ownership is derived through the
 * account they belong to, so every query joins accounts and filters on
 * a.user_id. This avoids a second source of truth for who owns what.
 *
 * amount and source are encrypted at rest (see lib/crypto.js).
 */
import db from "./index.js";
import { encrypt, decrypt, encryptAmount, decryptAmount } from "../lib/crypto.js";

const fromCents = (c) => (c / 100).toFixed(2);

const serialize = (row) => ({
  id:           row.id,
  amount:       fromCents(decryptAmount(row.amount)),
  source:       decrypt(row.source),
  date:         row.date,
  created_at:   row.created_at,
  account_id:   row.account_id,
  account_name: decrypt(row.account_name),
});

const SELECT_WITH_ACCOUNT = `
  SELECT i.*, a.name AS account_name
  FROM incomes i
  JOIN accounts a ON a.id = i.account_id
`;

export const createIncome = async ({ id, idempotency_key, account_id, amount, source, date }) => {
  await db.execute({
    sql: `
      INSERT INTO incomes (id, idempotency_key, account_id, amount, source, date)
      VALUES ($id, $idempotency_key, $account_id, $amount, $source, $date)
    `,
    args: {
      $id:              id,
      $idempotency_key: idempotency_key ?? null,
      $account_id:      account_id,
      $amount:          encryptAmount(Math.round(parseFloat(amount) * 100)),
      $source:          encrypt(source.trim()),
      $date:            date,
    },
  });

  return getIncomeById(id);
};

export const getIncomeByIdempotencyKey = async (key, userId) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_ACCOUNT} WHERE i.idempotency_key = $key AND a.user_id = $user_id`,
    args: { $key: key, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const getIncomeById = async (id) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_ACCOUNT} WHERE i.id = $id`,
    args: { $id: id },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const getIncomeByIdForUser = async (id, userId) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_ACCOUNT} WHERE i.id = $id AND a.user_id = $user_id`,
    args: { $id: id, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const updateIncome = async ({ id, account_id, amount, source, date }) => {
  await db.execute({
    sql: `
      UPDATE incomes
      SET account_id = $account_id, amount = $amount, source = $source, date = $date
      WHERE id = $id
    `,
    args: {
      $id:         id,
      $account_id: account_id,
      $amount:     encryptAmount(Math.round(parseFloat(amount) * 100)),
      $source:     encrypt(source.trim()),
      $date:       date,
    },
  });
  return getIncomeById(id);
};

export const deleteIncome = async (id, userId) => {
  const existing = await getIncomeByIdForUser(id, userId);
  if (!existing) return false;
  await db.execute({ sql: "DELETE FROM incomes WHERE id = $id", args: { $id: id } });
  return true;
};

export const listIncomes = async (userId, { account_id } = {}) => {
  let sql = `${SELECT_WITH_ACCOUNT} WHERE a.user_id = $user_id`;
  const args = { $user_id: userId };

  if (account_id) {
    sql += " AND i.account_id = $account_id";
    args.$account_id = account_id;
  }

  sql += " ORDER BY i.date DESC, i.created_at DESC";

  const { rows } = await db.execute({ sql, args });
  return rows.map(serialize);
};
