# Automatic Local-Network Catalogue Link Origin

Date: 2026-09-24

## Objective

Ensure every catalogue link displayed or copied by the platform uses the computer's current office/local-network address instead of a stale hard-coded IP address. Previously copied links are outside the scope of this change.

## Scope and Constraints

- Catalogue links are intended for devices on the same office/local network.
- Existing catalogue share tokens remain valid and are not regenerated.
- Catalogue link records require no database migration because the complete public URL is generated when an API response is returned.
- The backend remains the single owner of the catalogue public origin.
- The frontend continues using the same-origin `/api` proxy to reach the backend.
- Internet access, public DNS, tunnels, and externally hosted catalogue links are not included.

## Selected Approach

Detect the preferred LAN IPv4 address when the backend is started through the supported PowerShell scripts. Supply the resulting public origin and matching CORS origin to the backend process through runtime environment variables.

The preferred address is the IPv4 address assigned to an active network interface that has the active default IPv4 gateway. Loopback, link-local, disconnected, and tunnel-only addresses are excluded. When multiple candidates exist, select the route with the lowest combined route and interface metric.

## Startup Interfaces

### `run_api.ps1`

Add these optional parameters:

- `FrontendPort`, default `3000`.
- `PublicAppUrl`, optional explicit override.

When `PublicAppUrl` is not supplied, the script derives `http://<preferred-lan-ip>:<FrontendPort>`.

### `run_platform.ps1`

Add an optional `PublicAppUrl` parameter. When omitted, use the same LAN-address resolver and the existing `FrontendPort` value.

### Shared resolver

Place LAN-address selection in one reusable PowerShell helper under `scripts/` so both startup scripts use identical rules. The resolver returns either one preferred IPv4 address or no result; it does not edit configuration files.

## Runtime Configuration

Before starting Uvicorn, the startup script sets process-scoped values:

- `PUBLIC_APP_URL` to the resolved or explicitly supplied origin.
- `CORS_ORIGINS` to the existing configured origins plus the resolved local origin, with duplicates removed.

The scripts do not rewrite `backend/.env`. Explicit `PublicAppUrl` input has priority over automatic detection. Existing environment settings remain the fallback when automatic detection produces no usable address.

The Next.js frontend remains available on `0.0.0.0:<FrontendPort>`. Catalogue API requests continue through `/api`, which is proxied to the backend's loopback address.

## Catalogue Link Behavior

The backend's existing `_public_url` function continues constructing URLs from `settings.public_app_url` and the existing encrypted token. Once startup supplies the current LAN origin:

- Catalogue-management cards display the current LAN address.
- Copy-link actions copy the current LAN address.
- Customer-portal catalogue links use the current LAN address.
- Newly created, existing, regenerated, and reactivated share links all use the same current origin.
- No token values or link status fields change solely because the network address changed.

Administrators must restart the backend after moving to another network or receiving a different DHCP address. Following restart, the next share-link API response uses the newly detected address.

## Startup Output and Failure Handling

Successful startup prints:

- Detected LAN address.
- Catalogue public origin.
- Frontend URL.
- Backend health URL.

If automatic detection fails:

1. Use a valid configured `PUBLIC_APP_URL` when available.
2. Print a prominent warning that catalogue links may not be reachable by other devices.
3. Continue starting the application; link detection failure alone does not stop local development.

If an explicit `PublicAppUrl` is malformed or does not use HTTP or HTTPS, stop startup with an actionable validation error.

## Security

- Do not derive catalogue origins from untrusted HTTP `Host`, `Origin`, or forwarded headers.
- Do not expose the backend directly as the catalogue URL.
- Keep environment changes process-scoped.
- Preserve the existing share-token authorization, expiration, password, and revocation behavior.

## Testing

### PowerShell tests

- Select an address from the active default-route interface.
- Reject loopback, link-local, disconnected, and tunnel-only candidates.
- Resolve deterministic precedence when multiple interfaces exist.
- Respect an explicit `PublicAppUrl` override.
- Preserve configured CORS origins and add the resolved origin once.
- Fall back with a warning when no LAN address is available.
- Reject malformed explicit origins.

### Backend tests

- Existing share links retain their tokens when the public origin changes.
- Listing existing links uses the current runtime `PUBLIC_APP_URL`.
- Creating, regenerating, and reactivating links use the same current origin.
- Customer-portal catalogue URLs use the same origin.

### Connection verification

- Frontend login returns HTTP 200 through the detected LAN address.
- Backend health returns HTTP 200.
- Frontend `/api/health` proxy returns HTTP 200 through the detected LAN address.
- A displayed catalogue link contains the detected origin and opens from another device on the same network.

## Non-Goals

- Updating link text that was already copied, emailed, or messaged.
- Keeping old IP-based links reachable after the address changes.
- Configuring a static DHCP reservation, DNS record, public domain, VPN, or internet tunnel.
- Changing catalogue share tokens or customer pricing behavior.
