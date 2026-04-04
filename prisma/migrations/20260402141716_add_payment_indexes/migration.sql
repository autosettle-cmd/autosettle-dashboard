-- CreateIndex
CREATE INDEX "Payment_supplier_id_direction_payment_date_idx" ON "Payment"("supplier_id", "direction", "payment_date");

-- CreateIndex
CREATE INDEX "Payment_firm_id_payment_date_idx" ON "Payment"("firm_id", "payment_date");

-- CreateIndex
CREATE INDEX "PaymentReceipt_claim_id_idx" ON "PaymentReceipt"("claim_id");
