-- Add soft-delete fields to BankStatement
ALTER TABLE "BankStatement" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "BankStatement" ADD COLUMN "deleted_by" TEXT;

-- Index for Period date range lookups
CREATE INDEX IF NOT EXISTS "Period_start_date_end_date_idx" ON "Period"("start_date", "end_date");

-- Index for MessageLog received_at sorting
CREATE INDEX IF NOT EXISTS "MessageLog_received_at_idx" ON "MessageLog"("received_at");

-- Index for SalesInvoiceItem FK lookups
CREATE INDEX IF NOT EXISTS "SalesInvoiceItem_sales_invoice_id_idx" ON "SalesInvoiceItem"("sales_invoice_id");
