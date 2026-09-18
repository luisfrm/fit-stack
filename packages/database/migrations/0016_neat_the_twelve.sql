ALTER TABLE "payment" ADD COLUMN "emitter_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "issued_by" text;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "emitter_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD COLUMN "issued_by" text;