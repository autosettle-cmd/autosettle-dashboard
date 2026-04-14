-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "matched_claim_id" TEXT,
ADD COLUMN     "matched_invoice_id" TEXT,
ADD COLUMN     "matched_sales_invoice_id" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_matched_invoice_id_idx" ON "BankTransaction"("matched_invoice_id");

-- CreateIndex
CREATE INDEX "BankTransaction_matched_sales_invoice_id_idx" ON "BankTransaction"("matched_sales_invoice_id");

-- CreateIndex
CREATE INDEX "BankTransaction_matched_claim_id_idx" ON "BankTransaction"("matched_claim_id");

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matched_invoice_id_fkey" FOREIGN KEY ("matched_invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matched_sales_invoice_id_fkey" FOREIGN KEY ("matched_sales_invoice_id") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matched_claim_id_fkey" FOREIGN KEY ("matched_claim_id") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
