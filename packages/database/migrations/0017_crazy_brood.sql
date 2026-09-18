ALTER TABLE "platform_subscription_payment" ALTER COLUMN "status" SET DEFAULT 'processing';
--> statement-breakpoint

-- Normalización de estados de pago: `pending` se unifica en `processing` e
-- `invalid` desaparece (el rechazo es `voided`). Al anular un pago con
-- comprobante emitido, se marca ANULADO (actor NULL, motivo de migración).
-- Retrocompatible: aplicable antes del deploy del código nuevo.
UPDATE "platform_subscription_payment" SET "status" = 'processing' WHERE "status" = 'pending';
--> statement-breakpoint
UPDATE "payment" SET "status" = 'processing' WHERE "status" = 'pending';
--> statement-breakpoint
UPDATE "platform_subscription_payment"
   SET "status" = 'voided',
       "receipt_voided" = CASE WHEN "receipt_number" IS NOT NULL THEN true ELSE "receipt_voided" END,
       "voided_at"      = CASE WHEN "receipt_number" IS NOT NULL THEN COALESCE("voided_at", now()) ELSE "voided_at" END,
       "void_reason"    = CASE WHEN "receipt_number" IS NOT NULL THEN COALESCE("void_reason", 'ANULADO por migración (invalid→voided)') ELSE "void_reason" END
 WHERE "status" = 'invalid';
--> statement-breakpoint
UPDATE "payment"
   SET "status" = 'voided',
       "receipt_voided" = CASE WHEN "receipt_number" IS NOT NULL THEN true ELSE "receipt_voided" END,
       "voided_at"      = CASE WHEN "receipt_number" IS NOT NULL THEN COALESCE("voided_at", now()) ELSE "voided_at" END,
       "void_reason"    = CASE WHEN "receipt_number" IS NOT NULL THEN COALESCE("void_reason", 'ANULADO por migración (invalid→voided)') ELSE "void_reason" END
 WHERE "status" = 'invalid';