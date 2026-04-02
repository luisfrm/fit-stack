ALTER TABLE "payments" DROP CONSTRAINT "payments_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "routine_templates" DROP CONSTRAINT "routine_templates_trainer_id_trainer_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "workout_sessions" DROP CONSTRAINT "workout_sessions_member_id_members_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_templates" ADD CONSTRAINT "routine_templates_trainer_id_trainer_profiles_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainer_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;