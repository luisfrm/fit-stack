-- Paso 1: Drop FKs antes de alterar tipos de columna
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "trainer_profiles" DROP CONSTRAINT IF EXISTS "trainer_profiles_user_id_user_id_fk";--> statement-breakpoint

-- Paso 2: Alterar columnas a uuid
ALTER TABLE "members" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::text::uuid;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::text::uuid;--> statement-breakpoint

-- Paso 3: Re-agregar FKs
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;