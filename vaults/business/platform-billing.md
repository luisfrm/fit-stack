> **Alcance:** estado de la suscripción SaaS de la organización (status calculado en SQL) y renovación self-service desde el panel.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Platform Subscription Status (Organization Billing)

Subscription status is **computed dynamically** via SQL CASE — NOT stored in DB.

**Constants** (`@workspace/shared/constants`):

```ts
PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active", // periodEnd >= now and EXISTS(validated|refunded)
  PAST_DUE: "past_due", // 1-7 days overdue
  READ_ONLY: "read_only", // 8-14 days overdue
  SUSPENDED: "suspended", // 15+ days overdue
  CANCELLED: "cancelled", // cancelledAt != null
};
```

The payment enum (`PAYMENT_STATUSES = processing | validated | voided | refunded`) and its derived helpers live in `@workspace/shared/constants`: `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) and `getVoidKind` (`voided` without `receiptNumber` → `rejected`; with → `annulled`). `pending` and `invalid` no longer exist.

**Computation** (`platform-subscriptions.repository.ts` — SQL CASE, order matters; pure mirror `computePlatformSubscriptionStatus`, parity-tested):

- `cancelledAt IS NOT NULL` → `cancelled`
- Active period + **`EXISTS(validated|refunded)`** (`QUALIFYING_PAYMENT_STATUSES`, never "the last payment") → `active`
- Active period without a qualifying payment (`processing`/`voided`/none) → `past_due`
- Grace from `currentPeriodEnd` (using `FLOOR` to match the pure helper): overdue ≤ 7 days → `past_due`; ≤ 14 → `read_only`; > 14 → `suspended`

`computePlatformSubscriptionStatus` (pure mirror) now requires **`hasValidatedPayment: boolean`** (no longer optional). The SQL and the helper are parity-tested (`platform-subscription-status.test.ts`).

A `voided` payment is **ignored**: it never revokes service; grace runs from `currentPeriodEnd` and the tiers do **not** accumulate. `processing` does not qualify either. `getLastSubscriptionStatus(organizationId)` exposes this same status + `hasValidatedPayment` for the self-service renewal guard, which blocks a re-payment **only if `currentPeriodEnd > now && hasValidatedPayment`** (a client whose only payment was voided can pay again). When the status does not grant access, the free-tier gate decides (`features.service.ts`): if `feature_flags_free_tier_enabled === 'true'` the free floor applies; otherwise the legacy gate sends the panel to `/no-subscription` (see [`features-and-free-tier.md`](./features-and-free-tier.md)).

> Careful: the gym `subscription` table (`subscriptions.repository.ts`) has its own derived status (`getSubscriptionStatusSql`): a `voided` payment → **`voided` (ANULADA)** and it wins over `cancelledAt`; `cancelledAt` alone → `cancelled` (revoked); `endDate < now` → `expired`. `cancelledAt` remains the internal "out of force" flag used by reports/actives. This is **not** the `platform_subscription` rule.

**Validation flow** (`apps/panel/app/(protected)/layout.tsx`):

- `SUSPENDED` / `CANCELLED` → redirect to `/no-subscription`
- `PAST_DUE` / `READ_ONLY` → show `<SubscriptionWarningBanner />`
- `ACTIVE` → normal render

**Endpoint**: `GET /api/organizations/subscription-status` (reads org from session) — fetch wrapped in `getOrgSubscriptionStatus(activeOrgId)` (`apps/panel/lib/services/subscription-status.ts`), used by the layout and by the gate page.

**Dynamic gate pages** (`/no-subscription`, `/unauthorized` in panel and console) — Server Components with `force-dynamic` that check the session on every request: no session → `redirect('/login')`; valid access (active subscription or allowed role) → `redirect('/dashboard')`; only without access they render. Prevents getting stuck after logout or refresh.

- **Note**: The `/no-subscription` page is OUTSIDE the `(protected)` layout to prevent infinite redirect loops.

### Subscription deletion (RD-153)

`DELETE /api/platform/subscriptions/:id` requires `console:manage` (admin/owner; `support` → 403). It is a hard delete and exists only for a
subscription with **zero** payment rows (e.g. a misplaced record). With any
`platform_subscription_payment` row the endpoint answers **409
`SUBSCRIPTION_HAS_PAYMENTS`** and deletes zero rows: the record is financial
history and must be **cancelled** instead. The FK
`platform_subscription_payment.subscription_id → platform_subscription.id` is
`ON DELETE RESTRICT` as the DB-level backstop (no cascade, so `FS-N` numbers are
never silently destroyed and `gaps[]` cannot report them as holes). The backstop
is mapped, never leaked: a FK violation raised by the `DELETE`
(`isPostgresForeignKeyViolation(err, 'subscription_id')` in `apps/api-worker/src/lib/errors.ts`, which
walks the deep Drizzle/Neon cause for SQLSTATE `23503`) is translated by the same
`subscriptionHasPaymentsError()` factory into the **same 409 body**, so the console
toast keeps resolving by `code` and the TOCTOU window between the count and the
delete can never surface as a 500. The pre-check stays only because it answers
without touching the DB; the constraint decides.

**Rule: a SaaS subscription with payments is CANCELLED, never deleted.**

### Self-service renewal (phase 2 — org pays from the panel)

Flow: the org renews its SaaS subscription from `apps/panel/app/(protected)/settings/suscription` → the payment stays `processing` ("under review") → an `admin`/`owner` approves/rejects it in console (`console:manage`; `support` is read-only) (badge "Pending payment" in the subscriptions table + `PlatformPaymentHistoryModal` which now renders `paymentMethodDetails` with `PaymentDetailsList`, incl. "VIEW SCREENSHOT" links to R2) → once validated, the period is extended automatically.

- **`POST /api/organizations/subscription/renew`** (`requireOrgPermission('organization','update')` — owner/manager): **minimal body** `{ paymentMethod, currencyPaid, paymentMethodDetails?, paymentDate? }`. Everything financial is dictated by the backend — **the body can never hardcode amounts or rates**:
  - Snapshot (`planSnapshot*` + `featuresSnapshot`) ← from the plan in DB.
  - Rate ← `createExchangeRateProvider` (`api-worker/src/lib/exchange-rates.ts`, open.er-api.com, fresh cache `rates:{base}` 1h + `rates:last:{base}` 30d; `EXCHANGE_API_URL` override for tests). `rate = 1` only if currency == plan currency. Provider failure → uses the last successful response for the SAME base (logged) or, without one, fails visibly (503) — never an assumed rate. Rates are never editable in the UI.
  - `amountPaid = roundCents(plan.price × rate)`, `exchangeRateApplied = String(rate)` (`numeric(20,10)`), plus the platform normalization (below): `platformRateApplied` (plan → `platform_setting.primary_currency`) and `platformAmount` (cents in that currency). The Console computes both on create, renew and manual register — **the body accepts neither an amount nor a rate** (its form amount is a read-only preview). The booked base amount is the frozen `planSnapshotPrice` written by the same payment: there is no separate base column and no `price_override` (both dropped in migration `0028`). Per-customer discounts are a future coupon feature, not an override column (RD-157/RD-161/RD-163).
  - `status = processing` (forced) — does NOT extend the period (only `PATCH status VALIDATED` does).
  - Guards: 400 without active org · 404 without sub · 400 cancelled · 409 if `hasPendingPayment` · **409 if `currentPeriodEnd > now` AND `hasValidatedPayment`** (a client with an un-paid/voided period can pay again).
  - Invalidates `platform:subscriptions*` + `org:${orgId}:subscription` / `subscription-status` / `features`.
- **Org-scoped reads**: `GET /api/organizations/subscription` (active sub with plan, `findActiveByOrganization`), `GET /api/organizations/payment-methods` (platform methods + currencies + currencyFormat). Services in `apps/panel/lib/services/org-billing.ts`; UI in `apps/panel/components/billing/` (`SubscriptionStatusCard` + `OrgRenewalModal` + `OrgPaymentSection`).
- **Field pre-sorting**: `visual` fields (instructions) are rendered first in all payment forms via `sortPaymentMethodFields` (`@workspace/shared`).

### No trials; free plan; future coupons (RD-117)

Trials are **gone from the model**, not just rejected: `isTrial`, `platform_plan.trial_days` and the `trial` status no longer exist in `@workspace/shared` or the schema. There is no `400 TRIAL_NOT_AVAILABLE` because there is no field to send. Rule source: `AGENTS.md` §11.

- **A free plan is not a trial**: `price = 0` keeps the free path (`validated`, `payment_method = 'free'`, `plan_snapshot_price = 0`, `platform_amount = 0`, receipt `pre_system`, no revenue, no series number). Its amounts and rates are zero/null — the rate provider is never called.
- **Historical rows**: migration `0030` closes every old trial (`current_period_end = LEAST(current_period_end, now())`, `cancelled_at`, `cancellation_reason = 'trials_removed'`), converts `payment_method = 'trial'` to `'free'`, deletes the `allow_price_override` setting and only then drops `is_trial`/`trial_days`. No row computes `trial` anymore.
- **Future discounts are coupons** (up to 100% off), never a resurrected `price_override`/`base_amount` column and never a zero-priced "trial" plan.

### Multi-currency normalization (RD-161)

A plan may be priced in any currency and be paid in a different one; the platform reports in a single currency, `platform_setting.primary_currency` (seeded by `/api/init`; a missing value is a visible error, never a default).

`platform_subscription_payment` persists both conversions, so no read path divides:

| Column | Meaning |
| --- | --- |
| `exchange_rate_applied` | plan currency → `currency_paid` (what the customer was charged at) |
| `platform_rate_applied` | plan currency → `platform_setting.primary_currency` |
| `platform_amount` | integer cents in the primary currency (`roundCents(plan.price × platform_rate_applied)`) |

- **Revenue** (`GET /stats` `monthlyRevenueCents`/`previousMonthRevenueCents`, `GET /revenue`) sums `platform_amount` of `validated` payments, in UTC buckets. `GET /revenue` returns `primaryCurrency` and `unconvertedCount` per bucket; `/stats` returns both at the top level.
- **MRR** = `platform_plan.price ×` the `platform_rate_applied` frozen in the **latest** `validated | refunded` payment of each `active` subscription (LATERAL subquery, no extra column): a plan whose price changed is restated at today's price with the rate actually applied. No validated payment with a rate → that subscription contributes 0.
- **`unconvertedCount`** surfaces `validated` payments with `platform_amount IS NULL` (historical rows whose rate cannot be reproduced: migration `0031` backfills only 1:1 plan-in-primary and paid-in-primary cases). They are **excluded** from the sums and reported, never assumed 1:1 and never added to another currency. The Console shows them as a "sin convertir" badge next to the KPIs.
- **Invoices** (`GET /by-organization/:orgId/invoices`) select the whole row, so `platformAmount`/`platformRateApplied` reach the Console and the normalized amount is what the UI displays.

**Currency guards** (fail-closed, `409` by `code`):

- `POST /api/platform/settings` → **`409 PRIMARY_CURRENCY_IMMUTABLE`** when `primary_currency` changes and **any** SaaS payment exists (`hasAnyPayment()`): it is the normalization currency of every `platform_amount`, so changing it would silently reinterpret historical revenue.
- `PUT`/`PATCH /api/platform/plans/:id` → **`409 PLAN_CURRENCY_IMMUTABLE`** when the currency changes and the plan already has payments (`countPaymentsByPlan()`): the plan currency freezes the rate of every payment priced from it. Historical snapshots keep their own currency.

Neither guard is a Zod `refine` (they need a DB read): both run in the route before the write, and the PATCH alias shares the same check so it cannot bypass it.
