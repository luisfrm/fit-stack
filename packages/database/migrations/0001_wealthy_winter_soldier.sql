CREATE TYPE "public"."global_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."org_role" AS ENUM('manager', 'cashier', 'coach', 'member');--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "role" SET DATA TYPE "public"."org_role" USING "role"::"public"."org_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'::"public"."global_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."global_role" USING "role"::"public"."global_role";