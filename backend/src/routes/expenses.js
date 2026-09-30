import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import {
  createExpense,
  listExpenses,
  getExpenseByIdempotencyKey,
} from "../db/expenseModel.js";
import { getAccountById } from "../db/accountModel.js";
import { getCategoryById } from "../db/categoryModel.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// ── Validation rules ──────────────────────────────────────────────────────────

const createExpenseRules = [
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("amount must be a positive number")
    .custom((v) => {
      // Reject amounts with more than 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(String(v))) {
        throw new Error("amount may have at most 2 decimal places");
      }
      return true;
    }),
  body("account_id").isString().trim().notEmpty().withMessage("account_id is required"),
  body("category_id").isString().trim().notEmpty().withMessage("category_id is required"),
  body("description")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("description is required")
    .isLength({ max: 500 }),
  body("date")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date (YYYY-MM-DD)")
    .toDate(),
];

const listExpensesRules = [
  query("account_id").optional().isString().trim(),
  query("category_id").optional().isString().trim(),
  query("sort").optional().isIn(["date_desc"]).withMessage("sort must be 'date_desc'"),
];

// ── POST /expenses ────────────────────────────────────────────────────────────

router.post("/", createExpenseRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { amount, account_id, category_id, description, date } = req.body;

  if (!(await getAccountById(account_id))) {
    return res.status(422).json({ errors: [{ msg: "account_id does not exist" }] });
  }
  if (!(await getCategoryById(category_id))) {
    return res.status(422).json({ errors: [{ msg: "category_id does not exist" }] });
  }

  // Idempotency: clients may send Idempotency-Key header (UUID).
  // If we've already processed this key, return the original response (201).
  // This makes retries safe — clicking submit twice or refreshing after a slow POST
  // will never create duplicate records.
  const idempotencyKey = req.headers["idempotency-key"] ?? null;

  if (idempotencyKey) {
    const existing = await getExpenseByIdempotencyKey(idempotencyKey);
    if (existing) {
      // Return 200 (not 201) to signal "already processed" while remaining safe
      return res.status(200).json(existing);
    }
  }

  try {
    const expense = await createExpense({
      id: uuidv4(),
      idempotency_key: idempotencyKey,
      amount,
      account_id,
      category_id,
      description,
      date: date instanceof Date ? date.toISOString().split("T")[0] : date,
    });

    return res.status(201).json(expense);
  } catch (err) {
    // UNIQUE constraint on idempotency_key — race condition between two concurrent
    // identical requests. Fetch and return the winner's record.
    if (err.code === "SQLITE_CONSTRAINT" && idempotencyKey) {
      const existing = await getExpenseByIdempotencyKey(idempotencyKey);
      if (existing) return res.status(200).json(existing);
    }
    throw err; // re-throw for the global error handler
  }
}));

// ── GET /expenses ─────────────────────────────────────────────────────────────

router.get("/", listExpensesRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { account_id, category_id } = req.query;
  const expenses = await listExpenses({ account_id, category_id });

  // Compute total in integer cents to avoid float arithmetic
  const totalCents = expenses.reduce(
    (sum, e) => sum + Math.round(parseFloat(e.amount) * 100),
    0
  );

  return res.json({
    data: expenses,
    meta: {
      count: expenses.length,
      total: (totalCents / 100).toFixed(2),
    },
  });
}));

export default router;
