-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_firm_id_fkey";

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "firm_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CategoryFirmOverride" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryFirmOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryFirmOverride_category_id_firm_id_key" ON "CategoryFirmOverride"("category_id", "firm_id");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryFirmOverride" ADD CONSTRAINT "CategoryFirmOverride_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryFirmOverride" ADD CONSTRAINT "CategoryFirmOverride_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
