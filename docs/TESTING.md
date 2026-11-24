# Testing report

_Last run: 24 November 2026_

## How to reproduce

```bash
cd expense-tracker
npm install

# Terminal 1 — the API needs a database
npm run db:start            # or: docker compose up -d db

npm run db:migrate
npm run db:seed

# Automated integration suite (spins up its own throwaway PostgreSQL)
npm test

# End-to-end API smoke suite (needs the API running)
npm run dev                 # terminal 2
node scripts/smoke.mjs      # terminal 3
```

Environment used: Node.js 26.13.1, PostgreSQL 17 (embedded), Linux x86_64.

---

## 1. Automated integration tests — 17/17 passing

`server/tests/api.test.ts` runs against a **real PostgreSQL instance** started by `server/tests/setup.ts`. Prisma migrations are applied to a fresh database; there are no mocks, no in-memory repositories and no stubbed auth.

| # | Test | What it proves |
| --- | --- | --- |
| 1 | Health & public config | API boots, health and Google/AI flags expose correctly |
| 2 | Weak password rejection | Password policy returns field-level validation errors |
| 3 | Verification gate + session | Signup → login blocked (`email_not_verified`) → verify token → login issues JWT |
| 4 | Refresh rotation & logout | Cookie-based refresh works, logout revokes it, anonymous access is 401 |
| 5 | Password reset | Reset link is single-use, old password stops working, replay is rejected |
| 6 | Transaction CRUD + totals | Amounts validated, dashboard income/expense/balance correct, charts sized correctly |
| 7 | Cross-user privacy | Second user gets 404 on another user's transaction; their dashboard stays at zero |
| 8 | Edit & delete | Partial update persists, deletion returns 404 afterwards |
| 9 | Budget progress & alerts | 850 of 1,000 → 85%, warning status, 80% alert notification created, duplicates rejected |
| 10 | Goal contributions | 40% after first deposit, completed status + saved total at 100% |
| 11 | Recurring idempotency | Due schedule creates exactly one transaction; second run creates none |
| 12 | Analytics + exports | 12 monthly / 30 daily buckets, correct net, category ranking, CSV content, valid PDF |
| 13 | AI on user data | Chat reply names the user's real top category, rule fallback source, insight ownership |
| 14 | Settings validation | Currency/theme/prefs persist, invalid currency returns 400, JSON export works |
| 15 | Category protection | Custom category CRUD, duplicate conflict, system category cannot be renamed by a user |
| 16 | Admin authorization | Normal user 403 on admin routes, admin stats/system work, suspended user cannot log in |
| 17 | Account deletion | Password-gated delete removes user + cascades transactions, login no longer works |

Result:

```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  ~18s
```

---

## 2. End-to-end API smoke suite — 63/63 checks passing

`scripts/smoke.mjs` drives the running API exactly like the SPA does, including cookies:

- signup, dev verification link, login blocked until verified, verify, login, refresh, logout
- default category discovery, custom category creation
- income/expense creation, negative-amount rejection, category/type mismatch rejection
- edit, search, filters, pagination, filtered totals
- dashboard totals, 7-day and 6-month series, category pie, recent transactions
- budget creation, duplicate rejection, precise progress (1,500/2,000 = 75%), overall budget, generated alerts
- savings goal + contribution progress (25%), aggregated totals
- recurring creation, due processing, next-run calculation
- monthly analytics, CSV and PDF downloads (PDF ~3.5 KB)
- AI monthly summary and chat (rule engine), insight persistence
- notification read-all, settings persistence, profile update, password change + re-login, data export
- privacy: other user cannot read/delete a transaction; new user's dashboard is zero
- admin rejection for users, admin stats, user search, system monitoring, suspend → login blocked, reactivate
- account deletion and cascade

Result: `63/63 checks passed`.

---

## 3. Manual UI verification

Performed in the live preview against the demo dataset:

| Check | Result |
| --- | --- |
| Login page renders with brand panel, validation and Google placeholder hidden when unconfigured | Pass |
| Demo login → dashboard loads with real totals (₹1,33,030 balance, ₹97,000 income, ₹51,600 expenses) | Pass |
| Weekly area chart, category donut, income-vs-expense bars, budgets, goals and upcoming bills render | Pass |
| Dark mode toggle applies instantly and persists | Pass |
| "Add transaction" modal validates, creates a ₹750 expense, closes, toast shown, dashboard expenses update to ₹52,350 | Pass |
| No unexpected console errors after login (only the expected 401 from the anonymous session probe) | Pass |

Browser-level automated tests are intentionally not included; the checklist above was executed once manually. Responsive behaviour was implemented with mobile card layouts and a drawer, but was not screenshot-tested at every breakpoint.

---

## 4. What is not covered

- Google sign-in is implemented with `google-auth-library` + Google Identity Services but was **not** end-to-end tested because no OAuth client credentials exist in this environment. It returns a clear 400 when unconfigured.
- SMTP delivery was **not** tested against a real mail server. The console fallback was tested; template rendering is shared and simple.
- The external AI provider path was **not** exercised (no API key). The rule-based fallback is tested and is the default.
- Concurrent load, rate-limit thresholds beyond normal use, and backup/restore procedures were not load-tested.
- Visual checks were done at desktop width; no formal accessibility audit (e.g. axe) was run.

---

## 5. Verified quality properties

- All financial figures in the UI originate from PostgreSQL aggregates; no hard-coded totals.
- Money is stored as `DECIMAL(14,2)` and rounded at the boundary.
- Date-based reports use UTC calendar days, so a transaction never shifts between days.
- Budget spending counts expenses only, inside the budget's own window, optionally per category.
- Recurring processing is idempotent thanks to `nextRunDate` advancement.
- Every protected query is scoped by `userId`; admin-only routes are enforced server-side.
- Account deletion cascades to every owned table.
