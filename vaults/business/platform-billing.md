> **Alcance:** estado de la suscripción SaaS de la organización (status calculado en SQL) y renovación self-service desde el panel.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Platform Subscription Status (Organization Billing)

Subscription status is **computed dynamically** via SQL CASE — NOT stored in DB.

**Constants** (`@workspace/shared/constants`):

```ts
PLATFORM_SUBSCRIPTION_STATUSES = {
  ACTIVE: "active", // periodEnd >= now and EXISTS(validated|refunded)
  TRIAL: "trial", // isTrial && periodEnd >= now
  PAST_DUE: "past_due", // 1-7 days overdue
  READ_ONLY: "read_only", // 8-14 days overdue
  SUSPENDED: "suspended", // 15+ days overdue
  CANCELLED: "cancelled", // cancelledAt != null
};
```

The payment enum (`PAYMENT_STATUSES = processing | validated | voided | refunded`) and its derived helpers live in `@workspace/shared/constants`: `QUALIFYING_PAYMENT_STATUSES` (`validated | refunded`) and `getVoidKind` (`voided` without `receiptNumber` → `rejected`; with → `annulled`). `pending` and `invalid` no longer exist.

**Computation** (`platform-subscriptions.repository.ts` — SQL CASE, order matters; pure mirror `computePlatformSubscriptionStatus`, parity-tested):

- `cancelledAt IS NOT NULL` → `cancelled`
- `isTrial = true` and active period → `trial`
- Active period + **`EXISTS(validated|refunded)`** (`QUALIFYING_PAYMENT_STATUSES`, never "the last payment") → `active`
- Active period without a qualifying payment (`processing`/`voided`/none) → `past_due`
- Grace from `currentPeriodEnd` (using `FLOOR` to match the pure helper): overdue ≤ 7 days → `past_due`; ≤ 14 → `read_only`; > 14 → `suspended`

`computePlatformSubscriptionStatus` (pure mirror) now requires **`hasValidatedPayment: boolean`** (no longer optional). The SQL and the helper are parity-tested (`platform-subscription-status.test.ts`).

A `voided` payment is **ignored**: it never revokes service; grace runs from `currentPeriodEnd` and the tiers do **not** accumulate. `processing` does not qualify either. `getLastSubscriptionStatus(organizationId)` exposes this same status + `hasValidatedPayment` for the self-service renewal guard, which blocks a re-payment **only if `currentPeriodEnd > now && hasValidatedPayment`** (a client whose only payment was voided can pay again). When the status does not grant access, the free-tier gate decides (`features.service.ts`): if `feature_flags_free_tier_enabled === 'true'` the free floor applies; otherwise the legacy gate sends the panel to `/no-subscription` (see [`features-and-free-tier.md`](./features-and-free-tier.md)).

> Careful: the gym `subscription` table (`subscriptions.repository.ts`) has its own derived status (`getSubscriptionStatusSql`): a `voided` payment → **`voided` (ANULADA)** and it wins over `cancelledAt`; `cancelledAt` alone → `cancelled` (revoked); `endDate < now` → `expired`. `cancelledAt` remains the internal "out of force" flag used by reports/actives. This is **not** the `platform_subscription` rule.

**Validation flow** (`apps/panel/app/(protected)/layout.tsx`):

- `SUSPENDED` / `CANCELLED` → redirect to `/no-subscription`
- `PAST_DUE` / `READ_ONLY` → show `<SubscriptionWarningBanner />`
- `ACTIVE` / `TRIAL` → normal render

**Endpoint**: `GET /api/organizations/subscription-status` (reads org from session) — fetch wrapped in `getOrgSubscriptionStatus(activeOrgId)` (`apps/panel/lib/services/subscription-status.ts`), used by the layout and by the gate page.

**Dynamic gate pages** (`/no-subscription`, `/unauthorized` in panel and console) — Server Components with `force-dynamic` that check the session on every request: no session → `redirect('/login')`; valid access (active subscription or allowed role) → `redirect('/dashboard')`; only without access they render. Prevents getting stuck after logout or refresh.

- **Note**: The `/no-subscription` page is OUTSIDE the `(protected)` layout to prevent infinite redirect loops.

### Subscription deletion (RD-153)

`DELETE /api/platform/subscriptions/:id` is a hard delete and exists only for a
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
  - `amountPaid = round(plan.price × rate)` (or `0` for a free plan), `exchangeRateApplied = String(rate)` (`numeric(20,10)`). The booked base amount is the frozen `planSnapshotPrice` written by the same payment: there is no separate base column and no `price_override` (both dropped in migration `0028`). The request body cannot state the base amount nor a commercial override; per-customer discounts are a future coupon feature, not an override column (RD-157/RD-163).
  - `status = processing` (forced) — does NOT extend the period (only `PATCH status VALIDATED` does).
  - Guards: 400 without active org · 404 without sub · 400 cancelled · 409 if `hasPendingPayment` · **409 if `currentPeriodEnd > now` AND `hasValidatedPayment`** (a client with an un-paid/voided period can pay again).
  - Invalidates `platform:subscriptions*` + `org:${orgId}:subscription` / `subscription-status` / `features`.
- **Org-scoped reads**: `GET /api/organizations/subscription` (active sub with plan, `findActiveByOrganization`), `GET /api/organizations/payment-methods` (platform methods + currencies + currencyFormat). Services in `apps/panel/lib/services/org-billing.ts`; UI in `apps/panel/components/billing/` (`SubscriptionStatusCard` + `OrgRenewalModal` + `OrgPaymentSection`).
- **Field pre-sorting**: `visual` fields (instructions) are rendered first in all payment forms via `sortPaymentMethodFields` (`@workspace/shared`).

### Trials discontinued (RD-117)

**There are no more trials.** A trial used to book a `validated` payment with `payment_method = 'trial'` and `amount_paid = 0`, but it froze the **full plan price** in `plan_snapshot_price`. When `base_amount` was dropped (`0028`) that snapshot became the booked base amount, so every trial counted in `monthlyRevenueCents`, `previousMonthRevenueCents` (both in `GET /api/platform/subscriptions/stats`) and in the `GET /api/platform/subscriptions/revenue` buckets.

- **Creation rejects trials**: `POST /api/platform/subscriptions` and its org-scoped mirror `POST /api/platform/organizations/:id/subscriptions` answer **400 `TRIAL_NOT_AVAILABLE`** ("Los trials ya no están disponibles. Los descuentos se gestionarán con cupones.") when the body sends `isTrial: true`. `createSubscriptionWithPayment` throws **before the first write**, so no orphan subscription/payment is left behind. The Console form no longer offers the trial toggle and never sends the flag.
- **The `is_trial` column is not touched**: historical subscriptions keep their flag, so their computed status stays `trial` while the period is in force (see `PAYMENT_STATUSES.md`).
- **Data migration `0029`** (`0029_zero_historical_trial_snapshot.sql`, custom/idempotent, no-op without trial rows) zeroes the frozen snapshot of historical trials:

  ```sql
  UPDATE "platform_subscription_payment"
  SET "plan_snapshot_price" = 0
  WHERE "payment_method" = 'trial';
  ```

  They no longer inflate the revenue KPIs, with no receipt to void (a trial was `$0` and never burned an `FS-N` number).
- **Free plans are NOT trials**: a plan with `price = 0` keeps the free path — `status = validated`, `payment_method = 'free'`, `amount_paid = 0` and `plan_snapshot_price = 0`, so it never books revenue and never burns a series number (`pre_system`).
- **Future discounts = coupons**: per-customer discounts will be modeled as coupons, never as a resurrected `price_override`/`base_amount` column.
