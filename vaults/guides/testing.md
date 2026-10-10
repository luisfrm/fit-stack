> **Alcance:** las 3 capas de tests (unit/integration con Vitest y E2E con Playwright), estructura, fixtures y convenciones.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Testing

Fit-Stack has **3 test layers**.

### 1. `pnpm test` — Unit + Integration (Vitest)

Runs the Vitest suite across all packages/apps:

```bash
pnpm test  # shared → api-worker → jobs-worker → panel → console (Vitest)
```

**What it includes:**

- **Unit Tests (all packages/apps)**: pure functions, no DB or HTTP.
  - `packages/shared/tests/`: features catalog, RBAC permissions, constants, RAG helpers, date utils
  - `apps/api-worker/tests/unit/`: AI helpers (`ai-helpers.test.ts`)
  - `apps/panel/tests/unit/`: UI utilities (`helper.test.ts`, `display.test.ts`, `features.test.ts`, `error.test.ts`)
  - `apps/console/tests/unit/`: UI utilities (`helper.test.ts`, `display.test.ts`, `features.test.ts`) + pure selectors/permissions (`dashboard-selectors`, `subscription-selectors`, `organization-selectors`, `platform-permissions`, `paginate`, `staff-role-counts`)
- **Integration Tests (api-worker)**: real HTTP against the Hono app + Neon branch. `pnpm --filter api-worker test:integration`.
  - **Real HTTP, no mocks**: `app.fetch(request, env, ctx)` — the same production entry point — against a **Neon branch** (`TEST_DATABASE_URL` in `apps/api-worker/.dev.vars`; read `tests/setup.ts`).
  - **Hard guards**: refuses to run if `TEST_DATABASE_URL` points to the same host+db as `DATABASE_URL`; without `TEST_DATABASE_URL` the whole suite is skipped with `describe.skipIf` (CI included).
  - **Determinism**: `fileParallelism: false` (one shared branch), `TRUNCATE ... RESTART IDENTITY CASCADE` between files (`tests/helpers/db.ts`), Redis intentionally absent (no-op cache).
  - **Recording spies** for R2 and Queues (`tests/helpers/env.ts`) — can assert enqueued events (e.g. `email.payment_receipt`).
  - **Fixtures** (`tests/helpers/auth.ts`): sign-up/orgs via real HTTP (Better Auth), direct SQL insert only for what has no endpoint (global roles). **Shared per `describe`** (`beforeAll`) when assertions don't depend on mutated state (unique emails/keys) — each Better Auth sign-up costs ~3s (bcrypt + Neon), so one tenant per test only where isolation requires it. **Watch the day helpers**: `isoDate(n)` derives the **UTC** day while `localDay(n, tz)` derives the **org-local** day; they diverge between 20:00-24:00 in America/Caracas (UTC-4), so use `localDay` whenever the assertion is about the local-day contract.
  - **Auth guards** (`tests/integration/guards.test.ts`): cover the 3 middlewares of `route-handler.ts` — `requireAuth` (401 without session; lets a valid session without org through, 200 with `admin`), `requireOrgPermission` (401, **400 without active org**, role matrix: positive owner/manager/cashier settings, member/coach plans/classes read; negative coach settings, cashier staff, coach classes.create even with update, member subscriptions) and `requirePlatformPermission`/`requirePlatformAuth` (admin/owner 200, **support 403 read-only** in settings/orgs/staff, user 403, 401).
  - **Financial invariants** (`subscriptions.test.ts` — period + payment-transition guards, `subscriptions-period.test.ts`, `subscriptions-compensation.test.ts`, `platform-subscriptions-compensation.test.ts`, `receipts-*.test.ts`): pin the rules that must not regress — *validated ⇔ numbered*, server-computed period, compensated creation (no double charge, no access without a charge), the ANULADO artifact. Touch subscriptions, payments or receipts → run these first.
  - **Schema sync**: `pnpm --filter api-worker test:db:push` (drizzle-kit push against the test branch, never production).

> **panel/console have no integration tests** — their tests are unit only (`tests/unit/`). api-worker is the only one with an integration suite.

> E2E **don't** run with `pnpm test` — they are a separate layer (`pnpm test:e2e`).

### 2. E2E Tests (Playwright) — normal suite: tests only, zero evidence

End-user tests navigating the real UI in Chromium. Config in `playwright.config.ts` (root).
The suite creates its own tenant (`e2e-suite` + `e2e-empty`), tests the flows
(create/edit), and deletes everything on teardown — no residue. This is NOT demo
data: the demo org (`Fit Stack` / `fit-stack`) is filled by `pnpm seed:e2e` and
is never touched by the suite.

```bash
pnpm test:e2e           # All E2E tests (console first, then panel)
pnpm test:e2e:ui        # Playwright UI mode (visual debug)
pnpm test:e2e:panel     # Panel only (Gym Admin, + its login setup)
pnpm test:e2e:console   # Console only (SaaS Admin, + its login setup)
pnpm test:e2e:report    # Open HTML report
pnpm seed:e2e           # Demo seed: fills Fit Stack/fit-stack (NOT a test, keeps data)
```

**Suite coverage**: panel — auth, dashboard (KPIs + sidebar nav), members, plans, subscriptions, classes, settings, content (CMS), empty-state; console — auth, dashboard, organizations, subscriptions, staff, plans, settings.

**Lifecycle** (`global-setup.ts` → setups → specs → `global-teardown.ts`):

1. Reset (crash-safe, fixed slugs/emails): wipe `e2e-suite` + `e2e-empty` orgs + reserved users. Worst case is "suite orgs exist", never accumulation.
2. Platform owner (`e2e-platform@e2e.test`, role promoted via SQL).
3. Console creates the suite org via `POST /api/platform/organizations` (same path as prod) → provisions the panel owner via `POST /:id/staff` (role owner) → trial platform sub → minimal gym seed (1 plan, 3 members, 1 sub, 1 class, 1 CMS page). Same for the empty org `e2e-empty` (no gym seed, used by `empty-state.spec.ts`).
4. `console-setup` / `panel-setup` do UI login only + `storageState` (+ route prewarm).
5. Teardown wipes the suite orgs + users (best-effort; skipped with `E2E_KEEP_DATA=1` for inspection). The platform plan catalog row is shared and reused by name — never deleted (other orgs' subs reference it).

**Playwright config** (`playwright.config.ts`):

- `testDir: './e2e'`, `fullyParallel: false`, `workers: 1` (one shared dev DB + one suite org — parallel workers would write the same org), `timeout: 60_000`, `retries: 1` in CI.
- `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`, `expect.timeout: 15_000`. Reporter: `html` (open: never) + `list`.
- **Project order: console first, then panel** (`console-setup` → `console` → `panel-setup` → `panel`). `--project` filters still run isolated (each pulls only its login setup).
- **Web servers**: `webServer` array launches api-worker (`/healthz`), panel (3001) and console (3000) in parallel; `reuseExistingServer: true` locally (CI uses `reuseExistingServer: false`), 240s startup timeout.

**Structure**:

```
e2e/
├── global-setup.ts      # Suite tenant: console user → org (platform endpoint) → owner → seed
├── global-teardown.ts   # Wipes suite orgs + users (never fit-stack, never the plan catalog)
├── seed.ts              # Demo seed (pnpm seed:e2e): fills Fit Stack/fit-stack, idempotent, keeps data
├── fixtures.ts          # Shared test/api/consoleApi (panelApi.create/track auto-deletes per test, LIFO)
├── panel-setup.ts       # UI login only → panel-user.json (+ prewarm)
├── console-setup.ts     # UI login only → console-user.json (+ prewarm)
├── helpers/
│   ├── api.ts             # HTTP over real network: registerUser/signIn/organization/invite helpers + uid/uniqueEmail (per-test disposables only, org-scoped)
│   ├── api-client.ts      # ApiClient with resource tracking (create/track + cleanupDisposables)
│   ├── db.ts              # Direct dev DB (DATABASE_URL from apps/api-worker/.dev.vars): roles, lookups, wipeTenant (orgs+users; never the platform plan)
│   ├── domain.ts          # findByName/Email (resolve UI-created resources for track())
│   ├── platform.ts        # Provisioning: platform tenant, suite org via console endpoint, staff owner, platform sub, gym seed (check-then-create)
│   ├── test-tenant.ts     # Fixed identities: e2e-suite / e2e-empty slugs, reserved emails, seed literals, state.json
│   ├── prewarm.ts         # Route prewarm (Turbopack compile out of test time)
│   ├── modal.ts           # openModal(): robust click vs hydration race
│   ├── nav.ts             # navigateByClick(): robust navigation vs hydration race
│   └── selectors.ts       # Common design-system selectors (data-testid > role > text > CSS)
├── panel/
│   ├── auth.spec.ts       # Login, session, redirect, error toast
│   ├── dashboard.spec.ts  # KPIs, sidebar nav, navigation, charts row + revenue mini + report button
│   ├── members.spec.ts    # Members list, search, create via UI (tracked), KPI section, growth/birthdays, status/subscription URL filters
│   ├── plans.spec.ts      # Plans list, modal
│   ├── subscriptions.spec.ts # Pending-payment actionable (per-test API fixture + validate flow)
│   ├── classes.spec.ts    # Classes list, modal, week calendar (?week= nav), next class + visibility summary
│   ├── settings.spec.ts   # Tab navigation, General/Org/Currencies/Payments
│   ├── content.spec.ts    # CMS pages, list
│   └── empty-state.spec.ts # Empty states on e2e-empty (own storageState; never touches e2e-suite)
└── console/
    ├── auth.spec.ts       # Login, session
    ├── dashboard.spec.ts  # Stats, sidebar nav
    ├── organizations.spec.ts # List, search, create button, KPI filters
    ├── subscriptions.spec.ts # List, filters, KPIs, side panel
    ├── staff.spec.ts      # Table, side panel, role/search URL filters
    ├── plans.spec.ts      # List, create
    └── settings.spec.ts   # Tab navigation, General/Currencies/FreeTier/AI-Provider/Knowledge
```

**TestTenantState** (`e2e/.auth/state.json`, written by global-setup): `orgId/orgSlug` (suite), `ownerUserId`, `platformUserId`, `emptyOrgId/emptyOrgSlug/emptyOwnerEmail`, `ids` (seeded fixtures), `reusedExisting` (true when pre-existing users were reused, e.g. after `E2E_KEEP_DATA=1`), `createdAt`. Specs import `test`/`expect` from `../fixtures` (never from `@playwright/test` when they need `tenant`/`panelApi`/`consoleApi`).

**Seed** (`pnpm seed:e2e`, `e2e/seed.ts`): fills `Fit Stack`/`fit-stack` (create if missing, fill what's missing, never delete). Relative dates via `@workspace/shared` in org tz: 30 members in 6 monthly cohorts (backdated `created_at` via SQL — the only DB write for dates, seed-only), ~24 subs/payments spread by month + 3 `processing`, 4 plans, 3 weekly classes, 3 CMS pages, trial platform sub. Prints panel credentials on completion. Re-running reuses everything.

**Fixture cleanup rule**: per-test writes go through `panelApi.create()`/`track()` (auto-delete LIFO). A subscription is **not deletable** on purpose (`DELETE_ROUTES.subscription = null` in `helpers/api-client.ts`): the member delete (later in LIFO) cascades it away by FK, so the cleanup is still complete and the FK warning noise is gone. The suite-org wipe + global teardown are the safety net — no manual `afterAll` needed. `uid()`/`uniqueEmail()` are allowed only for per-test disposables inside `e2e-suite` (org-scoped, never for the shared tenant or `fit-stack`).

**Setup sessions**: `panel-setup` writes **two** storage states before the `panel` project creates any context — `panel-user.json` (suite org) and `empty-org-user.json` (org `e2e-empty`, used by `empty-state.spec.ts` via `test.use`). A `test.use({ storageState })` path must exist *before* the project runs, so it can never be created in a spec's `beforeAll`.

**Env vars** (optional):

- `E2E_KEEP_DATA=1` — skip teardown to inspect the suite tenant (next run resets anyway).
- `API_BASE_URL` / `PANEL_URL` / `CONSOLE_URL` — override app URLs (defaults: 8788/3001/3000).

**Dev dependencies** (root): `@playwright/test@1.63.0`, `@neondatabase/serverless@1.0.2`, `tsx` (seed runner), `@workspace/shared` (date utils in e2e/seed).

> When you add or change API behavior, the integration tests are the first line of defense: run `pnpm test` before asking for review.
> E2E tests validate complete user flows in the UI — run with `pnpm test:e2e` (separate from `pnpm test`).
