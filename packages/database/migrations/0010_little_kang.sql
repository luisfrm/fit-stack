ALTER TABLE "organization" ALTER COLUMN "country_code" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "primary_currency" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "currency_format" text;--> statement-breakpoint
UPDATE "organization" SET "primary_currency" = CASE "country_code" WHEN 'VE' THEN 'VES' WHEN 'CO' THEN 'COP' WHEN 'MX' THEN 'MXN' WHEN 'AR' THEN 'ARS' WHEN 'CL' THEN 'CLP' WHEN 'PE' THEN 'PEN' WHEN 'ES' THEN 'EUR' WHEN 'US' THEN 'USD' ELSE 'USD' END WHERE "primary_currency" IS NULL;--> statement-breakpoint
UPDATE "organization" SET "currency_format" = 'latam' WHERE "currency_format" IS NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "primary_currency" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "currency_format" SET NOT NULL;
