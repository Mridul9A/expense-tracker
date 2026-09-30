/**
 * Named params use the $ prefix in both SQL and the args object, e.g.
 *   SQL: "WHERE id = $id"   args: { $id: value }
 *
 * Money stored as integer cents — zero floating-point drift.
 */
import db from "./index.js";

const toCents  = (v) => Math.round(parseFloat(v) * 100);
const fromCents = (c) => (c / 100).toFixed(2);

const serialize = (row) => ({
  id:             row.id,
  amount:         fromCents(row.amount),
  description:    row.description,
  date:           row.date,
  created_at:     row.created_at,
  account_id:     row.account_id,
  account_name:   row.account_name,
  category_id:    row.category_id,
  category_name:  row.category_name,
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
      $amount:          toCents(amount),
      $description:     description.trim(),
      $date:            date,
    },
  });

  return getExpenseById(id);
};

export const getExpenseByIdempotencyKey = async (key) => {
  const { rows } = await db.execute({
    sql: `${SELECT_WITH_JOINS} WHERE e.idempotency_key = $key`,
    args: { $key: key },
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

export const listExpenses = async ({ account_id, category_id } = {}) => {
  let sql = SELECT_WITH_JOINS;
  const args = {};
  const clauses = [];

  if (account_id) {
    clauses.push("e.account_id = $account_id");
    args.$account_id = account_id;
  }
  if (category_id) {
    clauses.push("e.category_id = $category_id");
    args.$category_id = category_id;
  }
  if (clauses.length) sql += " WHERE " + clauses.join(" AND ");

  sql += " ORDER BY e.date DESC, e.created_at DESC";

  const { rows } = await db.execute({ sql, args });
  return rows.map(serialize);
};
