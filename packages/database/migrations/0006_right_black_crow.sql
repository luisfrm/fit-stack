ALTER TABLE "subscription" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."subscription_status";