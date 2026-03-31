-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "claim_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_claim_id_key" ON "Payment"("claim_id");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
