-- Add soft delete columns to Invoice, SalesInvoice, Claim, Payment
ALTER TABLE "Invoice" ADD COLUMN "deleted_at" TIMESTAMPTZ, ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "SalesInvoice" ADD COLUMN "deleted_at" TIMESTAMPTZ, ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "Claim" ADD COLUMN "deleted_at" TIMESTAMPTZ, ADD COLUMN "deleted_by" TEXT;
ALTER TABLE "Payment" ADD COLUMN "deleted_at" TIMESTAMPTZ, ADD COLUMN "deleted_by" TEXT;

-- Partial indexes for cron query performance (only index non-null deleted_at)
CREATE INDEX "Invoice_deleted_at_idx" ON "Invoice"("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "SalesInvoice_deleted_at_idx" ON "SalesInvoice"("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "Claim_deleted_at_idx" ON "Claim"("deleted_at") WHERE "deleted_at" IS NOT NULL;
CREATE INDEX "Payment_deleted_at_idx" ON "Payment"("deleted_at") WHERE "deleted_at" IS NOT NULL;

-- Swap SalesInvoice unique constraint to partial unique (active records only)
DROP INDEX "SalesInvoice_firm_id_invoice_number_key";
CREATE UNIQUE INDEX "SalesInvoice_firm_id_invoice_number_active" ON "SalesInvoice"("firm_id", "invoice_number") WHERE "deleted_at" IS NULL;

-- Regular index for Prisma query planner (non-unique, covers all rows)
CREATE INDEX "SalesInvoice_firm_id_invoice_number_idx" ON "SalesInvoice"("firm_id", "invoice_number");

-- Add soft_delete and restore to AuditAction enum
ALTER TYPE "AuditAction" ADD VALUE 'soft_delete';
ALTER TYPE "AuditAction" ADD VALUE 'restore';
