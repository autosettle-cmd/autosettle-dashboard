-- AlterTable: Add message_id for webhook idempotency
ALTER TABLE "MessageLog" ADD COLUMN "message_id" TEXT;

-- CreateIndex: Webhook idempotency lookup
CREATE UNIQUE INDEX "MessageLog_message_id_key" ON "MessageLog"("message_id");

-- CreateIndex: Claim queries by approval, payment status, employee
CREATE INDEX "Claim_firm_id_approval_idx" ON "Claim"("firm_id", "approval");
CREATE INDEX "Claim_firm_id_payment_status_idx" ON "Claim"("firm_id", "payment_status");
CREATE INDEX "Claim_employee_id_claim_date_idx" ON "Claim"("employee_id", "claim_date");

-- CreateIndex: Bank transaction date queries
CREATE INDEX "BankTransaction_bank_statement_id_transaction_date_idx" ON "BankTransaction"("bank_statement_id", "transaction_date");
