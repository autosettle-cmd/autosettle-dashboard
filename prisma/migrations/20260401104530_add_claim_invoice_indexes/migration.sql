-- CreateIndex
CREATE INDEX "Claim_firm_id_type_claim_date_idx" ON "Claim"("firm_id", "type", "claim_date");

-- CreateIndex
CREATE INDEX "Claim_firm_id_type_status_idx" ON "Claim"("firm_id", "type", "status");

-- CreateIndex
CREATE INDEX "Claim_firm_id_claim_date_idx" ON "Claim"("firm_id", "claim_date");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_status_idx" ON "Invoice"("firm_id", "status");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_issue_date_idx" ON "Invoice"("firm_id", "issue_date");
