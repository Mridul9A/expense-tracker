import { Router } from "express";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail, getUserById } from "../db/userModel.js";
import { seedDefaultCategoriesForUser } from "../db/categoryModel.js";
import { signToken } from "../lib/jwt.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { requireAuth } from "../lib/authMiddleware.js";
import { loginLimiter, signupLimiter } from "../lib/rateLimit.js";

const router = Router();

const SALT_ROUNDS = 10;

const signupRules = [
  body("email").isEmail().withMessage("Enter a valid email"),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
];

const loginRules = [
  body("email").isEmail().withMessage("Enter a valid email"),
  body("password").notEmpty().withMessage("Password is required"),
];

router.post("/signup", signupLimiter, signupRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  if (await getUserByEmail(email)) {
    return res.status(422).json({ errors: [{ msg: "An account with this email already exists" }] });
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser({ id: uuidv4(), email, password_hash });
  await seedDefaultCategoriesForUser(user.id);

  const token = signToken(user.id);
  return res.status(201).json({ token, user });
}));

router.post("/login", loginLimiter, loginRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  const row = await getUserByEmail(email);
  if (!row) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(row.id);
  const user = await getUserById(row.id);
  return res.json({ token, user });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  return res.json({ user: req.user });
}));

export default router;
