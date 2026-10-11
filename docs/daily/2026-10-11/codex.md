# Octoworkers boilerplate upgrade

## Before-change impact analysis

Scope: Dinobilli/octoworkers reusable template, independent of any deployed application.
- Unify admin authentication/authorization, verify Access JWTs, introduce revocable sessions and explicit owner bootstrap. Existing sessions will require login again.
- Protect role changes and the last active owner at both API and database levels.
- Add opt-in Kakao member identity and Groble checkout/webhook/order modules. Members never inherit admin roles. No live seller products or provider applications are created.
- Repair template packaging and configuration replacement; use argument arrays for subprocesses. Generate local secrets only, never copy source checkout secrets.
- Complete isolated staging config, validate deploy configuration, and test SQLite migrations, auth boundaries, webhook replays/order, and packaged CLI output.
- Retain existing example modules behind feature settings. Synchronize setup documentation and both agent instruction files.

Implementation and validation results are recorded below when complete.

## Implemented

- Unified verified Access/session admin identity with active DB roles; opaque hashed sessions, OAuth one-use states, origin checks, atomic D1 rate limiting, cron cleanup, last-owner and role mutation protections.
- Explicit owner bootstrap command. No implicit first visitor or email-based member-to-admin conversion.
- Kakao customer module, account UI, Groble product administration, server-created checkout references, verified webhook fact ledger and order access policy for one-time/subscription flows.
- CLI now packages a clean template; basic/full feature presets; distinct scope/domain/email replacement; refused overwrites; new local secrets. No shell-interpolated provisioning or implicit deployment.
- Isolated staging config and deployment validation/concurrency; setup/upgrade guides; root and nested AGENTS/CLAUDE synchronized.
- Updated runtime/build dependencies including Wrangler 4.149, Agents 0.28, Hono 4.13 and DOMPurify 3.4.16. Security overrides for MCP SDK/client and AI provider-utils; Node 22.18 LTS or >=24.11 required by updated tooling.
- Fixed admin asset base so the console works at `/admin/` on a workers.dev/shared host.

## Validation

- `pnpm check`: passes across worker/admin/landing.
- `pnpm test`: 57 Worker tests + 2 CLI package/scaffold tests pass. Includes real SQLite migrations, access token validation, owner/role protections, revoked sessions, Kakao state replay, webhook signature/staleness/replay/conflicting keys, out-of-order refund, amount/product mismatch, round refund vs subscription termination.
- `pnpm build`: landing/admin production bundles pass.
- All 11 migrations applied successfully to Wrangler local D1; explicit first-owner bootstrap succeeded.
- Built and unpacked CLI tarball outside repository; generated basic/full projects with distinct custom package scope and domain.
- Separate generated full project: offline frozen install, type checks, frontend build, staging Worker dry-run pass (includes AI and OpsAgent bindings).
- Updated Agents SDK: actual local Durable Object task creation 201, snapshot 200, authenticated login/logout 200.
- In-app browser: real local admin login, product link save, and member account/product rendering verified. Local sample uses fixture identities/products only.
- `pnpm audit --prod`: 0 known vulnerabilities after patches (initial upstream lockfile reported 69). This is a dependency audit, not a guarantee of absence of vulnerabilities.
- `git diff --check`: clean.
- Sandbox-only local-port/cache restrictions resolved with local verification permissions and a temporary SWC cache; no remote D1 changes or application deployment.

## Post-change impact / remaining integration

Existing installations must migrate D1 and log in again. Retain existing Durable Object migration history when upgrading an already-deployed service; new template defaults omit optional bindings. Product prices are fixed in the reference policy; discounts and partial refunds require business-specific rules documented in the guide. External Kakao login and real Groble charge/refund require each new project's app keys, approved product, and webhook secret and were not exercised against live provider accounts. No ebook delivery or arbitrary paid-content endpoint is implied by an order's status; protected resources must enforce the server policy.
