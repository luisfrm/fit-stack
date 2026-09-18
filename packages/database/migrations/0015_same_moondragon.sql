ALTER TABLE "platform_subscription_payment" ADD COLUMN "subtotal" bigint;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "tax_total" bigint;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "tax_details" jsonb;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "payer_email" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "payer_name" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "receipt_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "void_reason" text;