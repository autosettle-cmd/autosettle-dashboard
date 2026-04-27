-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "file_download_url" TEXT,
ADD COLUMN     "file_hash" TEXT,
ADD COLUMN     "file_url" TEXT,
ADD COLUMN     "thumbnail_url" TEXT;
