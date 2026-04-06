-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense');

-- CreateEnum
CREATE TYPE "NormalBalance" AS ENUM ('Debit', 'Credit');

-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('open', 'closed', 'locked');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete');

-- DropForeignKey
ALTER TABLE "CategoryFirmOverride" DROP CONSTRAINT "CategoryFirmOverride_category_id_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT "PaymentAllocation_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "PaymentReceipt" DROP CONSTRAINT "PaymentReceipt_claim_id_fkey";

-- DropForeignKey
ALTER TABLE "PaymentReceipt" DROP CONSTRAINT "PaymentReceipt_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesPaymentAllocation" DROP CONSTRAINT "SalesPaymentAllocation_payment_id_fkey";

-- DropForeignKey
ALTER TABLE "SalesPaymentAllocation" DROP CONSTRAINT "SalesPaymentAllocation_sales_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "SupplierAlias" DROP CONSTRAINT "SupplierAlias_supplier_id_fkey";

-- AlterTable
ALTER TABLE "CategoryFirmOverride" ADD COLUMN     "gl_account_id" TEXT;

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "gl_account_id" TEXT,
ADD COLUMN     "tax_amount" DECIMAL(10,2),
ADD COLUMN     "tax_code_id" TEXT,
ADD COLUMN     "tax_rate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "gl_account_id" TEXT;

-- CreateTable
CREATE TABLE "GLAccount" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "normal_balance" "NormalBalance" NOT NULL,
    "parent_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GLAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "year_label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Period" (
    "id" TEXT NOT NULL,
    "fiscal_year_id" TEXT NOT NULL,
    "period_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "changed_fields" JSONB,
    "old_values" JSONB,
    "new_values" JSONB,
    "user_id" TEXT,
    "user_name" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "tax_type" TEXT NOT NULL,
    "gl_account_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GLAccount_firm_id_account_type_idx" ON "GLAccount"("firm_id", "account_type");

-- CreateIndex
CREATE INDEX "GLAccount_firm_id_is_active_idx" ON "GLAccount"("firm_id", "is_active");

-- CreateIndex
CREATE INDEX "GLAccount_parent_id_idx" ON "GLAccount"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "GLAccount_firm_id_account_code_key" ON "GLAccount"("firm_id", "account_code");

-- CreateIndex
CREATE INDEX "FiscalYear_firm_id_status_idx" ON "FiscalYear"("firm_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_firm_id_year_label_key" ON "FiscalYear"("firm_id", "year_label");

-- CreateIndex
CREATE INDEX "Period_fiscal_year_id_status_idx" ON "Period"("fiscal_year_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Period_fiscal_year_id_period_number_key" ON "Period"("fiscal_year_id", "period_number");

-- CreateIndex
CREATE INDEX "AuditLog_firm_id_table_name_timestamp_idx" ON "AuditLog"("firm_id", "table_name", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_firm_id_record_id_idx" ON "AuditLog"("firm_id", "record_id");

-- CreateIndex
CREATE INDEX "TaxCode_firm_id_is_active_idx" ON "TaxCode"("firm_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_firm_id_code_key" ON "TaxCode"("firm_id", "code");

-- AddForeignKey
ALTER TABLE "CategoryFirmOverride" ADD CONSTRAINT "CategoryFirmOverride_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryFirmOverride" ADD CONSTRAINT "CategoryFirmOverride_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_tax_code_id_fkey" FOREIGN KEY ("tax_code_id") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAlias" ADD CONSTRAINT "SupplierAlias_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPaymentAllocation" ADD CONSTRAINT "SalesPaymentAllocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPaymentAllocation" ADD CONSTRAINT "SalesPaymentAllocation_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GLAccount" ADD CONSTRAINT "GLAccount_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GLAccount" ADD CONSTRAINT "GLAccount_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Period" ADD CONSTRAINT "Period_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "GLAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
