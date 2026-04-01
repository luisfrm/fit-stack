ALTER TABLE "members" DROP CONSTRAINT "members_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role_id" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "member_id" integer;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "members" DROP COLUMN "role";