-- CreateEnum
CREATE TYPE "LhdnStatus" AS ENUM ('draft', 'pending', 'valid', 'invalid', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentDirection" AS ENUM ('outgoing', 'incoming');

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "address_line1" TEXT,
ADD COLUMN     "address_line2" TEXT,
ADD COLUMN     "brn" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'MYS',
ADD COLUMN     "lhdn_client_id" TEXT,
ADD COLUMN     "lhdn_client_secret" TEXT,
ADD COLUMN     "msic_code" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "sst_registration_number" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "tin" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "direction" "PaymentDirection" NOT NULL DEFAULT 'outgoing';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "address_line1" TEXT,
ADD COLUMN     "address_line2" TEXT,
ADD COLUMN     "brn" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT DEFAULT 'MYS',
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "sst_registration_number" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "tin" TEXT;

-- CreateTable
CREATE TABLE "SalesInvoice" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "created_by" TEXT,
    "invoice_number" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "payment_status" "InvoicePaymentStatus" NOT NULL DEFAULT 'unpaid',
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "lhdn_submission_uid" TEXT,
    "lhdn_document_uuid" TEXT,
    "lhdn_long_id" TEXT,
    "lhdn_status" "LhdnStatus" NOT NULL DEFAULT 'draft',
    "lhdn_qr_url" TEXT,
    "lhdn_submitted_at" TIMESTAMP(3),
    "lhdn_validated_at" TIMESTAMP(3),
    "lhdn_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInvoiceItem" (
    "id" TEXT NOT NULL,
    "sales_invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "tax_type" TEXT,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPaymentAllocation" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "sales_invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SalesPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesInvoice_firm_id_issue_date_idx" ON "SalesInvoice"("firm_id", "issue_date");

-- CreateIndex
CREATE INDEX "SalesInvoice_firm_id_lhdn_status_idx" ON "SalesInvoice"("firm_id", "lhdn_status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInvoice_firm_id_invoice_number_key" ON "SalesInvoice"("firm_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesPaymentAllocation_payment_id_sales_invoice_id_key" ON "SalesPaymentAllocation"("payment_id", "sales_invoice_id");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInvoiceItem" ADD CONSTRAINT "SalesInvoiceItem_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "SalesInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPaymentAllocation" ADD CONSTRAINT "SalesPaymentAllocation_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPaymentAllocation" ADD CONSTRAINT "SalesPaymentAllocation_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
