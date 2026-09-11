ALTER TABLE "membership_plan" ALTER COLUMN "price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "plan_snapshot_price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "amount_paid" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "subtotal" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payment" ALTER COLUMN "tax_total" SET DATA TYPE bigint;