-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('unmatched', 'matched', 'manually_matched', 'excluded');

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT,
    "statement_date" DATE NOT NULL,
    "opening_balance" DECIMAL(12,2),
    "closing_balance" DECIMAL(12,2),
    "file_name" TEXT NOT NULL,
    "file_hash" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "bank_statement_id" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "cheque_number" TEXT,
    "debit" DECIMAL(12,2),
    "credit" DECIMAL(12,2),
    "balance" DECIMAL(12,2),
    "recon_status" "ReconStatus" NOT NULL DEFAULT 'unmatched',
    "matched_payment_id" TEXT,
    "matched_at" TIMESTAMP(3),
    "matched_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_file_hash_key" ON "BankStatement"("file_hash");

-- CreateIndex
CREATE INDEX "BankStatement_firm_id_statement_date_idx" ON "BankStatement"("firm_id", "statement_date");

-- CreateIndex
CREATE INDEX "BankTransaction_bank_statement_id_recon_status_idx" ON "BankTransaction"("bank_statement_id", "recon_status");

-- CreateIndex
CREATE INDEX "BankTransaction_matched_payment_id_idx" ON "BankTransaction"("matched_payment_id");

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bank_statement_id_fkey" FOREIGN KEY ("bank_statement_id") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matched_payment_id_fkey" FOREIGN KEY ("matched_payment_id") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
