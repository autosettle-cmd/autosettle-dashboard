-- AlterEnum
ALTER TYPE "JournalSourceType" ADD VALUE 'sales_invoice_posting';

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "approval" "ApprovalStatus" NOT NULL DEFAULT 'pending_approval',
ADD COLUMN     "category_id" TEXT,
ADD COLUMN     "gl_account_id" TEXT;

-- CreateIndex
CREATE INDEX "SalesInvoice_firm_id_approval_idx" ON "SalesInvoice"("firm_id", "approval");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
