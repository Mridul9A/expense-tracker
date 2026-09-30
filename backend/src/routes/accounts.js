import { Router } from "express";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { createAccount, listAccounts, deleteAccount } from "../db/accountModel.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const createAccountRules = [
  body("name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 100 }),
  body("bank_name")
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .isLength({ max: 100 }),
  body("initial_balance")
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage("initial_balance must be zero or a positive number")
    .custom((v) => {
      if (!/^\d+(\.\d{1,2})?$/.test(String(v))) {
        throw new Error("initial_balance may have at most 2 decimal places");
      }
      return true;
    }),
];

router.post("/", createAccountRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { name, bank_name, initial_balance } = req.body;
  const account = await createAccount({ id: uuidv4(), userId: req.userId, name, bank_name, initial_balance });
  return res.status(201).json(account);
}));

router.get("/", asyncHandler(async (req, res) => {
  return res.json({ data: await listAccounts(req.userId) });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const deleted = await deleteAccount(req.params.id, req.userId);
  if (!deleted) {
    return res.status(404).json({ error: "Account not found" });
  }
  return res.status(204).send();
}));

export default router;
