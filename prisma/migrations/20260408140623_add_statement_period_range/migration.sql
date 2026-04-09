-- AlterTable
ALTER TABLE "BankStatement" ADD COLUMN     "period_end" DATE,
ADD COLUMN     "period_start" DATE;

-- CreateIndex
CREATE INDEX "BankStatement_firm_id_account_number_idx" ON "BankStatement"("firm_id", "account_number");
