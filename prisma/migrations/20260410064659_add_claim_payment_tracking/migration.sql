-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'partially_paid';

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_supplier_id_fkey";

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "employee_id" TEXT,
ALTER COLUMN "supplier_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PaymentReceipt" ADD COLUMN     "amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Payment_employee_id_payment_date_idx" ON "Payment"("employee_id", "payment_date");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
