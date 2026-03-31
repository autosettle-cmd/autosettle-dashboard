-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending_review', 'reviewed');

-- CreateEnum
CREATE TYPE "InvoicePaymentStatus" AS ENUM ('unpaid', 'partially_paid', 'paid');

-- CreateEnum
CREATE TYPE "SupplierLinkStatus" AS ENUM ('auto_matched', 'unmatched', 'confirmed');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAlias" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "supplier_id" TEXT,
    "supplier_link_status" "SupplierLinkStatus" NOT NULL DEFAULT 'unmatched',
    "vendor_name_raw" TEXT NOT NULL,
    "invoice_number" TEXT,
    "issue_date" DATE NOT NULL,
    "due_date" DATE,
    "payment_terms" TEXT,
    "subtotal" DECIMAL(10,2),
    "tax_amount" DECIMAL(10,2),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "category_id" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending_review',
    "payment_status" "InvoicePaymentStatus" NOT NULL DEFAULT 'unpaid',
    "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "file_url" TEXT,
    "file_download_url" TEXT,
    "thumbnail_url" TEXT,
    "submitted_via" "SubmittedVia" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_firm_id_name_key" ON "Supplier"("firm_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAlias_supplier_id_alias_key" ON "SupplierAlias"("supplier_id", "alias");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAlias" ADD CONSTRAINT "SupplierAlias_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
