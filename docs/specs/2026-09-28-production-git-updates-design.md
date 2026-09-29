# Production Git Updates Design

Date: 2026-09-28
Status: Approved design

## Objective

Provide a simple, safe way for a SuperAdmin to check for and deploy production updates from the `main` branch of:

`https://github.com/jagrajpriceway/GMSCatalogueApp-HANS.git`

The workflow must never expose arbitrary Git, filesystem, PowerShell, or Docker execution through the web application. It must keep the production checkout separate from developers' working copies and support an automatic code rollback when a deployment fails its health checks.

## Authorization

- Only a user assigned the protected backend system role with `system_key=SUPERADMIN` can view or call Production Update operations.
- The backend enforces this role on every status, check, update, history, and rollback endpoint.
- Hiding the page in the frontend is only a usability measure and is not treated as authorization.
- The Windows update agent authenticates with a dedicated rotating service credential stored outside Git and outside the browser.
- Every check, approval, deployment, failure, and rollback produces an audit event containing the actor, requested commit, timestamps, and result.

## Recommended Architecture

### Production Updates settings page

Add `Settings -> Production Updates`, visible only to SuperAdmin users. It shows:

- current deployed commit, date, and message;
- latest available `hansapp/main` commit, date, and message;
- number and summary of available commits;
- agent availability and last heartbeat;
- deployment readiness and any blocking reason;
- active or most recent job with live progress;
- deployment history and the retained previous release;
- `Check for updates`, `Install update`, and controlled `Roll back` actions.

Installation requires a confirmation dialog that displays the exact commit and requires the user to type `UPDATE`. Rollback requires the user to type `ROLLBACK`.

### Backend control plane

The backend stores update state in the production database so status survives application restarts. It provides two narrowly scoped API groups:

1. SuperAdmin APIs for status, update checks, job creation, job history, and rollback requests.
2. Agent APIs for heartbeat, atomic job claiming, progress events, completion, and failure reporting.

The repository URL and branch are immutable server configuration. API payloads may identify only a commit already discovered from the configured remote. Users cannot supply repository URLs, branches, paths, command strings, or Docker arguments.

Only one check, deployment, or rollback job may execute at a time. Job claiming uses a database-backed lock and lease so two agents cannot run the same deployment.

### Windows host update agent

A small Windows process runs outside the Docker containers as a Scheduled Task or Windows service. It polls the backend over the local production origin, authenticates with its service credential, and executes fixed PowerShell commands with structured arguments.

The agent owns Git, release-directory, backup, Docker Compose, and health-check operations. The backend container is not given the host repository, Docker socket, or shell access.

Recommended production paths:

- repository mirror: `C:\GMSCatalogue\repository`
- immutable releases: `C:\GMSCatalogue\releases\<commit-sha>`
- external production environment: `C:\GMSCatalogue\config\.env.production`
- agent state and logs: `C:\GMSCatalogue\agent`

These paths are configurable only through host configuration. They are not editable from the web UI.

## Update Flow

### Check for updates

1. SuperAdmin selects `Check for updates`.
2. The backend creates a check job.
3. The agent fetches the configured repository without modifying an active release.
4. The agent compares the deployed commit with the fetched `hansapp/main` commit.
5. The agent rejects a latest commit that is not reachable from the configured remote branch.
6. The backend records and displays the exact candidate commit and commit summary.

### Install update

1. SuperAdmin confirms the displayed candidate by typing `UPDATE`.
2. The backend records the exact approved commit in a deployment job.
3. The agent obtains the deployment lease and verifies that the approved commit still exists on the configured remote branch.
4. The agent verifies disk space, Git availability, Docker availability, production environment configuration, current database health, and backup capability.
5. The agent creates and verifies a database backup and persistent application-data backup before stopping or rebuilding services.
6. The agent creates a clean release directory for the approved commit. It never deploys from the developer workspace and never runs against a dirty checkout.
7. The agent runs the production validation script against the external environment file.
8. The agent deploys with a fixed Docker Compose project name so persistent volumes and service identities remain stable across release directories.
9. The agent checks container health, database connectivity, `/api/health`, and `/login` for up to the configured timeout.
10. When checks pass, the job is marked successful, the release becomes current, and the immediately previous release is retained.

The page polls while the application is available. If the deployment temporarily restarts the application, the page shows a reconnecting state and resumes the job from its database identifier after the application returns.

## Rollback Behavior

- A failed health check automatically redeploys the previous application release with the same Docker Compose project and persistent volumes.
- Automatic rollback changes application code and container images only. It does not automatically restore the database because an unattended restore could destroy valid writes made during deployment.
- Production migrations must therefore be backward-compatible with the immediately previous release.
- The pre-deployment database and data backups are retained for controlled manual recovery.
- If the previous release also fails its health checks, the job is marked `manual_recovery_required`; the agent stops retrying and provides a sanitized recovery reference in the UI.
- A SuperAdmin may request a manual code rollback to the retained previous release through the same confirmation and audit workflow.

## Job Model and States

Each job records its immutable identifier, type, requested commit, requesting SuperAdmin, status, current step, sanitized message, timestamps, agent lease, previous commit, deployed commit, backup references, and audit correlation identifier.

Job types:

- `check`
- `deploy`
- `rollback`

Terminal and non-terminal states:

- `queued`
- `claimed`
- `validating`
- `backing_up`
- `building`
- `deploying`
- `health_checking`
- `rolling_back`
- `succeeded`
- `failed`
- `rolled_back`
- `manual_recovery_required`
- `cancelled`

Only queued jobs may be cancelled. Deployments cannot be cancelled after service replacement begins.

## Failure Handling

An operation is blocked with a clear, sanitized message when:

- the host agent has no recent heartbeat;
- another operation owns the deployment lease;
- GitHub or the configured remote cannot be reached;
- the requested commit is missing or no longer belongs to the configured branch;
- disk space is below the configured threshold;
- production configuration validation fails;
- Docker or Git is unavailable;
- the database is unhealthy;
- a required backup cannot be created and verified;
- a release directory cannot be created cleanly;
- build, migration, startup, or health checks fail.

Command output is written to host logs with secret redaction. The browser receives only step names, safe summaries, timestamps, and correlation identifiers.

## Operational Safeguards

- Use a separate production repository mirror and immutable release directories.
- Never run `git reset --hard`, clean, checkout, or merge in a developer workspace.
- Fetch only from the fixed HTTPS repository and deploy only a commit reachable from its `main` branch.
- Do not store GitHub credentials in the database or frontend. A public repository needs no credential; a future private repository uses Windows Credential Manager or an agent-owned secret store.
- Use fixed executable paths and argument arrays rather than interpolated shell commands.
- Use a fixed Docker Compose project name and the external production environment file.
- Keep at least the current and previous successful release; prune older releases only after their retention period.
- Rate-limit check and deployment requests and record denied attempts.

## Testing and Acceptance Criteria

### Backend

- Non-SuperAdmin users receive `403` from every Production Update endpoint.
- Unauthenticated users receive `401`.
- SuperAdmin can create a check or deployment job only when validation permits it.
- Arbitrary repository, branch, path, or command input is rejected or absent from schemas.
- Concurrent jobs cannot acquire the same deployment lease.
- Job state transitions reject invalid ordering.
- Agent authentication, lease expiry, retry, and audit events are covered.

### Windows agent and deployment scripts

- A check fetches without changing the active release.
- A successful deployment activates the approved commit and passes all health checks.
- A dirty developer workspace is never inspected or modified.
- Backup, build, startup, and health-check failures produce the expected safe state.
- A failed new release redeploys the previous release.
- A failed rollback produces `manual_recovery_required` without an infinite retry loop.
- Secrets are redacted from stored and returned output.

### Frontend

- The navigation item and page are invisible to every non-SuperAdmin role.
- Direct navigation by a non-SuperAdmin shows access denied and does not reveal update state.
- Confirmation requires the exact phrase and displays the immutable commit.
- Progress survives page reloads and temporary application restarts.
- Error, offline-agent, no-update, update-available, deploying, successful, rolled-back, and manual-recovery states are usable on desktop and mobile.

### Release acceptance

- The deployed commit equals the approved remote commit.
- Existing PostgreSQL and uploaded-media volumes remain attached.
- `/api/health` reports a connected production database.
- `/login` returns HTTP 200.
- The deployment and its actor appear in the audit log.
- No Docker socket, host repository, Git credential, environment secret, or command runner is exposed to the web container or browser.

## Out of Scope

- Editing the repository URL or branch from the UI.
- Running arbitrary Git commands.
- Automatically deploying every push without SuperAdmin approval.
- Automatically restoring the production database after a failed update.
- Updating the Windows agent itself through the same first version of this feature.
