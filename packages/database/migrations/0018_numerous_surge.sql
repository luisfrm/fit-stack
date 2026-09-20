ALTER TABLE "payment" ADD COLUMN "plan_snapshot_duration_value" integer;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "plan_snapshot_duration_unit" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_voided_pdf_key" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_voided_pdf_key" text;--> statement-breakpoint
CREATE INDEX "idx_payment_voided_pending" ON "payment" USING btree ("voided_at") WHERE "payment"."receipt_voided" AND "payment"."receipt_voided_pdf_key" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_psp_voided_pending" ON "platform_subscription_payment" USING btree ("voided_at") WHERE "platform_subscription_payment"."receipt_voided" AND "platform_subscription_payment"."receipt_voided_pdf_key" IS NULL;