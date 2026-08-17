# Jilora

Jilora is a multi-user productivity workspace built with React, TypeScript, Vite, Express, Socket.IO, PostgreSQL, and Recharts. PostgreSQL is the source of truth; Socket.IO only signals clients to refetch current state.

## Local Development

1. Copy `.env.example` to `.env` and set a strong `SESSION_SECRET`, database credentials, and local frontend origin.
2. Install dependencies:

```powershell
npm install
npm --prefix frontend install
```

3. Start PostgreSQL, then apply migrations:

```powershell
docker compose up -d postgres
npm run db:migrate
```

4. Run the persistent backend:

```powershell
npm start
```

For Vite hot reload, run `npm --prefix frontend run dev` in another terminal. The Vite proxy forwards `/api` and `/socket.io` to `VITE_DEV_BACKEND_URL` or `http://localhost:5000`.

## Production Architecture

Deploy the frontend and backend separately:

- Frontend: static Vite output from the `frontend` directory.
- Backend: the repository root as a persistent Node process. Socket.IO must run on the same HTTP server as Express.
- Database: managed PostgreSQL with automated backups.

The backend is not compatible with serverless-only hosting for Socket.IO. Use a long-lived Node service, container, VM, or platform web service.

### Backend Deployment

Root directory: repository root

Build command: `npm ci`

Release/migration command: `npm run db:migrate`

Start command: `npm start`

Required variables:

- `NODE_ENV=production`
- `PORT` (provided by the hosting platform when available)
- `DATABASE_URL`
- `SESSION_SECRET` (at least 32 random characters)
- `FRONTEND_URL` (the exact HTTPS frontend origin; comma-separated origins are supported)
- `DATABASE_SSL=true` when required by the PostgreSQL provider
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_SAME_SITE=lax` for same-site subdomains, or `none` for truly cross-site frontend/backend origins

Optional variables are documented in `.env.example`.

Health check: `GET /api/health` returns `{ "status": "ok" }` without exposing credentials or stack traces.

### Frontend Deployment

Root directory: `frontend`

Build command: `npm ci && npm run build`

Publish directory: `frontend/dist`

Required build variables:

- `VITE_API_URL=https://api.example.com`
- `VITE_SOCKET_URL=https://api.example.com`

Only `VITE_` variables are available to browser code. Never put `DATABASE_URL`, `SESSION_SECRET`, or private keys in frontend environment variables.

### CORS, Cookies, and Socket.IO

`FRONTEND_URL` controls both Express CORS and Socket.IO CORS. Wildcard origins are not allowed because authenticated cookies are used. The frontend sends credentials on REST and Socket.IO connections. Socket.IO authenticates through the same PostgreSQL-backed HTTP session cookie and never accepts a client-supplied user ID.

REST mutations commit to PostgreSQL first, then emit a targeted `state:changed` event to the authenticated user and server-derived partner/invitation recipients. The event contains no private application data. Clients refetch REST state after events and reconnections.

### Database Migrations

Run migrations as a release step before starting a new backend version:

```powershell
npm run db:migrate
```

Migration files are in `server/db/migrations`. Do not edit production tables manually or delete migration history.

## Verification

```powershell
npm run check
npm test
```

The backend integration suites use `TEST_DATABASE_URL`, which should point to a disposable test database. The local development database can be reset only with an explicit, verified local `DATABASE_URL`; the reset preserves schema and `schema_migrations`.
