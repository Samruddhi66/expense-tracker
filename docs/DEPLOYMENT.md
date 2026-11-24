# Deployment guide

The Express server serves both the API and the compiled React SPA, so a single instance is all you need. PostgreSQL is the only external dependency (plus optional SMTP/Google/AI).

---

## 0. Production checklist

- [ ] PostgreSQL 14+ provisioned, connection string ready (`?schema=public&sslmode=require` for managed providers)
- [ ] `NODE_ENV=production`
- [ ] `CLIENT_URL` = your public HTTPS origin (e.g. `https://money.example.com`)
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` = long random values (`openssl rand -hex 48`)
- [ ] `ADMIN_EMAIL` / `ADMIN_PASSWORD` set to private values **before** the first seed
- [ ] HTTPS termination in front of the app (required for the `Secure` refresh cookie)
- [ ] `.env` never committed; secrets stored in the platform's secret manager
- [ ] Migrations applied with `prisma migrate deploy`
- [ ] Optional: SMTP, `GOOGLE_CLIENT_ID`, AI settings

---

## 1. Docker (recommended, any VPS)

The repository ships a multi-stage `Dockerfile` and a `docker-compose.yml` with PostgreSQL and an app profile.

```bash
git clone https://github.com/Samruddhi66/expense-tracker.git
cd expense-tracker
cp .env.example .env
# edit .env: DATABASE_URL=postgresql://postgres:postgres@db:5432/expense_tracker?schema=public
#            NODE_ENV=production, CLIENT_URL=https://your-domain, strong JWT secrets

docker compose --profile app up -d --build
docker compose exec app sh -c "cd server && npx tsx prisma/seed.ts"
```

The app listens on `http://localhost:4000`; put Nginx/Caddy/Cloudflare in front for TLS.
The container applies `prisma migrate deploy` on startup.

> If you change `ADMIN_PASSWORD` later, run the seed again — it updates the admin password idempotently.

---

## 2. Render

1. **New → PostgreSQL** (copy the internal connection string).
2. **New → Web Service** from the repo.
3. Build command:
   ```bash
   npm ci && npm run build
   ```
4. Start command:
   ```bash
   cd server && npx prisma migrate deploy && node dist/index.js
   ```
5. Environment: `NODE_ENV=production`, `DATABASE_URL`, `CLIENT_URL` (Render URL or custom domain), both JWT secrets, admin credentials.
6. After the first deploy, open a shell and run `cd server && npx tsx prisma/seed.ts`.

---

## 3. Railway

1. Create a **PostgreSQL** plugin.
2. Create a service from the repo; Railway detects Node.
3. Build: `npm ci && npm run build`
4. Start: `cd server && npx prisma migrate deploy && node dist/index.js`
5. Add the same environment variables. Railway injects `DATABASE_URL` automatically.
6. Run the seed once from the service shell.

---

## 4. Fly.io

```bash
fly launch --no-deploy
fly postgres create --name expense-tracker-db
fly postgres attach expense-tracker-db
fly secrets set NODE_ENV=production CLIENT_URL=https://your-app.fly.dev \
  JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... \
  ADMIN_EMAIL=... ADMIN_PASSWORD=...
fly deploy
fly ssh console -C "sh -c 'cd /app/server && npx tsx prisma/seed.ts'"
```

`fly.toml` needs `internal_port = 4000` and a health check on `/api/health`.

---

## 5. Plain VPS (systemd + Nginx)

```bash
# app
cd /var/www/expense-tracker
npm ci
npm run build
cd server && npx prisma migrate deploy && npx tsx prisma/seed.ts

# service: /etc/systemd/system/expense-tracker.service
[Unit]
Description=Expense Tracker
After=network.target

[Service]
WorkingDirectory=/var/www/expense-tracker
EnvironmentFile=/var/www/expense-tracker/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

Nginx reverse proxy:

```nginx
server {
  listen 443 ssl http2;
  server_name money.example.com;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `app.set('trust proxy', 1)` is already enabled, so rate limiting and cookies see the real client/protocol.

---

## 6. Database operations

```bash
# apply migrations (safe, non-destructive)
cd server && npx prisma migrate deploy

# create a new migration during development
npx prisma migrate dev --name describe_change

# back up
pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%F).dump

# restore
pg_restore -d "$DATABASE_URL" --clean backup-2026-11-24.dump
```

Migrations are plain SQL in `server/prisma/migrations` and should be versioned with the code.

---

## 7. Scaling notes

- The HTTP API is stateless (JWT + database refresh tokens), so multiple instances behind a load balancer work.
- The in-process scheduler (recurring transactions, reminders, summaries) runs per instance. With more than one instance, either:
  - run the scheduler in exactly one instance (`SCHEDULER_INTERVAL_MINUTES` and a dedicated worker), or
  - accept that idempotent processing makes duplicate runs harmless (they are: `nextRunDate` advances atomically per schedule). Reminder/budget notifications are also de-duplicated by their JSON payload.
- For high traffic, add a Redis-backed rate limiter and Prisma connection pooling (PgBouncer or the provider's pooler).

---

## 8. Optional services

**SMTP (email):** any provider works — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Use an app password for Gmail. Restart after changing.

**Google login:** create an OAuth Web client, add your origins (`https://your-domain` and `http://localhost:3000`), set `GOOGLE_CLIENT_ID`. No client secret is used by the browser flow.

**AI:** set `AI_API_KEY`, `AI_BASE_URL` (must expose `POST /chat/completions`) and `AI_MODEL`. Keep the key server-side only. Without it the assistant uses the rule engine.

---

## 9. Security hardening

- Rotate JWT secrets on a schedule; rotating invalidates access tokens immediately (refresh tokens are hashed data, not signed with the secret).
- Set `CLIENT_URL` exactly to the public origin — CORS in production rejects unknown origins when `NODE_ENV=production`.
- Keep `NODE_ENV=production` so cookies are `Secure` and internal error details are hidden.
- Restrict database network access to the app.
- Change the seeded admin password immediately (Profile → Change password).
- Review notification/email content before enabling SMTP to real users.
