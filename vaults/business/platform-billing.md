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

### Self-service renewal (phase 2 — org pays from the panel)

Flow: the org renews its SaaS subscription from `apps/panel/app/(protected)/settings/suscription` → the payment stays `processing` ("under review") → support approves/rejects it in console (badge "Pending payment" in the subscriptions table + `PlatformPaymentHistoryModal` which now renders `paymentMethodDetails` with `PaymentDetailsList`, incl. "VIEW SCREENSHOT" links to R2) → once validated, the period is extended automatically.

- **`POST /api/organizations/subscription/renew`** (`requireOrgPermission('organization','update')` — owner/manager): **minimal body** `{ paymentMethod, currencyPaid, paymentMethodDetails?, paymentDate? }`. Everything financial is dictated by the backend — **the body can never hardcode amounts or rates**:
  - Snapshot (`planSnapshot*` + `featuresSnapshot`) ← from the plan in DB.
  - Rate ← `createExchangeRateProvider` (`api-worker/src/lib/exchange-rates.ts`, open.er-api.com, cache `rates:{base}` 1h; `EXCHANGE_API_URL` override for tests). `rate = 1` if currency == plan currency; provider failure → 503.
  - `amountPaid = round((priceOverride ?? plan.price) × rate)`, `baseAmount = effective price`, `exchangeRateApplied = String(rate)`.
  - `status = processing` (forced) — does NOT extend the period (only `PATCH status VALIDATED` does).
  - Guards: 400 without active org · 404 without sub · 400 cancelled · 409 if `hasPendingPayment` · **409 if `currentPeriodEnd > now` AND `hasValidatedPayment`** (a client with an un-paid/voided period can pay again).
  - Invalidates `platform:subscriptions*` + `org:${orgId}:subscription` / `subscription-status` / `features`.
- **Org-scoped reads**: `GET /api/organizations/subscription` (active sub with plan, `findActiveByOrganization`), `GET /api/organizations/payment-methods` (platform methods + currencies + currencyFormat). Services in `apps/panel/lib/services/org-billing.ts`; UI in `apps/panel/components/billing/` (`SubscriptionStatusCard` + `OrgRenewalModal` + `OrgPaymentSection`).
- **Field pre-sorting**: `visual` fields (instructions) are rendered first in all payment forms via `sortPaymentMethodFields` (`@workspace/shared`).
