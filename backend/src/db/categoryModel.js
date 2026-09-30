import db from "./index.js";
import { randomUUID } from "node:crypto";

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

const DEFAULT_CATEGORIES = [
  { name: "Family",      color: "#e86c4a" },
  { name: "Rent",        color: "#8b5cf6" },
  { name: "Self",        color: "#4a9ee8" },
  { name: "Stocks",      color: "#10b981" },
  { name: "Learning",    color: "#f59e0b" },
  { name: "Money Waste", color: "#ef4444" },
  { name: "Other",       color: "#6b7280" },
];

// Called once at signup so every new user starts with the standard category set,
// owned by them (so they can rename/delete without affecting anyone else).
export const seedDefaultCategoriesForUser = async (userId) => {
  for (const cat of DEFAULT_CATEGORIES) {
    await db.execute({
      sql: `
        INSERT INTO categories (id, user_id, name, color, is_default)
        VALUES ($id, $user_id, $name, $color, 1)
      `,
      args: { $id: randomUUID(), $user_id: userId, $name: cat.name, $color: cat.color },
    });
  }
};

export const listCategories = async (userId) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM categories WHERE user_id = $user_id ORDER BY is_default DESC, name ASC",
    args: { $user_id: userId },
  });
  return rows.map(serialize);
};

export const getCategoryById = async (id, userId) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM categories WHERE id = $id AND user_id = $user_id",
    args: { $id: id, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const getCategoryByName = async (name, userId) => {
  const { rows } = await db.execute({
    sql: "SELECT * FROM categories WHERE name = $name COLLATE NOCASE AND user_id = $user_id",
    args: { $name: name, $user_id: userId },
  });
  return rows[0] ? serialize(rows[0]) : null;
};

export const createCategory = async ({ id, userId, name, color }) => {
  const trimmed = name.trim();
  await db.execute({
    sql: `
      INSERT INTO categories (id, user_id, name, color, is_default)
      VALUES ($id, $user_id, $name, $color, 0)
    `,
    args: {
      $id:      id,
      $user_id: userId,
      $name:    trimmed,
      $color:   color?.trim() || colorForName(trimmed),
    },
  });

  return getCategoryById(id, userId);
};
