-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('accountant', 'admin', 'employee');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'paid');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('pending_review', 'reviewed');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending_approval', 'approved', 'not_approved');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'paid');

-- CreateEnum
CREATE TYPE "SubmittedVia" AS ENUM ('whatsapp', 'dashboard');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('IDLE', 'COLLECTING');

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registration_number" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "receipt_count" INTEGER NOT NULL DEFAULT 0,
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "firm_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "firm_id" TEXT,
    "employee_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tax_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "claim_date" DATE NOT NULL,
    "merchant" TEXT NOT NULL,
    "description" TEXT,
    "receipt_number" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "category_id" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'pending_review',
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'pending_approval',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "rejection_reason" TEXT,
    "file_url" TEXT,
    "file_download_url" TEXT,
    "thumbnail_url" TEXT,
    "submitted_via" "SubmittedVia" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "firm_id" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "receipt_date" DATE NOT NULL,
    "merchant" TEXT NOT NULL,
    "receipt_number" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "category_id" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'pending_approval',
    "file_url" TEXT,
    "file_download_url" TEXT,
    "thumbnail_url" TEXT,
    "submitted_via" "SubmittedVia" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'IDLE',
    "step" TEXT,
    "intent" TEXT,
    "pending_receipt" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_phone_key" ON "Employee"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_firm_id_name_key" ON "Category"("firm_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_phone_key" ON "Session"("phone");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_firm_id_fkey" FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
