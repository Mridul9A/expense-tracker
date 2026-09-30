import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import {
  createIncome,
  listIncomes,
  getIncomeByIdempotencyKey,
} from "../db/incomeModel.js";
import { getAccountById } from "../db/accountModel.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const createIncomeRules = [
  body("account_id").isString().trim().notEmpty().withMessage("account_id is required"),
  body("amount")
    .isFloat({ gt: 0 })
    .withMessage("amount must be a positive number")
    .custom((v) => {
      if (!/^\d+(\.\d{1,2})?$/.test(String(v))) {
        throw new Error("amount may have at most 2 decimal places");
      }
      return true;
    }),
  body("source")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("source is required")
    .isLength({ max: 200 }),
  body("date")
    .isISO8601()
    .withMessage("date must be a valid ISO 8601 date (YYYY-MM-DD)")
    .toDate(),
];

const listIncomesRules = [
  query("account_id").optional().isString().trim(),
];

router.post("/", createIncomeRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { account_id, amount, source, date } = req.body;

  if (!(await getAccountById(account_id))) {
    return res.status(422).json({ errors: [{ msg: "account_id does not exist" }] });
  }

  const idempotencyKey = req.headers["idempotency-key"] ?? null;

  if (idempotencyKey) {
    const existing = await getIncomeByIdempotencyKey(idempotencyKey);
    if (existing) return res.status(200).json(existing);
  }

  try {
    const income = await createIncome({
      id: uuidv4(),
      idempotency_key: idempotencyKey,
      account_id,
      amount,
      source,
      date: date instanceof Date ? date.toISOString().split("T")[0] : date,
    });

    return res.status(201).json(income);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT" && idempotencyKey) {
      const existing = await getIncomeByIdempotencyKey(idempotencyKey);
      if (existing) return res.status(200).json(existing);
    }
    throw err;
  }
}));

router.get("/", listIncomesRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { account_id } = req.query;
  const incomes = await listIncomes({ account_id });

  const totalCents = incomes.reduce(
    (sum, i) => sum + Math.round(parseFloat(i.amount) * 100),
    0
  );

  return res.json({
    data: incomes,
    meta: { count: incomes.length, total: (totalCents / 100).toFixed(2) },
  });
}));

export default router;
