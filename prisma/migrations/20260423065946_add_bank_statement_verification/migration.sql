-- AlterTable
ALTER TABLE "BankStatement" ADD COLUMN     "balance_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "balance_override_at" TIMESTAMP(3),
ADD COLUMN     "balance_override_by" TEXT,
ADD COLUMN     "verification_issues" JSONB;
