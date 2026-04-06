-- CreateIndex
CREATE INDEX "Category_firm_id_idx" ON "Category"("firm_id");

-- CreateIndex
CREATE INDEX "Employee_firm_id_idx" ON "Employee"("firm_id");

-- CreateIndex
CREATE INDEX "Invoice_supplier_id_idx" ON "Invoice"("supplier_id");

-- CreateIndex
CREATE INDEX "Invoice_firm_id_payment_status_idx" ON "Invoice"("firm_id", "payment_status");

-- CreateIndex
CREATE INDEX "MessageLog_employee_id_idx" ON "MessageLog"("employee_id");

-- CreateIndex
CREATE INDEX "PaymentAllocation_invoice_id_idx" ON "PaymentAllocation"("invoice_id");

-- CreateIndex
CREATE INDEX "SalesPaymentAllocation_sales_invoice_id_idx" ON "SalesPaymentAllocation"("sales_invoice_id");

-- CreateIndex
CREATE INDEX "Supplier_firm_id_idx" ON "Supplier"("firm_id");

-- CreateIndex
CREATE INDEX "SupplierAlias_supplier_id_idx" ON "SupplierAlias"("supplier_id");

-- CreateIndex
CREATE INDEX "User_firm_id_idx" ON "User"("firm_id");
