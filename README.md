# Expense Tracker

**Track Smart. Spend Wise. Save More.**

A complete, production-ready personal finance dashboard: React + TypeScript on the front, Express + Prisma + PostgreSQL behind it, with JWT authentication, budgets, savings goals, recurring transactions, analytics exports, an AI money coach and an admin console.

> Premium finance dashboard with light and dark themes, live PostgreSQL data, budgets, goals, recurring bills, analytics exports and an AI money coach.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Demo account](#demo-account)
- [Environment variables](#environment-variables)
- [Optional integrations](#optional-integrations)
- [Scripts](#scripts)
- [API overview](#api-overview)
- [Database schema](#database-schema)
- [Security model](#security-model)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design system](#design-system)

---

## Features

### Authentication
- Email + password signup and login with bcrypt hashing (12 rounds) and strong-password rules.
- Email verification with single-use, expiring tokens; verification is required before login.
- Forgot / reset password with 60-minute single-use links; all sessions revoked after reset.
- JWT access tokens (15 min) plus rotating, hashed refresh tokens in an `HttpOnly`, `SameSite=Lax` cookie.
- Google sign-in (rendered only when `GOOGLE_CLIENT_ID` is configured).
- Profile management, password change, sign out of all devices, account deletion, personal-data export.

### Dashboard
- Total balance, monthly income, monthly expenses and savings this month.
- Weekly spending area chart, monthly expense chart, income-vs-expense bars and a category donut — all from real transactions.
- Recent transactions, budget overview, savings-goal progress, upcoming bills, unread alert count.
- Month switcher for historical views and a guided empty state for new accounts.

### Transactions
- Add, edit and delete income/expenses with amount, description, category, date, notes and payment method (Cash, UPI, Card, Bank).
- Full-text search, type/category/method/date filters, sorting and pagination.
- Live filtered totals (income, expenses, net).
- Category management: create, recolour, re-icon and delete private categories; default categories are read-only for users.

### Budgets
- Monthly and weekly budgets, overall or per category.
- Progress, remaining amount, health status (on track / close / exceeded) and days left.
- Budget alerts at 80% and 100% (in-app notification + email when SMTP is configured).

### Savings goals
- Create goals with target amount, target date, colour and description.
- Add or remove contributions; progress, remaining amount and day count update automatically.
- Completion notification and status transition when the target is reached.

### Recurring transactions
- Daily, weekly, monthly and yearly schedules with custom intervals and end dates.
- Scheduler materialises due occurrences as real transactions exactly once (idempotent) and advances next dates.
- Bill reminders before the due date; pause/resume, run now, and manual "process due" action.

### Analytics
- Daily (30 days), weekly (12 weeks), monthly (12 months) and yearly (5 years) reports.
- Income/expense trend, category breakdown, payment-method split, weekday spending, largest expenses and period-over-period comparison.
- Server-generated **CSV** and **PDF** exports.

### AI assistant
- Generates monthly summaries, spending analysis and budget advice.
- Answers natural-language questions such as "Where did I spend the most this month?".
- Uses **only** the authenticated user's data, builds a compact context server-side, and falls back to a deterministic rule engine when no AI key is configured.
- Every generated insight is stored per user and can be deleted.

### Notifications
- Budget alerts, bill reminders, savings milestones, monthly summaries and system messages.
- Unread count, filtering, mark-one/mark-all read and delete.

### Settings
- Currency (9 common currencies), number locale, week start, theme (light/dark/system) and four notification preferences.
- Category manager, data export, account/security shortcuts, integration status.

### Admin dashboard
- Platform totals (users, active users, new signups, transactions, volume, goals, insights).
- Signup and activity charts, platform-wide top categories, newest accounts.
- User management: search, filter, promote/demote, suspend/reactivate, delete (with cascades) — with self-protection and last-admin protection.
- Shared default category management.
- System monitoring: database latency/status, uptime, Node runtime, memory and integration states.

### Experience
- Responsive from 360px to ultrawide: drawer navigation, collapsible tables/cards, touch-friendly targets.
- Light and dark themes with persisted preference, premium deep-purple/lavender palette, Sora + Plus Jakarta Sans typography.
- Loading, error, empty and success states everywhere; accessible labels, focus rings and keyboard-dismissible dialogs.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, Recharts, React Router 6, Lucide icons |
| Backend | Node.js, Express 4, TypeScript, Zod validation |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 (schema, migrations, seed) |
| Auth | JWT access tokens + rotating refresh tokens, bcrypt, Google Identity Services |
| Email | Nodemailer (SMTP) with console fallback for development |
| AI | Any OpenAI-compatible chat-completions API + rule-based fallback |
| Exports | PDFKit (PDF), streaming CSV |
| Tests | Vitest + Supertest against a real embedded PostgreSQL |

---

## Project structure

```
expense-tracker/
├── client/                 # React + TypeScript single-page app
│   ├── src/components/     # UI kit, layout, charts, modals
│   ├── src/context/        # Auth, theme, toasts
│   ├── src/pages/          # 16 pages (auth, app, admin)
│   └── src/lib/            # API client, formatting, types
├── server/                 # Express API
│   ├── prisma/             # schema, migrations, seed, demo data
│   ├── src/routes/         # 13 route modules
│   ├── src/services/       # budgets, alerts, analytics, AI, exports
│   ├── src/middleware/     # auth, validation, error handling
│   └── tests/              # integration tests against real Postgres
├── scripts/                # local database bootstrap, API smoke test
├── docs/                   # testing + deployment guides, screenshots
├── docker-compose.yml      # PostgreSQL (+ optional app profile)
└── Dockerfile              # single-image production build
```

---

## Quick start

### Prerequisites
- Node.js **20+** (developed on Node 26)
- PostgreSQL **14+** — either Docker, a managed database, or the bundled zero-root local option below

### 1. Install

```bash
git clone https://github.com/Samruddhi66/expense-tracker.git
cd expense-tracker
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Set at least `DATABASE_URL` and both JWT secrets (`openssl rand -hex 48`). Everything else is optional.

### 3. Start PostgreSQL

**Option A — Docker (recommended):**
```bash
docker compose up -d db
```

**Option B — no Docker, no root:** the repo ships an embedded PostgreSQL runner used for development:
```bash
npm run db:start     # first run creates .env + the database, keep this running
```

**Option C — your own server:** point `DATABASE_URL` at it.

### 4. Migrate and seed

```bash
npm run db:migrate   # applies prisma/migrations
npm run db:seed      # default categories + admin account
npm run db:demo      # optional: demo user with 3 months of sample data
```

### 5. Run

```bash
npm run dev
```

- App: <http://localhost:3000> (Vite, proxies `/api` to the API)
- API: <http://localhost:4000/api/health>

For a production-style single-server run:

```bash
npm run build
NODE_ENV=production npm start     # Express serves the built SPA + API on :4000
```

---

## Demo account

After `npm run db:demo`:

| Field | Value |
| --- | --- |
| Email | `demo@expense-tracker.app` |
| Password | `Demo@12345` |

It contains ~100 realistic transactions across three months, five budgets, two savings goals, three recurring schedules and generated alerts. Re-running the demo command replaces only that account.

The seeded administrator comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults: `admin@expense-tracker.app` / `Admin@12345` — **change these before deploying**).

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` / `production` / `test` |
| `PORT` | no | API port (default `4000`) |
| `CLIENT_URL` | yes | Public SPA origin, used in email links and CORS |
| `CORS_ORIGINS` | no | Extra comma-separated allowed origins |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | yes (prod) | Access-token signing secret |
| `JWT_REFRESH_SECRET` | yes (prod) | Refresh-token secret material |
| `ACCESS_TOKEN_TTL` | no | e.g. `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | no | Refresh lifetime (default `30`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | no | Bootstrap admin created by the seed |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | no | Real email delivery (also enables alert emails) |
| `GOOGLE_CLIENT_ID` | no | Enables Google sign-in |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | no | Enables the external AI model |
| `SCHEDULER_INTERVAL_MINUTES` | no | Recurring/reminder job interval (default `15`) |

> Without SMTP, verification/reset links are printed to the server log and — in development only — returned to the UI so the flows stay fully testable. Passwords, API keys and `.env` files are never committed.

---

## Optional integrations

### Email (SMTP)
Set the `SMTP_*` variables (Gmail app password, Resend/SES SMTP, Mailgun, etc.) and restart. Verification, reset and budget-alert emails are sent automatically. Nothing in the browser changes.

### Google login
1. Create an OAuth 2.0 **Web** client in Google Cloud Console.
2. Add `http://localhost:3000` (and your production origin) as an authorised JavaScript origin.
3. Set `GOOGLE_CLIENT_ID` on the server and restart.
   The login page shows the official Google button only when this is configured.

### AI assistant
Set `AI_API_KEY`, optionally `AI_BASE_URL` (any OpenAI-compatible endpoint) and `AI_MODEL`. The assistant sends a compact JSON context of the signed-in user's own finances; it never receives another user's data. If the provider fails or no key is set, the rule engine answers instantly from the same data. Insight source (`ai` or `rules`) is shown in the UI.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch) + Vite dev server together |
| `npm run build` | Prisma generate, server compile, client production build |
| `npm start` | Run the compiled server (serves the SPA) |
| `npm run db:start` / `db:stop` | Local embedded PostgreSQL (no root required) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:deploy` | `prisma migrate deploy` (production) |
| `npm run db:seed` | Default categories + admin + settings backfill |
| `npm run db:demo` | Demo user with realistic three-month history |
| `npm run test` | 17 database-backed integration tests |
| `node scripts/smoke.mjs` | 63-check end-to-end API smoke test against a running server |
| `npm run db:studio` | Prisma Studio |

---

## API overview

All endpoints are under `/api`. Protected routes require `Authorization: Bearer <accessToken>`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/google`, `GET /auth/me` |
| Users | `GET/PATCH /users/me`, `POST /users/me/change-password`, `DELETE /users/me`, `GET /users/me/export`, `GET/PATCH /users/me/settings` |
| Categories | `GET/POST /categories`, `PATCH/DELETE /categories/:id` |
| Transactions | `GET/POST /transactions`, `GET/PATCH/DELETE /transactions/:id` |
| Dashboard | `GET /dashboard?month=YYYY-MM` |
| Budgets | `GET/POST /budgets`, `PATCH/DELETE /budgets/:id` |
| Goals | `GET/POST /goals`, `GET/PATCH/DELETE /goals/:id`, `POST/DELETE /goals/:id/contributions[/:contributionId]` |
| Recurring | `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`, `POST /recurring/process`, `POST /recurring/:id/run` |
| Analytics | `GET /analytics?period=daily|weekly|monthly|yearly&date=`, `GET /analytics/export?format=csv|pdf` |
| AI | `GET /ai/status`, `GET/POST /ai/insights`, `DELETE /ai/insights/:id`, `POST /ai/chat` |
| Notifications | `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `DELETE /notifications/:id` |
| Admin | `GET /admin/stats`, `GET /admin/users`, `PATCH/DELETE /admin/users/:id`, `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/:id`, `GET /admin/system` |
| Public | `GET /health`, `GET /config` |

---

## Database schema

Eleven core tables plus `email_tokens`, all with UUID primary keys, foreign keys, `ON DELETE CASCADE` where ownership implies it, indexes and unique constraints:

`users`, `transactions`, `categories`, `budgets`, `savings_goals`, `goal_contributions`, `recurring_transactions`, `notifications`, `user_settings`, `refresh_tokens`, `ai_insights`, `email_tokens`.

Highlights:
- Money is stored as `DECIMAL(14,2)` and converted at the API boundary.
- Transaction dates are `DATE` columns handled in UTC to avoid timezone drift.
- Indexes on `(user_id, date)`, `(user_id, type)`, `(user_id, is_read, created_at)`, `(user_id, status)` and recurring due dates.
- Unique budget per `(user, category, period, start_date)`; unique category per `(user, name, type)`; unique user email, Google id and token hashes.

See [`server/prisma/schema.prisma`](server/prisma/schema.prisma) and [`server/prisma/migrations`](server/prisma/migrations).

---

## Security model

- Passwords hashed with bcrypt (12 rounds); strength validated server-side.
- Access JWT embedded in `Authorization` header; refresh token is random, stored only as SHA-256 hash, rotated on every use and revocable.
- Refresh cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, scoped to `/api/auth`.
- Every financial query is filtered by the authenticated `userId`; the API never accepts a user id from the client for data access.
- Zod validation on every mutating endpoint; consistent JSON error envelope with field-level details.
- Helmet security headers, strict CORS allow-list, global + auth-specific rate limits.
- Admin routes require `role === 'ADMIN'`; last-admin and self-modification protections prevent lockout.
- Email/reset tokens are single-use, hashed at rest and expire.
- No secrets reach the browser; AI context is built server-side per user.

---

## Testing

See [`docs/TESTING.md`](docs/TESTING.md) for the full report. Summary:

- **17 integration tests** (Vitest + Supertest) against a **real embedded PostgreSQL** with migrations applied: auth flows, verification gating, refresh rotation, password reset, CRUD, cross-user isolation, budget math and alerts, goal completion, recurring idempotency, analytics totals, CSV/PDF exports, AI answers, settings validation, category protection, admin authorization, cascade deletion.
- **63-check API smoke suite** (`scripts/smoke.mjs`) covering every module including admin suspension and account deletion.
- **Manual UI verification** of login, dashboard rendering in light and dark mode, and adding a transaction end-to-end (dashboard totals recalculated live).

```bash
npm test                          # integration tests
node scripts/smoke.mjs            # with the API running
```

---

## Deployment

Full step-by-step options (Docker, Render, Railway, Fly.io, VPS) are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

**Docker, fastest path:**
```bash
docker compose --profile app up -d --build
```
This starts PostgreSQL and the app on port 4000, applying migrations on boot. Then create the first admin:
```bash
docker compose exec app sh -c "cd server && npx tsx prisma/seed.ts"
```

**Any Node host:**
1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set `NODE_ENV=production`, `CLIENT_URL`, and both JWT secrets.
3. Build: `npm ci && npm run build`.
4. Release: `cd server && npx prisma migrate deploy`.
5. Start: `node server/dist/index.js` (or `npm start`).
6. Seed once: `cd server && npx tsx prisma/seed.ts` — then change the admin password.
7. Put HTTPS in front of the app so the `Secure` refresh cookie is sent.

The Express server serves the built SPA itself, so no separate frontend host is required and cookies stay first-party.

---

## Design system

- **Palette:** deep purple (`brand-700 #6B21C4`), lavender washes, white cards, cool grey surfaces, plus emerald/amber/rose semantic colours.
- **Type:** Sora for display headings, Plus Jakarta Sans for UI.
- **Surfaces:** 1.125–1.5rem radii, soft multi-layer shadows, 1px hairline borders, subtle radial background glow.
- **Charts:** Recharts with theme-aware axes, custom tooltips, gradient area fills and rounded bars.
- **Dark mode:** class-based Tailwind theme, persisted per user in settings and per device in `localStorage`.
- **Accessibility:** semantic landmarks, labelled inputs and icon buttons, visible focus rings, `aria-pressed` toggles, keyboard-escapable modals, reduced-motion-friendly transitions.

---

Built as a complete full-stack application — no mock data in the product paths, no placeholder screens. Every figure comes from PostgreSQL.
