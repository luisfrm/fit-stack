-- RD-153 — enforce the subscription FK for real once the legacy rows are gone.
--
-- `0024` added `platform_subscription_payment.subscription_id` as a NOT VALID
-- foreign key, because that database still carried orphan payments whose
-- parent subscription had been deleted (the bug RD-153 closes at the API
-- level). Rewriting or deleting financial rows is never automatic
-- (AGENTS.md §3), so the orphans are removed by hand and this migration then
-- validates the constraint.
--
-- Guard: fail with a readable message instead of a cryptic FK error when an
-- environment has not been cleaned yet.
DO $rd153$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM platform_subscription_payment p
  LEFT JOIN platform_subscription s ON s.id = p.subscription_id
  WHERE p.subscription_id IS NOT NULL AND s.id IS NULL;

  IF remaining > 0 THEN
    RAISE EXCEPTION
      'RD-153: % orphan platform_subscription_payment rows remain. Run the cleanup script before migrating.',
      remaining;
  END IF;
END
$rd153$;--> statement-breakpoint
-- Recreate the constraint as VALID (the identifier exceeds PostgreSQL's
-- 63-character limit, so the server stores and matches its truncated form).
ALTER TABLE "platform_subscription_payment" DROP CONSTRAINT IF EXISTS "platform_subscription_payment_subscription_id_platform_subscription_id_fk";--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_subscription_id_platform_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscription"("id") ON DELETE restrict ON UPDATE no action;
