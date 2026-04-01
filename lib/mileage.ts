import { prisma } from './prisma';

export const DEFAULT_MILEAGE_RATE = 0.55; // RM per km (LHDN standard)

export function calculateMileageAmount(distanceKm: number, ratePerKm: number): number {
  return Math.round(distanceKm * ratePerKm * 100) / 100;
}

export async function getFirmMileageRate(firmId: string): Promise<number> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: { mileage_rate_per_km: true },
  });
  return firm?.mileage_rate_per_km ? Number(firm.mileage_rate_per_km) : DEFAULT_MILEAGE_RATE;
}
