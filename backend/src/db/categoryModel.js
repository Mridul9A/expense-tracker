import db from "./index.js";

// Deterministic-ish fallback palette for custom categories that don't specify a color.
const PALETTE = [
  "#e86c4a", "#8b5cf6", "#4a9ee8", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#06b6d4",
  "#84cc16", "#a855f7",
];

const colorForName = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
};

const serialize = (row) => ({
  id:         row.id,
  name:       row.name,
  color:      row.color,
  is_default: !!row.is_default,
  created_at: row.created_at,
});

export const listCategories = async () => {
  const { rows } = await db.execute(
    "SELECT * FROM categories ORDER BY is_default DESC, name ASC"
  );
  return rows.map(serialize);
};

export const getCategoryById = async (id) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM categories WHERE id = $id",
    args: { $id: id },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const getCategoryByName = async (name) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM categories WHERE name = $name COLLATE NOCASE",
    args: { $name: name },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const createCategory = async ({ id, name, color }) => {
  const trimmed = name.trim();
  await db.execute({
    sql: `
      INSERT INTO categories (id, name, color, is_default)
      VALUES ($id, $name, $color, 0)
    `,
    args: {
      $id:    id,
      $name:  trimmed,
      $color: color?.trim() || colorForName(trimmed),
    },
  });

  return getCategoryById(id);
};
