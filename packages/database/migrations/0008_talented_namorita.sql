ALTER TABLE "members" RENAME COLUMN "username" TO "email";--> statement-breakpoint
ALTER TABLE "members" DROP CONSTRAINT "members_username_unique";--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_email_unique" UNIQUE("email");