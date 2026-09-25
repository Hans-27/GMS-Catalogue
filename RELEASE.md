# GMS Catalogue Platform release runbook

## Release gate

Before every release, confirm all of the following:

- Frontend lint, unit tests, and production build pass.
- All backend smoke tests pass against an isolated test database.
- Database audit reports no missing migrations, invalid references, or missing media.
- Studio PDF export, public catalogue links, booklet navigation, permissions, and ERP price levels are manually checked.
- A restorable PostgreSQL backup and the persistent upload volumes are copied off-host.
- Production secrets and public HTTPS URLs are set; no demo credentials or localhost URLs remain.

## Production configuration

1. Install Docker Desktop (Windows) or Docker Engine with the Compose plugin (Linux).
2. Copy `.env.production.example` to `.env.production`.
3. Generate independent URL-safe, high-entropy values for `POSTGRES_PASSWORD` and `SECRET_KEY`:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

4. Replace `catalogue.example.com` with the real public HTTPS origin in both `PUBLIC_APP_URL` and `CORS_ORIGINS`.
5. Keep `NEXT_PUBLIC_API_URL=/api`. This routes API and upload requests through the same public origin.
6. Leave `APP_BIND_ADDRESS=127.0.0.1` when an HTTPS reverse proxy runs on the deployment host. Set it to `0.0.0.0` only for an intentionally LAN-exposed deployment.
7. Put the frontend behind an HTTPS reverse proxy. The backend and PostgreSQL are intentionally not published directly.
8. Keep `APP_ENV=production`, `COOKIE_SECURE=true`, `DEMO_MODE=false`, `SEED_DEMO_DATA=false`, and `AUTO_CREATE_TABLES=false`; the production Compose file enforces these values.

Validate the resolved configuration without starting services:

```powershell
.\scripts\deploy-production.ps1 -ValidateOnly
```

Deploy:

```powershell
.\scripts\deploy-production.ps1
```

The script validates secrets and origins, asks Docker Compose to validate the resolved configuration, builds and starts the services, and waits for both the frontend and `/api/health`. The backend applies Alembic migrations before serving traffic. Before announcing the release, log in with a non-demo administrator, create and preview a test catalogue, export its PDF, and open its public share link from outside the deployment network.

Recheck an already-running production deployment at any time:

```powershell
.\scripts\test-production-runtime.ps1 -FrontendUrl https://catalogue.your-domain.example
```

The runtime check reaches the API through the frontend's same-origin `/api` proxy, so no backend port needs to be exposed.

## Rollback

Keep the prior image tags and database/upload backups until the release is accepted. If rollback is required, stop application traffic, restore the matching database and upload snapshot together, deploy the prior images, then verify `/api/health` and a known catalogue.
