CREATE TYPE "public"."frequency_type" AS ENUM('once', 'weekly');--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "start_time" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "end_time" text;--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "frequency_type" "frequency_type" DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "scheduled_date" date;--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "days_of_week" integer[];--> statement-breakpoint
ALTER TABLE "cms_classes" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "cms_classes" DROP COLUMN "time_info";