/**
 * Expenses don't carry their own user_id — ownership is derived through the
 * account they belong to, so every query joins accounts and filters on
 * a.user_id. This avoids a second source of truth for who owns what.
 *
 * amount and description are encrypted at rest (see lib/crypto.js). Filtering
 * by account_id/category_id still works in SQL since those are unencrypted IDs.
 */
import db from "./index.js";
import { encrypt, decrypt, encryptAmount, decryptAmount } from "../lib/crypto.js";

const fromCents = (c) => (c / 100).toFixed(2);

const serialize = (row) => ({
  id:             row.id,
  amount:         fromCents(decryptAmount(row.amount)),
  description:    decrypt(row.description),
  date:           row.date,
  created_at:     row.created_at,
  account_id:     row.account_id,
  account_name:   decrypt(row.account_name),
  category_id:    row.category_id,
  category_name:  decrypt(row.category_name),
  category_color: row.category_color,
});

const SELECT_WITH_JOINS = `
  SELECT e.*,
         a.name  AS account_name,
         c.name  AS category_name,
         c.color AS category_color
  FROM expenses e
  JOIN accounts   a ON a.id = e.account_id
  JOIN categories c ON c.id = e.category_id
`;

export const createExpense = async ({ id, idempotency_key, account_id, category_id, amount, description, date }) => {
  await db.execute({
    sql: `
      INSERT INTO expenses (id, idempotency_key, account_id, category_id, amount, description, date)
      VALUES ($id, $idempotency_key, $account_id, $category_id, $amount, $description, $date)
    `,
    args: {
      $id:              id,
      $idempotency_key: idempotency_key ?? null,
      $account_id:      account_id,
      $category_id:     category_id,
      $amount:          encryptAmount(Math.round(parseFloat(amount) * 100)),
      $description:     encrypt(description.trim()),
      $date:            date,
    },
  });

  return getExpenseById(id);
};

export const getExpenseByIdempotencyKey = async (key, userId) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_JOINS} WHERE e.idempotency_key = $key AND a.user_id = $user_id`,
    args: { $key: key, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const getExpenseById = async (id) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_JOINS} WHERE e.id = $id`,
    args: { $id: id },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const listExpenses = async (userId, { account_id, category_id } = {}) => {
  let sql = `${SELECT_WITH_JOINS} WHERE a.user_id = $user_id`;
  const args = { $user_id: userId };

  if (account_id) {
    sql += " AND e.account_id = $account_id";
    args.$account_id = account_id;
  }
  if (category_id) {
    sql += " AND e.category_id = $category_id";
    args.$category_id = category_id;
  }

  sql += " ORDER BY e.date DESC, e.created_at DESC";

  const { rows } = await db.execute({ sql, args });
  return rows.map(serialize);
};
