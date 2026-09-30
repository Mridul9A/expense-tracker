import db from "./index.js";

// Never include password_hash in anything returned to the client.
const serialize = (row) => ({
  id:         row.id,
  email:      row.email,
  created_at: row.created_at,
});

export const createUser = async ({ id, email, password_hash }) => {
  await db.execute({
    sql: `INSERT INTO users (id, email, password_hash) VALUES ($id, $email, $password_hash)`,
    args: { $id: id, $email: email.trim().toLowerCase(), $password_hash: password_hash },
  });
  return getUserById(id);
};

export const getUserByEmail = async (email) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM users WHERE email = $email",
    args: { $email: email.trim().toLowerCase() },
  });
  return rows[0] ?? null; // includes password_hash — for login verification only
};

export const getUserById = async (id) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM users WHERE id = $id",
    args: { $id: id },
  });
  return rows[0] ? serialize(rows[0]) : null;
};
