# Automatic Local Catalogue Links Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every catalogue URL returned by the locally started platform use the computer's current office LAN IPv4 address and frontend port.

**Architecture:** A shared PowerShell helper selects the usable IPv4 address attached to the active physical default route, resolves an explicit override or safe fallback, and merges that origin into CORS configuration. Both supported backend launch paths apply the resolved values as process-scoped environment variables before importing FastAPI settings; the existing backend URL builders then continue generating every management, customer-portal, promotion, and rendering URL from `settings.public_app_url`.

**Tech Stack:** Windows PowerShell 5.1, Python 3/FastAPI/Pydantic Settings, Next.js runtime proxy, repository smoke scripts.

## Global Constraints

- Catalogue access is limited to devices on the same office/local network.
- Preserve all existing share tokens and database rows; do not run a migration or regenerate links.
- Do not rewrite `backend/.env`; runtime overrides must remain process-scoped.
- Prefer an explicit `-PublicAppUrl` argument. Otherwise select the active non-tunnel IPv4 default route by lowest combined route and interface metric.
- Reject loopback, link-local, disconnected, skip-as-source, unusable, and tunnel-only candidates.
- Preserve configured CORS origins and add the selected catalogue origin once.
- Keep frontend API calls on the existing same-origin `/api` proxy to `127.0.0.1:8001`.
- Never derive a public origin from HTTP request headers.
- If detection fails, keep a valid configured `PUBLIC_APP_URL`; if none is usable, use the local-only frontend origin and print a prominent warning.
- Backend restart is required after the LAN address changes; an already-running process cannot receive new environment variables.
- Preserve unrelated modified and untracked files in the dirty worktree. Do not commit without explicit user approval.

---

### Task 1: Reusable, deterministic LAN-origin resolver

**Files:**
- Create: `scripts/catalogue-network.ps1`
- Create: `scripts/test-catalogue-network.ps1`

**Interfaces:**
- Consumes: Windows `Get-NetRoute`, `Get-NetIPInterface`, and `Get-NetIPAddress` IPv4 records; optional explicit origin; frontend port; `backend/.env` path.
- Produces: `Test-CatalogueLanIPv4Address`, `Select-CatalogueLanIPv4Address`, `Get-CatalogueLanIPv4Address`, `ConvertTo-CatalogueOrigin`, and `Resolve-CatalogueNetworkRuntime`, whose result exposes `LanAddress`, `PublicAppUrl`, `CorsOrigins`, `Source`, and `Warning`.

- [ ] **Step 1: Add the focused failing test**

  Add a standalone PowerShell test that dot-sources the proposed helper and asserts:

  - Candidate selection chooses `10.185.179.43` over higher-metric physical candidates.
  - A route whose next hop is `0.0.0.0` is excluded as tunnel/on-link-only.
  - Loopback, `169.254.0.0/16`, disconnected, non-preferred, and skip-as-source candidates are rejected.
  - Equal metrics resolve deterministically by interface index and then numeric IPv4 address.
  - `http://10.10.5.8:3100/` normalizes to `http://10.10.5.8:3100`.
  - Explicit HTTPS origins are accepted; FTP, relative, credential-bearing, query/fragment, and non-root-path values throw.
  - An explicit origin wins over detection.
  - Automatic detection builds `http://<address>:<FrontendPort>`.
  - Detection failure uses a valid environment or `.env` fallback with a warning.
  - Detection failure with no valid configured origin uses `http://127.0.0.1:<FrontendPort>` with a warning.
  - Existing CORS entries are preserved, trimmed, and de-duplicated case-insensitively before the selected origin is appended.

- [ ] **Step 2: Verify the relevant failure**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-catalogue-network.ps1`

  Expected: the test stops because `scripts/catalogue-network.ps1` and its functions do not yet exist.

- [ ] **Step 3: Implement the minimum behavior**

  Implement the five interfaces in `scripts/catalogue-network.ps1` without mutating machine configuration:

  1. Convert each Windows route/interface/address tuple into a simple candidate containing address, interface index, route metric, interface metric, connection/address state, next hop, and skip-as-source status.
  2. Accept only IPv4 unicast values with a non-zero default gateway, connected/preferred state, and `SkipAsSource = false`; reject `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0`, multicast, and tunnel aliases (`loopback`, `tunnel`, `teredo`, `isatap`, `6to4`).
  3. Sort usable candidates by `RouteMetric + InterfaceMetric`, interface index, and the address bytes interpreted as an unsigned numeric key.
  4. Normalize valid HTTP/HTTPS origins to scheme plus authority, allowing only an empty or `/` path and forbidding credentials, query, or fragment.
  5. Resolve origin precedence as explicit argument, detected LAN address, configured process/`.env` value, then local-only fallback. Merge CORS from the process or `.env` and append the resolved origin exactly once.

- [ ] **Step 4: Verify the focused pass**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-catalogue-network.ps1`

  Expected: output ends with `catalogue_network_tests=passed` and exits with code 0.

- [ ] **Step 5: Run the affected integration check**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ". .\scripts\catalogue-network.ps1; Resolve-CatalogueNetworkRuntime -FrontendPort 3000 -EnvironmentFile .\backend\.env | Format-List"`

  Expected on the current office connection: `LanAddress` is a usable address on the active physical default-route interface, `PublicAppUrl` is `http://<that-address>:3000`, and `CorsOrigins` contains that origin once.

- [ ] **Step 6: Record the passing deliverable without committing**

  Record the focused and integration command outputs in the implementation handoff. Leave the worktree uncommitted because unrelated user changes are present and no commit was requested.

---

### Task 2: Apply the runtime origin in both supported launchers

**Files:**
- Modify: `run_api.ps1:2`
- Modify: `run_platform.ps1:2`
- Modify: `scripts/test-local-network-configuration.ps1:1`

**Interfaces:**
- Consumes: `Resolve-CatalogueNetworkRuntime -FrontendPort <int> -PublicAppUrl <string> -EnvironmentFile <path>` from `scripts/catalogue-network.ps1`.
- Produces: optional launcher parameters `-FrontendPort` and `-PublicAppUrl` on `run_api.ps1`, optional `-PublicAppUrl` on `run_platform.ps1`, plus process-scoped `PUBLIC_APP_URL` and `CORS_ORIGINS` inherited by Uvicorn.

- [ ] **Step 1: Add the focused failing test**

  Replace the stale hard-coded-IP assertions in `scripts/test-local-network-configuration.ps1` with AST/text assertions that:

  - `run_api.ps1` defaults `FrontendPort` to `3000` and exposes optional `PublicAppUrl` without a static default.
  - `run_platform.ps1` exposes optional `PublicAppUrl` and retains `FrontendPort = 3000` and `ApiHost = 0.0.0.0`.
  - Both launchers dot-source `scripts/catalogue-network.ps1`, call `Resolve-CatalogueNetworkRuntime`, and assign its `PublicAppUrl` and `CorsOrigins` to process environment variables before Uvicorn starts.
  - The repository launcher files contain none of the retired addresses `172.16.1.94` or `retiree-bobble-emerald.ngrok-free.dev`.

- [ ] **Step 2: Verify the relevant failure**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-network-configuration.ps1`

  Expected: assertions fail because the launchers do not yet import or apply the resolver.

- [ ] **Step 3: Implement the minimum behavior**

  In both launchers, resolve network configuration before checking or starting the API, then set:

  ```powershell
  $env:PUBLIC_APP_URL = $networkRuntime.PublicAppUrl
  $env:CORS_ORIGINS = $networkRuntime.CorsOrigins
  ```

  `run_api.ps1` gains `FrontendPort = 3000` and optional `PublicAppUrl`. `run_platform.ps1` gains optional `PublicAppUrl` and reuses its existing `FrontendPort` parameter. Print the detected LAN address (when present), selected catalogue origin, loopback backend health URL, and LAN frontend URL. When the API port is already occupied/responding, explain that its environment cannot be changed in place and that it must be stopped and relaunched after an IP change; do not terminate an unknown process automatically.

  Preserve the current Uvicorn binding behavior, dependency checks, reload mode, frontend proxy target, and browser-opening behavior. Do not edit `backend/.env`.

- [ ] **Step 4: Verify the focused pass**

  Run: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-network-configuration.ps1`

  Expected: output reports the dynamically resolved catalogue origin and exits with code 0.

- [ ] **Step 5: Run the affected integration check**

  Run:

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run_api.ps1 -Port 18001 -ListenAddress 127.0.0.1 -FrontendPort 3000 -PublicAppUrl http://10.10.5.8:3000 -NoReload
  ```

  Expected in a controlled short-lived process: startup output shows `http://10.10.5.8:3000`, and the child API receives matching `PUBLIC_APP_URL` and CORS values. Stop the temporary process with Ctrl+C after its health endpoint returns 200; do not disturb ports 8001 or 3000.

- [ ] **Step 6: Record the passing deliverable without committing**

  Record the launcher test and temporary-process result in the implementation handoff. Leave the files uncommitted pending explicit approval.

---

### Task 3: Prove stable tokens use the current origin and update operating guidance

**Files:**
- Create: `backend/tests/test_catalogue_public_url_origin.py`
- Modify: `CATALOGUE_SHARE_LINKS.md:23`
- Modify: `PLATFORM_OPERATIONS.md:118`
- Modify: `docs/current-state.md:52`
- Modify: `frontend/next.config.ts:11`

**Interfaces:**
- Consumes: `app.catalogue_share_links._public_url`, encrypted catalogue token data, and runtime `settings.public_app_url`.
- Produces: a focused regression test proving origin changes do not change tokens; operating instructions for automatic and explicit LAN origins; a Next.js development-origin list with no stale machine-specific address.

- [ ] **Step 1: Add the focused regression test**

  Create a standard-library `unittest` module that builds one encrypted dummy share token, calls `_public_url` with `settings.public_app_url = "http://10.10.5.8:3000"`, changes the setting to `http://10.10.5.9:3000/`, and asserts:

  - Both URLs use the active setting at call time.
  - Both URLs end in the identical recovered token.
  - No database mutation or HTTP request is needed.
  - The original global setting is restored in `finally`/test teardown.

- [ ] **Step 2: Verify the regression baseline**

  Run from `backend`: `.\.venv\Scripts\python.exe -m unittest tests.test_catalogue_public_url_origin`

  Expected: the focused test passes against the existing `_public_url` implementation, documenting that launcher configuration—not token storage—is the required integration seam.

- [ ] **Step 3: Update operations guidance and remove stale development origin**

  Document:

  - Standard automatic commands: `run_api.ps1` and `run_platform.ps1` detect the active LAN address.
  - Explicit override syntax: `-PublicAppUrl http://<office-ip>:3000`.
  - Separate frontend start remains `npm.cmd run dev` from `frontend`; the API must be launched first with the correct runtime origin.
  - Restart the backend when DHCP/network address changes.
  - Previously copied old-IP links are not rewritten, while the platform displays/copies the current origin after restart.

  Remove the stale fixed LAN address from `frontend/next.config.ts` while retaining the loopback development origins and existing `/api` and `/uploads` rewrites. Do not add a wildcard or trust request headers.

- [ ] **Step 4: Verify focused and configuration checks**

  Run:

  ```powershell
  Set-Location backend
  .\.venv\Scripts\python.exe -m unittest tests.test_catalogue_public_url_origin
  Set-Location ..
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-catalogue-network.ps1
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-local-network-configuration.ps1
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-port-3000-configuration.ps1
  ```

  Expected: all commands exit 0; the URL-origin test reports one passing test, and all PowerShell scripts report their success markers.

- [ ] **Step 5: Run repository and live-network verification**

  Run:

  ```powershell
  git diff --check -- run_api.ps1 run_platform.ps1 scripts/catalogue-network.ps1 scripts/test-catalogue-network.ps1 scripts/test-local-network-configuration.ps1 backend/tests/test_catalogue_public_url_origin.py frontend/next.config.ts CATALOGUE_SHARE_LINKS.md PLATFORM_OPERATIONS.md docs/current-state.md
  rg -n "172\.16\.1\.94|retiree-bobble-emerald\.ngrok-free\.dev" run_api.ps1 run_platform.ps1 frontend/next.config.ts CATALOGUE_SHARE_LINKS.md PLATFORM_OPERATIONS.md docs/current-state.md
  ```

  Expected: `git diff --check` is clean and the stale-origin scan returns no matches. After restarting the normal backend and frontend with the supported launchers, verify `http://<detected-ip>:3000/login`, `http://127.0.0.1:8001/api/health`, and `http://<detected-ip>:3000/api/health` return HTTP 200, then confirm an authenticated share-link response starts with `http://<detected-ip>:3000/c/`.

- [ ] **Step 6: Record the passing deliverable without committing**

  Summarize the detected origin, commands run, expected restart requirement, and any environmental limitation on verifying from a second physical device. Leave all repository changes uncommitted.

## Unresolved Product Decisions

None. The approved specification fixes origin precedence, failure behavior, LAN-only scope, token preservation, and restart semantics.
