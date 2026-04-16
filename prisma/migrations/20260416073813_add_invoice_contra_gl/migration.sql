-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "contra_gl_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contra_gl_account_id_fkey" FOREIGN KEY ("contra_gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
