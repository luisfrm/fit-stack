-- `ai_usage.count` is dead: it has no readers or writers left (verified across
-- apps/, packages/ and e2e/), and the `credits` / `bonus_credits` ledger is the
-- single source of truth. Only the column is dropped; no data needs preserving.
ALTER TABLE "ai_usage" DROP COLUMN "count";
