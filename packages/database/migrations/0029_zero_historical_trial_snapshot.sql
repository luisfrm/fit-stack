-- RD-117: trials are discontinued. A historical trial booked its payment with
-- `amount_paid = 0` but still froze the full plan price in `plan_snapshot_price`,
-- which counted it as SaaS revenue (`monthlyRevenueCents`, `previous_month`
-- and `GET /revenue`). Zeroing the snapshot is idempotent and a no-op when
-- there are no trial rows; the subscription keeps its historical `is_trial`.
UPDATE "platform_subscription_payment"
SET "plan_snapshot_price" = 0
WHERE "payment_method" = 'trial';
