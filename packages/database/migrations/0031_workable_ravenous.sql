-- Multi-currency normalization: the SaaS layer bills in several currencies and
-- reports revenue in `platform_setting.primary_currency`. The two new columns
-- persist the frozen rate and its resulting amount instead of dividing at read
-- time. Additive only: no existing column changes meaning.
ALTER TABLE "platform_subscription_payment" ADD COLUMN "platform_rate_applied" numeric(20, 10);--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "platform_amount" bigint;--> statement-breakpoint
-- Backfill 1: the plan itself is priced in the primary currency, so the
-- equivalent amount is the frozen plan snapshot at an implicit 1:1 rate.
--
-- `plan_snapshot_price` is the FROZEN base amount of the payment (RD-157): it
-- is what the server priced and booked at payment time, never a division of
-- `amount_paid` by the rate. The older base columns that could have carried a
-- different figure (`price_override` on the subscription, `base_amount` on the
-- payment) were dropped in migration 0028 and are NOT reconstructed here: the
-- snapshot is the single source of truth for historical rows.
UPDATE "platform_subscription_payment"
SET "platform_rate_applied" = 1,
    "platform_amount" = "plan_snapshot_price"
WHERE "platform_amount" IS NULL
  AND "plan_snapshot_currency" = (SELECT "value" FROM "platform_setting" WHERE "key" = 'primary_currency');--> statement-breakpoint
-- Backfill 2: the payment was already made in the primary currency; the rate
-- of record is the applied exchange rate and the amount is what was paid.
UPDATE "platform_subscription_payment"
SET "platform_rate_applied" = "exchange_rate_applied",
    "platform_amount" = "amount_paid"
WHERE "platform_amount" IS NULL
  AND "currency_paid" = (SELECT "value" FROM "platform_setting" WHERE "key" = 'primary_currency');
-- Every other historical row stays NULL: reproducing its rate would mean
-- inventing one, and the compensation/read paths treat NULL as "not normalized".
