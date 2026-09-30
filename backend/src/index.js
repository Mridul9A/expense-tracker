import express from "express";
import cors from "cors";
import expensesRouter from "./routes/expenses.js";
import accountsRouter from "./routes/accounts.js";
import categoriesRouter from "./routes/categories.js";
import incomesRouter from "./routes/incomes.js";
import authRouter from "./routes/auth.js";
import { requireAuth } from "./lib/authMiddleware.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

// Render (and most PaaS hosts) sit behind a reverse proxy — without this,
// every request appears to come from the proxy's internal IP, which breaks
// both per-IP rate limiting and req.ip generally.
app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || "*",
  exposedHeaders: ["Idempotency-Key"],
}));

app.use(express.json());

// Request logger (lightweight, no dependency needed)
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method}  ${req.url}`);
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/auth", authRouter);

// Everything below requires a valid session — every account/category/expense/income
// belongs to exactly one user.
app.use("/expenses", requireAuth, expensesRouter);
app.use("/accounts", requireAuth, accountsRouter);
app.use("/categories", requireAuth, categoriesRouter);
app.use("/incomes", requireAuth, incomesRouter);

// ── Global error handler ──────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────

// Only self-start when run directly (`node src/index.js`), not when imported —
// tests import this module and bind their own listener to a different port.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  app.listen(PORT, () => {
    console.log(`Expense Tracker API listening on http://localhost:${PORT}`);
  });
}

export default app; // for testing
