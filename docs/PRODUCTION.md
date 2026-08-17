# Production Operations

## Release Checklist

1. Provision managed PostgreSQL and configure `DATABASE_URL`.
2. Set a random `SESSION_SECRET` with at least 32 characters.
3. Set `NODE_ENV=production`, `FRONTEND_URL`, `SESSION_COOKIE_SECURE=true`, and the appropriate `SESSION_COOKIE_SAME_SITE`.
4. Run `npm ci` in the backend root and `npm run db:migrate` as the release step.
5. Start the persistent backend with `npm start`.
6. Build and publish `frontend/dist` from the `frontend` directory with `VITE_API_URL` and `VITE_SOCKET_URL` set to the backend origin.
7. Check `GET /api/health` and verify a browser can log in and establish Socket.IO.

## Required Separation

The backend must run as a long-lived Node HTTP service. Socket.IO is attached to the same server as Express and must not be deployed as a serverless function. The frontend may be hosted as static assets on a separate platform.

## Security

- `FRONTEND_URL` is an allowlist, not a wildcard.
- REST and Socket.IO use HTTP-only authenticated session cookies.
- Socket rooms are keyed by the authenticated server-side user ID.
- Socket payloads contain only a scope and timestamp; PostgreSQL-backed REST responses contain the data after authorization and sharing checks.
- Do not log passwords, cookies, session IDs, or secrets.
- Use provider-managed PostgreSQL TLS and backups in production.

## Observability and Capacity

Monitor HTTP status rates, Socket.IO connection errors, request latency, Node memory/CPU, PostgreSQL pool usage, and migration failures. Load-test a staging database with login, dashboard, partner, planner, study, workout, homework, job, and analytics workflows before increasing traffic. Keep each instance's pool size within the provider's connection budget.
