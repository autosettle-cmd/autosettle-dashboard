-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "employee_id" TEXT,
    "message_type" TEXT NOT NULL,
    "ocr_confidence" TEXT,
    "processing_ms" INTEGER,
    "error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
