-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('posted', 'reversed');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('claim_approval', 'invoice_posting', 'bank_recon', 'manual');

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "default_staff_claims_gl_id" TEXT,
ADD COLUMN     "default_trade_payables_gl_id" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "gl_posted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gl_posted_at" TIMESTAMP(3),
ADD COLUMN     "gl_posted_by" TEXT;

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "gl_account_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "voucher_number" TEXT NOT NULL,
    "posting_date" DATE NOT NULL,
    "period_id" TEXT NOT NULL,
    "description" TEXT,
    "source_type" "JournalSourceType" NOT NULL,
    "source_id" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'posted',
    "reversed_by_id" TEXT,
    "reversal_of_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "gl_account_id" TEXT NOT NULL,
    "debit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankAccount_firm_id_idx" ON "BankAccount"("firm_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_firm_id_bank_name_account_number_key" ON "BankAccount"("firm_id", "bank_name", "account_number");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversed_by_id_key" ON "JournalEntry"("reversed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversal_of_id_key" ON "JournalEntry"("reversal_of_id");

-- CreateIndex
CREATE INDEX "JournalEntry_firm_id_posting_date_idx" ON "JournalEntry"("firm_id", "posting_date");

-- CreateIndex
CREATE INDEX "JournalEntry_firm_id_source_type_source_id_idx" ON "JournalEntry"("firm_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "JournalEntry_period_id_idx" ON "JournalEntry"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_firm_id_voucher_number_key" ON "JournalEntry"("firm_id", "voucher_number");

-- CreateIndex
CREATE INDEX "JournalLine_journal_entry_id_idx" ON "JournalLine"("journal_entry_id");

-- CreateIndex
CREATE INDEX "JournalLine_gl_account_id_idx" ON "JournalLine"("gl_account_id");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_gl_posted_idx" ON "Invoice"("firm_id", "gl_posted");

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_default_trade_payables_gl_id_fkey" FOREIGN KEY ("default_trade_payables_gl_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_default_staff_claims_gl_id_fkey" FOREIGN KEY ("default_staff_claims_gl_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "Period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversed_by_id_fkey" FOREIGN KEY ("reversed_by_id") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
