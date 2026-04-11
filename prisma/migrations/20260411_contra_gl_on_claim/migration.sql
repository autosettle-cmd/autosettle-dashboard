-- AlterTable: Store contra GL account on claim for revert/re-approve persistence
ALTER TABLE "Claim" ADD COLUMN "contra_gl_account_id" TEXT;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_contra_gl_account_id_fkey" FOREIGN KEY ("contra_gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
