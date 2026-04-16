-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "file_hash" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "file_hash" TEXT;

-- CreateIndex
CREATE INDEX "Claim_firm_id_file_hash_idx" ON "Claim"("firm_id", "file_hash");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_file_hash_idx" ON "Invoice"("firm_id", "file_hash");
