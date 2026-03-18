ALTER TABLE "user" DROP CONSTRAINT "user_username_unique";--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "role" DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "username";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "passwordHash";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "member_role";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "banned";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "banReason";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "banExpires";--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_username_unique" UNIQUE("username");