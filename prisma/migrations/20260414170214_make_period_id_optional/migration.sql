-- DropForeignKey
ALTER TABLE "JournalEntry" DROP CONSTRAINT "JournalEntry_period_id_fkey";

-- AlterTable
ALTER TABLE "JournalEntry" ALTER COLUMN "period_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "Period"("id") ON DELETE SET NULL ON UPDATE CASCADE;
