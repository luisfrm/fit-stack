CREATE TYPE "public"."membership_duration_unit" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
ALTER TABLE "fitstack_plan" RENAME COLUMN "monthly_price" TO "price";--> statement-breakpoint
ALTER TABLE "fitstack_plan" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "fitstack_plan" ADD COLUMN "duration_value" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "fitstack_plan" ADD COLUMN "duration_unit" "membership_duration_unit" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD COLUMN "duration_value" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD COLUMN "duration_unit" "membership_duration_unit" DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE "fitstack_plan" DROP COLUMN "yearly_price";--> statement-breakpoint
ALTER TABLE "fitstack_plan" DROP COLUMN "suggested_duration_days";