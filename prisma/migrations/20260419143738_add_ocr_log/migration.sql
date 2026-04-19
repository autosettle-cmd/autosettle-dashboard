-- CreateTable
CREATE TABLE "OcrLog" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT,
    "file_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "confidence" TEXT,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "processing_ms" INTEGER,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OcrLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcrLog_created_at_idx" ON "OcrLog"("created_at");

-- CreateIndex
CREATE INDEX "OcrLog_firm_id_created_at_idx" ON "OcrLog"("firm_id", "created_at");

-- CreateIndex
CREATE INDEX "OcrLog_success_created_at_idx" ON "OcrLog"("success", "created_at");

-- AddForeignKey
ALTER TABLE "OcrLog" ADD CONSTRAINT "OcrLog_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
