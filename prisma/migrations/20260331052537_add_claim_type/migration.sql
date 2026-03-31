-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('claim', 'receipt');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "type" "ClaimType" NOT NULL DEFAULT 'claim';
