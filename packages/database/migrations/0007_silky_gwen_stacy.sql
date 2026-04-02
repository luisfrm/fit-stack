CREATE TABLE "coach_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"specialities" jsonb,
	"bio" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coach_profiles_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
DROP TABLE "cms_coaches" CASCADE;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "birthday" date;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_coach_id_members_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignments" ADD CONSTRAINT "coach_assignments_client_id_members_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;