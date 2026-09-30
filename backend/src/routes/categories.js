import { Router } from "express";
import { body, validationResult } from "express-validator";
import { v4 as uuidv4 } from "uuid";
import { createCategory, listCategories, getCategoryByName } from "../db/categoryModel.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const createCategoryRules = [
  body("name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("name is required")
    .isLength({ max: 50 }),
  body("color")
    .optional({ checkFalsy: true })
    .isString()
    .trim()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage("color must be a hex code like #4a9ee8"),
];

router.post("/", createCategoryRules, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { name, color } = req.body;

  if (await getCategoryByName(name)) {
    return res.status(422).json({ errors: [{ msg: `Category "${name}" already exists` }] });
  }

  const category = await createCategory({ id: uuidv4(), name, color });
  return res.status(201).json(category);
}));

router.get("/", asyncHandler(async (_req, res) => {
  return res.json({ data: await listCategories() });
}));

export default router;
