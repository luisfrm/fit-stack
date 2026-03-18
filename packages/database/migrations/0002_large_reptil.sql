-- Paso 1: Dropear FKs que dependen de user.id (integer)
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "trainer_profiles" DROP CONSTRAINT IF EXISTS "trainer_profiles_user_id_user_id_fk";--> statement-breakpoint

-- Paso 2: Renombrar columnas de snake_case a camelCase en 'user'
ALTER TABLE "user" RENAME COLUMN "email_verified" TO "emailVerified";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "password_hash" TO "passwordHash";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "created_at" TO "createdAt";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "updated_at" TO "updatedAt";--> statement-breakpoint

-- Paso 3: Cambiar id de integer a uuid en 'user'
-- Primero eliminar el DEFAULT serial (nextval) que impide el cast
ALTER TABLE "user" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" TYPE uuid USING gen_random_uuid();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint

-- Paso 4: Ajustes adicionales en 'user'
ALTER TABLE "user" ALTER COLUMN "username" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'client';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" timestamp with time zone;--> statement-breakpoint

-- Paso 5: Cambiar user_id de integer a uuid en members y trainer_profiles
ALTER TABLE "members" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::text::uuid;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::text::uuid;--> statement-breakpoint

-- Paso 6: Re-agregar FKs ahora que los tipos coinciden
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_profiles" ADD CONSTRAINT "trainer_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;