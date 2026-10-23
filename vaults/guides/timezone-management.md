# Timezone Management

> **Scope:** how local time is resolved across the stack. Rule source: [`AGENTS.md`](../../AGENTS.md) §9.
> A payment taken at 11:30 PM local time belongs to **today's** report, not tomorrow's.

## 1. One source of truth

- The timezone lives in the `organization` row and reaches the session as `activeOrganization.timezone`. It is **never** a client param and never comes from `process.env` or the server clock.
- It is **required**: no `?? 'America/Caracas'` fallback. `requireOrgTimezone()` (`apps/api-worker/src/lib/route-handler.ts`) validates it and sets `c.get('orgTimezone')`; a missing value is a **500**, not a silent default.
- Services receive `timezone` as a parameter without a default, which keeps them pure and unit-testable.

## 2. Shared date utilities (`packages/shared/src/date.ts`)

Built on `date-fns` + `@date-fns/tz` (both edge-safe). The only place to do date math:

- `parseLocalToUtc(tz, 'YYYY-MM-DD')` — UTC instant of local midnight.
- `toLocalDayString(tz?, date?)` / `toLocalMonthString(...)` — local day/month (`'YYYY-MM-DD'` / `'YYYY-MM'`).
- `localDayStartUtc` / `localDayEndUtc` / `localDayRange` — local day bounds as UTC `Date`s (for `gte`/`lte` filters).
- `localMonthStartUtc` — start of the local month.
- `getTimezoneOffset(tz?, date?)` — `'+hh:mm'` offset.
- `addDuration(base, value, unit, tz)` — adds durations in the target timezone (DST and month ends included). `'UTC'` is a valid value (SaaS billing).

**Never** re-introduce manual arithmetic (`toISOString().slice(0,10)`, `Intl.DateTimeFormat('en-CA')`, `setUTCMonth`, `padStart` offsets, `Math.floor(ms / 86_400_000)`).

## 3. SQL vs JS

Aggregation by local day/month happens in **SQL** (`AT TIME ZONE`), one atomic operation over thousands of rows:

```ts
sql`(${table.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date`
```

The JS utilities resolve the **inputs** (UTC instants of local day bounds) and the **display**; they do not replace Postgres aggregation.

Rule of thumb for a new report or analytics service: take `timezone` from the controller and pass it to the SQL aggregation, never to a JS grouping loop.

## 4. AI quotas use UTC, not the org timezone

The AI ledger is deliberately timezone-free: `ai_usage.period_start` is a **UTC date** and the reset is lazy per subscription cycle.

- Active subscription: `startOfSubscriptionPeriod(currentPeriodEnd, duration)` (plan cycle, UTC).
- No active subscription: `startOfMonthUtc(now)` (day 1, 00:00 UTC).

`GET /api/ai/usage` also reports `periodStart` in UTC; convert only for display. Do not confuse it with financial reports, which do aggregate with `AT TIME ZONE`. See [`../ai/chat-pricing.md`](../ai/chat-pricing.md) and [`../ai/chat-infrastructure.md`](../ai/chat-infrastructure.md).
