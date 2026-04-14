-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "default_contra_gl_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_default_contra_gl_account_id_fkey" FOREIGN KEY ("default_contra_gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
