-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "default_trade_receivables_gl_id" TEXT;

-- AddForeignKey
ALTER TABLE "Firm" ADD CONSTRAINT "Firm_default_trade_receivables_gl_id_fkey" FOREIGN KEY ("default_trade_receivables_gl_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
