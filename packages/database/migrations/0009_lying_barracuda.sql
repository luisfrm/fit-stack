ALTER TABLE "members" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_username_unique" UNIQUE("username");