-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'pending_onboarding', 'rejected', 'inactive');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active';
