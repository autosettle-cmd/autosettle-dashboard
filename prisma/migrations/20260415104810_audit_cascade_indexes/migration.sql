-- DropForeignKey
ALTER TABLE "AccountantFirm" DROP CONSTRAINT "AccountantFirm_firm_id_fkey";

-- DropForeignKey
ALTER TABLE "AccountantFirm" DROP CONSTRAINT "AccountantFirm_user_id_fkey";

-- CreateIndex
CREATE INDEX "Invoice_uploaded_by_idx" ON "Invoice"("uploaded_by");

-- CreateIndex
CREATE INDEX "MessageLog_phone_employee_id_idx" ON "MessageLog"("phone", "employee_id");

-- CreateIndex
CREATE INDEX "SalesInvoice_created_by_idx" ON "SalesInvoice"("created_by");

-- AddForeignKey
ALTER TABLE "AccountantFirm" ADD CONSTRAINT "AccountantFirm_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantFirm" ADD CONSTRAINT "AccountantFirm_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
