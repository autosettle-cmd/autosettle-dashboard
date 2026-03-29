-- CreateTable
CREATE TABLE "AccountantFirm" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountantFirm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountantFirm_user_id_firm_id_key" ON "AccountantFirm"("user_id", "firm_id");

-- AddForeignKey
ALTER TABLE "AccountantFirm" ADD CONSTRAINT "AccountantFirm_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantFirm" ADD CONSTRAINT "AccountantFirm_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
