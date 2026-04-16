-- CreateTable
CREATE TABLE "BankTransactionClaim" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "claim_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BankTransactionClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransactionClaim_claim_id_idx" ON "BankTransactionClaim"("claim_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransactionClaim_bank_transaction_id_claim_id_key" ON "BankTransactionClaim"("bank_transaction_id", "claim_id");

-- AddForeignKey
ALTER TABLE "BankTransactionClaim" ADD CONSTRAINT "BankTransactionClaim_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionClaim" ADD CONSTRAINT "BankTransactionClaim_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;
