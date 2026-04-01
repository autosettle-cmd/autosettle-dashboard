-- AlterEnum
ALTER TYPE "ClaimType" ADD VALUE 'mileage';

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "distance_km" DECIMAL(8,2),
ADD COLUMN     "from_location" TEXT,
ADD COLUMN     "to_location" TEXT,
ADD COLUMN     "trip_purpose" TEXT;

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "mileage_rate_per_km" DECIMAL(4,2);
