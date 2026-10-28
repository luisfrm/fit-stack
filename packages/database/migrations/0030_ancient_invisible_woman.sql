-- Trials are discontinued: any historical trial subscription loses its access
-- window (its period is closed now and it is marked as cancelled), and its $0
-- payments become regular `free` ones. Data first, drops last: the columns must
-- still exist while the rows are normalized.
UPDATE "platform_subscription"
SET "current_period_end" = LEAST("current_period_end", now()),
    "cancelled_at" = COALESCE("cancelled_at", now()),
    "cancellation_reason" = COALESCE("cancellation_reason", 'trials_removed')
WHERE "is_trial" = true;--> statement-breakpoint
UPDATE "platform_subscription_payment"
SET "payment_method" = 'free'
WHERE "payment_method" = 'trial';--> statement-breakpoint
-- Price overrides are gone: the server always prices the SaaS payment.
DELETE FROM "platform_setting" WHERE "key" = 'allow_price_override';--> statement-breakpoint
ALTER TABLE "platform_plan" DROP COLUMN "trial_days";--> statement-breakpoint
ALTER TABLE "platform_subscription" DROP COLUMN "is_trial";
