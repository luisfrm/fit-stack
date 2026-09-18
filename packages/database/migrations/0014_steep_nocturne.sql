CREATE TABLE "platform_document_sequence" (
	"document_type" text PRIMARY KEY NOT NULL,
	"next_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_pdf_key" text;--> statement-breakpoint
CREATE INDEX "idx_psp_receipt_pending" ON "platform_subscription_payment" USING btree ("receipt_issued_at") WHERE "platform_subscription_payment"."receipt_number" IS NOT NULL AND "platform_subscription_payment"."receipt_pdf_key" IS NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_receipt_number_unique" UNIQUE("receipt_number");