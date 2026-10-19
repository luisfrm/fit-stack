-- RD-153 — protect the financial history of subscriptions.
--
-- `payment.subscription_id`: the FK exists (created in 0000) and has no
-- orphans, so it is recreated as RESTRICT normally.
ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "payment_subscription_id_subscription_id_fk";--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- `platform_subscription_payment.subscription_id`: the constraint may be
-- ABSENT (it is missing in the live database, which is exactly how the
-- rows below were orphaned), hence `IF EXISTS`.
ALTER TABLE "platform_subscription_payment" DROP CONSTRAINT IF EXISTS "platform_subscription_payment_subscription_id_platform_subscription_id_fk";--> statement-breakpoint
-- Legacy orphans: payments that lost their parent subscription when
-- `DELETE /api/platform/subscriptions/:id` ran without the FK. They are
-- financial records (some already carry an issued `FS-N` number) and are
-- NEVER deleted, so the constraint is added NOT VALID: it is enforced for
-- every new row and every new delete, while the historical rows stay as they
-- are. Validating it requires a deliberate data reconciliation, never
-- automatic (AGENTS.md §3). RD-153 closes the API path that created them
-- (`409 SUBSCRIPTION_HAS_PAYMENTS`).
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_subscription_id_platform_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscription"("id") ON DELETE restrict ON UPDATE no action NOT VALID;
