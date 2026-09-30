# Ledger — Expense Tracker

A minimal full-stack expense tracking application.

**Live demo:** _deploy to Render (backend) + Vercel (frontend) — see [Deployment](#deployment)_

---

## Quick Start

```bash
# Install dependencies
npm run install:all   # from project root

# Run backend (port 3001)
npm run dev:backend

# Run frontend (port 5173)
npm run dev:frontend

# Run tests
npm test
```

Then open http://localhost:5173.

---

## Architecture

```
expense-tracker/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express app & server entry
│   │   ├── routes/expenses.js    # POST /expenses, GET /expenses
│   │   ├── db/
│   │   │   ├── index.js          # SQLite connection + schema migrations
│   │   │   └── expenseModel.js   # Data access layer (create, list, find)
│   │   └── __tests__/
│   │       └── expenses.test.js  # Integration tests (Node built-in runner)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── ExpenseForm.jsx       # Add expense form
│   │   │   ├── ExpenseList.jsx       # Table with filter/sort controls
│   │   │   └── CategorySummary.jsx   # Breakdown bar chart
│   │   ├── hooks/
│   │   │   └── useExpenses.js        # All data fetching & state
│   │   └── lib/
│   │       └── api.js                # Fetch wrapper + idempotency key mgmt
│   └── package.json
└── README.md
```

---

## Key Design Decisions

### 1. Persistence: SQLite via `node:sqlite` (built-in, no compilation)

SQLite is a great fit here:
- Zero-setup, single-file database — no external service to run
- `node:sqlite` ships **built into Node 22.5+** — no `node-gyp`, no native compilation, works on every platform including Apple Silicon and Node 25
- WAL mode enabled for better concurrent reads
- Trivial to swap for PostgreSQL later (the model layer is isolated)

> Requires **Node 22.5 or later**. On Node 22.x the `--experimental-sqlite` flag is needed (already set in the npm scripts). On Node 23+ it is stable and the flag is a harmless no-op.

**Why not `better-sqlite3`?** It requires native compilation. As of Node 25 / Apple Silicon, prebuilt binaries don't exist and the C++ source fails to compile against Node 25 headers. `node:sqlite` is the zero-dependency replacement.

**Trade-off vs. in-memory/JSON:** A bit more setup, but data survives restarts. For a tool you'd "extend and maintain over time," this is worth the tiny overhead.

### 2. Money: Integer Cents

Amounts are stored as `INTEGER` cents (e.g. `$12.34` → `1234`).

This avoids all IEEE 754 floating-point representation errors. The conversion between dollars and cents happens only at the API boundary (model layer), not inside any business logic. Totals are computed in cents and divided by 100 at the very end.

**Why not `NUMERIC`/`DECIMAL`?** SQLite's NUMERIC affinity can silently coerce to float. Explicit integer cents is unambiguous and portable.

### 3. Idempotency: Safe Retries

The real-world requirement is: clicking submit twice, or refreshing after a slow POST, must not create duplicate records.

**Backend:** `POST /expenses` accepts an optional `Idempotency-Key` header (UUID). The key is stored in a `UNIQUE` column. If the same key is received again, the original record is returned (HTTP 200). A UNIQUE constraint race condition (two concurrent identical requests) is caught and resolved by returning the winning record.

**Frontend:** A pending idempotency key is stored in `sessionStorage` before the request is sent. It's only cleared on success (or a clean validation rejection). If the user refreshes mid-flight, the same key is reused on the next attempt — preventing a duplicate even across page loads.

### 4. Frontend: No Global State Library

The app is small enough that a single `useExpenses` hook owns all data fetching and state. Adding Redux/Zustand/React Query would be premature. The hook exposes a clean interface that components consume without needing to know about fetch internals.

If the app grew (multiple pages, optimistic updates, caching), React Query would be the natural next step.

### 5. Stale-Response Prevention

The `useExpenses` hook uses a monotonic `fetchId` ref. When filters change quickly, only the response matching the most recent request is applied. Earlier in-flight responses are silently discarded.

---

## API Reference

### `POST /expenses`

**Headers:**
- `Idempotency-Key: <uuid>` _(optional but recommended)_

**Body:**
```json
{
  "amount": "12.50",
  "category": "Food",
  "description": "Lunch with team",
  "date": "2024-03-15"
}
```

**Responses:**
- `201 Created` — new expense created
- `200 OK` — idempotent replay (key already seen)
- `422 Unprocessable Entity` — validation errors

---

### `GET /expenses`

**Query params:**
- `category=Food` — filter by category
- `sort=date_desc` — sort newest first (default)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "amount": "12.50",
      "category": "Food",
      "description": "Lunch with team",
      "date": "2024-03-15",
      "created_at": "2024-03-15T10:30:00Z"
    }
  ],
  "meta": {
    "count": 1,
    "total": "12.50",
    "categories": ["Food", "Transport"]
  }
}
```

The `meta.total` reflects the **filtered** list, not all records. Totals are computed in integer cents server-side.

---

## Validation Rules

| Field | Rules |
|---|---|
| `amount` | Required, positive, at most 2 decimal places |
| `category` | Required, non-empty string, max 100 chars |
| `description` | Required, non-empty string, max 500 chars |
| `date` | Required, valid ISO 8601 date |

Validation runs both client-side (immediate feedback) and server-side (authoritative). The client-side checks mirror the server rules exactly.

---

## Trade-offs Made for the Timebox

- **No authentication.** The assignment scope is a personal tool; adding auth would dwarf the feature work.
- **No expense editing or deletion.** Out of scope per acceptance criteria; the data model supports it trivially (add `DELETE /expenses/:id`).
- **No database migrations library.** Schema is created with `CREATE TABLE IF NOT EXISTS`. For a real production app, `drizzle-orm` or a migration tool would manage schema evolution.
- **No pagination.** For a personal tool with hundreds of expenses this is fine. For thousands, `LIMIT`/`OFFSET` or cursor pagination should be added to `GET /expenses`.
- **Single sort option.** The API is designed to accept `sort` as a parameter; adding `amount_desc`, `category_asc`, etc. is additive and non-breaking.
- **Frontend not deployed.** The live demo link requires a hosting environment. The app is fully functional locally.

## Intentionally Not Done

- No Docker/docker-compose (adds setup complexity for no functional gain at this scale)
- No ESLint/Prettier config (would add noise to the submission; assumed present in real project)
- No environment-based DB path per test (tests use `:memory:` via env var; a test fixture helper would be cleaner in a larger suite)

---

## Deployment

The backend uses [@libsql/client](https://github.com/tursodatabase/libsql-client-ts), which runs against
an embedded local SQLite file in dev and a hosted [Turso](https://turso.tech) database in production — same
query code, no rewrite needed. This matters because Render's free tier has an *ephemeral filesystem*: a local
SQLite file would be wiped on every deploy/restart, so production data needs to live in Turso instead.

### 1. Create a Turso database (free)

```bash
# Install the CLI (macOS/Linux)
curl -sSfL https://get.tur.so/install.sh | bash

turso auth signup   # or `turso auth login` if you already have an account
turso db create expense-tracker
turso db show expense-tracker --url          # → TURSO_DATABASE_URL
turso db tokens create expense-tracker       # → TURSO_AUTH_TOKEN
```

Keep both values — you'll paste them into Render's environment variables.

### 2. Push this repo to GitHub

Render and Vercel both deploy from a connected git repository.

```bash
git add -A
git commit -m "Initial commit"
gh repo create expense-tracker --private --source=. --remote=origin --push
# or create the repo on github.com and:
#   git remote add origin <your-repo-url>
#   git push -u origin main
```

### 3. Deploy the backend to Render

1. On [render.com](https://render.com), **New → Blueprint**, pick this repo. Render reads `render.yaml`
   at the repo root automatically (build: `npm install`, start: `npm start`, root dir: `backend/`).
2. In the service's **Environment** tab, set:
   - `TURSO_DATABASE_URL` — from step 1
   - `TURSO_AUTH_TOKEN` — from step 1
   - `JWT_SECRET` — any long random string (used to sign login sessions — generate one with
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). If deployed via the
     Blueprint, Render generates this automatically.
   - `FRONTEND_ORIGIN` — leave blank for now, you'll fill this in after step 4
3. Deploy. Once live, copy the service URL (e.g. `https://expense-tracker-api.onrender.com`) and confirm
   `https://<that-url>/health` returns `{"status":"ok"}`.

Free-tier services spin down after 15 minutes of inactivity and take ~30s to wake on the next request —
expected for a personal project, not a bug.

### 4. Deploy the frontend to Vercel

1. On [vercel.com](https://vercel.com), **New Project**, pick this repo, set **Root Directory** to `frontend`.
   Vercel auto-detects Vite (`vercel.json` pins the build command/output dir explicitly).
2. Set the environment variable `VITE_API_URL` to your Render backend URL from step 3.
3. Deploy. Copy the resulting Vercel URL.

### 5. Close the loop

Back in Render, set `FRONTEND_ORIGIN` to your Vercel URL (e.g. `https://your-app.vercel.app`) and redeploy
the backend — this restricts CORS to your actual frontend instead of `*`.

## Running Tests

```bash
cd backend && npm test
```

Uses Node's built-in `node:test` runner — no test framework to install. Tests cover:
- Creating valid expenses (201)
- Validation rejections (422) for bad amount, missing category, invalid date
- Idempotency: duplicate key returns original record (200)
- GET filtering by category
- GET sort order
- Total calculation for filtered results
