CREATE TABLE "organization_document_sequence" (
	"organization_id" text NOT NULL,
	"document_type" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "organization_document_sequence_pkey" PRIMARY KEY("organization_id","document_type","year")
);
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "document_type" text DEFAULT 'receipt' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_pdf_key" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "tax_override_reason" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "receipt_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "organization_document_sequence" ADD CONSTRAINT "organization_document_sequence_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payment_org_receipt_number" ON "payment" USING btree ("organization_id","receipt_number") WHERE "payment"."receipt_number" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_payment_org_receipt_issued" ON "payment" USING btree ("organization_id","receipt_issued_at");--> statement-breakpoint
CREATE INDEX "idx_payment_receipt_pending" ON "payment" USING btree ("receipt_issued_at") WHERE "payment"."receipt_number" IS NOT NULL AND "payment"."receipt_pdf_key" IS NULL;