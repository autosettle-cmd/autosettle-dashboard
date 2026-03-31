-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_claim_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Payment_claim_id_key";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "claim_id";

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_payment_id_claim_id_key" ON "PaymentReceipt"("payment_id", "claim_id");

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
