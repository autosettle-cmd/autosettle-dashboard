-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "drive_bank_statements_folder_id" TEXT,
ADD COLUMN     "drive_claims_folder_id" TEXT,
ADD COLUMN     "drive_invoices_folder_id" TEXT,
ADD COLUMN     "drive_root_folder_id" TEXT;
