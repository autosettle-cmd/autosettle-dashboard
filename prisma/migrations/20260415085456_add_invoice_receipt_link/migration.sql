-- CreateTable
CREATE TABLE "InvoiceReceiptLink" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by" TEXT,

    CONSTRAINT "InvoiceReceiptLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceReceiptLink_claim_id_idx" ON "InvoiceReceiptLink"("claim_id");

-- CreateIndex
CREATE INDEX "InvoiceReceiptLink_invoice_id_idx" ON "InvoiceReceiptLink"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceReceiptLink_invoice_id_claim_id_key" ON "InvoiceReceiptLink"("invoice_id", "claim_id");

-- AddForeignKey
ALTER TABLE "InvoiceReceiptLink" ADD CONSTRAINT "InvoiceReceiptLink_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceReceiptLink" ADD CONSTRAINT "InvoiceReceiptLink_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
