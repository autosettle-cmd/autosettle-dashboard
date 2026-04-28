/*
  Warnings:

  - You are about to drop the column `matched_sales_invoice_id` on the `BankTransaction` table. All the data in the column will be lost.
  - You are about to drop the `SalesInvoice` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SalesInvoiceItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SalesPaymentAllocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BankTransaction" DROP CONSTRAINT "BankTransaction_matched_sales_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_category_id_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_category_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_created_by_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_firm_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_gl_account_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoice" DROP CONSTRAINT "SalesInvoice_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesInvoiceItem" DROP CONSTRAINT "SalesInvoiceItem_sales_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesPaymentAllocation" DROP CONSTRAINT "SalesPaymentAllocation_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesPaymentAllocation" DROP CONSTRAINT "SalesPaymentAllocation_sales_invoice_id_fkey";

-- DropIndex
DROP INDEX "BankTransaction_matched_sales_invoice_id_idx";

-- AlterTable
ALTER TABLE "BankTransaction" DROP COLUMN "matched_sales_invoice_id",
ADD COLUMN     "matched_invoice_id" TEXT;

-- AlterTable
ALTER TABLE "Claim" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'MYR',
ADD COLUMN     "doc_subtype" TEXT,
ADD COLUMN     "lhdn_document_uuid" TEXT,
ADD COLUMN     "lhdn_error" TEXT,
ADD COLUMN     "lhdn_long_id" TEXT,
ADD COLUMN     "lhdn_qr_url" TEXT,
ADD COLUMN     "lhdn_status" "LhdnStatus",
ADD COLUMN     "lhdn_submission_uid" TEXT,
ADD COLUMN     "lhdn_submitted_at" TIMESTAMP(3),
ADD COLUMN     "lhdn_validated_at" TIMESTAMP(3),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'purchase',
ALTER COLUMN "uploaded_by" DROP NOT NULL,
ALTER COLUMN "vendor_name_raw" DROP NOT NULL,
ALTER COLUMN "category_id" DROP NOT NULL,
ALTER COLUMN "confidence" DROP NOT NULL,
ALTER COLUMN "submitted_via" DROP NOT NULL,
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_type" TEXT;

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3);

-- DropTable
DROP TABLE "SalesInvoice";

-- DropTable
DROP TABLE "SalesInvoiceItem";

-- DropTable
DROP TABLE "SalesPaymentAllocation";

-- CreateIndex
CREATE INDEX "BankTransaction_matched_invoice_id_idx" ON "BankTransaction"("matched_invoice_id");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_type_idx" ON "Invoice"("firm_id", "type");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_lhdn_status_idx" ON "Invoice"("firm_id", "lhdn_status");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_invoice_number_idx" ON "Invoice"("firm_id", "invoice_number");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_matched_invoice_id_fkey" FOREIGN KEY ("matched_invoice_id") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
