-- AlterTable: Replace gl_posted with approval on Invoice
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "gl_posted";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "gl_posted_at";
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "gl_posted_by";

ALTER TABLE "Invoice" ADD COLUMN "approval" "ApprovalStatus" NOT NULL DEFAULT 'pending_approval';
ALTER TABLE "Invoice" ADD COLUMN "rejection_reason" TEXT;

-- CreateIndex
DROP INDEX IF EXISTS "Invoice_firm_id_gl_posted_idx";
CREATE INDEX "Invoice_firm_id_approval_idx" ON "Invoice"("firm_id", "approval");
