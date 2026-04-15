-- CreateTable
CREATE TABLE "BankTransactionInvoice" (
    "id" TEXT NOT NULL,
    "bank_transaction_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "BankTransactionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankTransactionInvoice_invoice_id_idx" ON "BankTransactionInvoice"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransactionInvoice_bank_transaction_id_invoice_id_key" ON "BankTransactionInvoice"("bank_transaction_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "BankTransactionInvoice" ADD CONSTRAINT "BankTransactionInvoice_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionInvoice" ADD CONSTRAINT "BankTransactionInvoice_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing matched_invoice_id data to join table
INSERT INTO "BankTransactionInvoice" ("id", "bank_transaction_id", "invoice_id", "amount")
SELECT gen_random_uuid(), bt."id", bt."matched_invoice_id", COALESCE(bt."debit", bt."credit", 0)
FROM "BankTransaction" bt
WHERE bt."matched_invoice_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_matched_invoice_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "BankTransaction_matched_invoice_id_idx";

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN "matched_invoice_id";
