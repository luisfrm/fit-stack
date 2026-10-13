ALTER TABLE "subscription" DROP CONSTRAINT "subscription_plan_id_membership_plan_id_fk";
--> statement-breakpoint
ALTER TABLE "membership_plan" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE restrict ON UPDATE no action;