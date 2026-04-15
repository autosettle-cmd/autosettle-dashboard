-- AlterTable: add new column on Claim first
ALTER TABLE "Claim" ADD COLUMN "matched_bank_txn_id" TEXT;

-- Migrate existing matched_claim_id data to Claim.matched_bank_txn_id
UPDATE "Claim" c
SET "matched_bank_txn_id" = bt."id"
FROM "BankTransaction" bt
WHERE bt."matched_claim_id" = c."id"
  AND bt."matched_claim_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "BankTransaction" DROP CONSTRAINT "BankTransaction_matched_claim_id_fkey";

-- DropIndex
DROP INDEX "BankTransaction_matched_claim_id_idx";

-- AlterTable: drop old column from BankTransaction
ALTER TABLE "BankTransaction" DROP COLUMN "matched_claim_id";

-- CreateIndex
CREATE INDEX "Claim_matched_bank_txn_id_idx" ON "Claim"("matched_bank_txn_id");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_matched_bank_txn_id_fkey" FOREIGN KEY ("matched_bank_txn_id") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
