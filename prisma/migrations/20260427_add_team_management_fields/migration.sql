-- CreateEnum
CREATE TYPE "AccountantFirmRole" AS ENUM ('owner', 'member');

-- AlterTable: Add role to AccountantFirm
ALTER TABLE "AccountantFirm" ADD COLUMN "role" "AccountantFirmRole" NOT NULL DEFAULT 'member';

-- AlterTable: Add invite fields to User
ALTER TABLE "User" ADD COLUMN "invite_token" TEXT;
ALTER TABLE "User" ADD COLUMN "invite_token_expires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "invited_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_invite_token_key" ON "User"("invite_token");

-- Data migration: set all existing AccountantFirm rows to owner
UPDATE "AccountantFirm" SET "role" = 'owner';
