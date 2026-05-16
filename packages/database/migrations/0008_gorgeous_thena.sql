ALTER TABLE "store_subscription" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_subscription" ADD COLUMN "cancellation_reason" text;