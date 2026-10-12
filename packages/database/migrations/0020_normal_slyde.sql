ALTER TABLE "biometric_sync_task" DROP CONSTRAINT "biometric_sync_task_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "coach_assignment" DROP CONSTRAINT "coach_assignment_coach_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "coach_assignment" DROP CONSTRAINT "coach_assignment_client_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "coach_profile" DROP CONSTRAINT "coach_profile_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "workout_session" DROP CONSTRAINT "workout_session_member_id_gym_member_id_fk";
--> statement-breakpoint
ALTER TABLE "gym_member" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "biometric_sync_task" ADD CONSTRAINT "biometric_sync_task_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_coach_member_id_gym_member_id_fk" FOREIGN KEY ("coach_member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_client_member_id_gym_member_id_fk" FOREIGN KEY ("client_member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE restrict ON UPDATE no action;