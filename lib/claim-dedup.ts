import { prisma } from '@/lib/prisma';

interface ClaimDedupParams {
  firmId: string;
  employeeId: string;
  claimDate: Date;
  merchant: string;
  amount: number;
  receiptNumber?: string | null;
  type: 'claim' | 'receipt' | 'mileage';
  // Mileage-specific fields
  fromLocation?: string | null;
  toLocation?: string | null;
  distanceKm?: number | null;
}

interface DedupResult {
  isDuplicate: boolean;
  message?: string;
}

/**
 * Check for duplicate claims before creation.
 *
 * For claims/receipts:
 * - If receipt_number provided, check for exact match in firm
 * - Always check composite: (firm_id, employee_id, claim_date, merchant, amount)
 *
 * For mileage:
 * - Check composite: (firm_id, employee_id, claim_date, from_location, to_location, distance_km)
 */
export async function checkClaimDuplicate(params: ClaimDedupParams): Promise<DedupResult> {
  const { firmId, employeeId, claimDate, merchant, amount, receiptNumber, type, fromLocation, toLocation, distanceKm } = params;

  // Normalize date to start of day for comparison
  const dateStart = new Date(claimDate);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(claimDate);
  dateEnd.setHours(23, 59, 59, 999);

  if (type === 'mileage') {
    // Mileage dedup: same employee, date, route, and distance
    if (!fromLocation || !toLocation || !distanceKm) {
      return { isDuplicate: false };
    }

    const existing = await prisma.claim.findFirst({
      where: {
        firm_id: firmId,
        employee_id: employeeId,
        type: 'mileage',
        claim_date: { gte: dateStart, lte: dateEnd },
        from_location: fromLocation,
        to_location: toLocation,
        distance_km: distanceKm,
      },
      select: { id: true, trip_purpose: true },
    });

    if (existing) {
      return {
        isDuplicate: true,
        message: `Duplicate: mileage claim for ${fromLocation} → ${toLocation} (${distanceKm}km) on this date already exists${existing.trip_purpose ? ` (${existing.trip_purpose})` : ''}`,
      };
    }

    return { isDuplicate: false };
  }

  // Receipt/claim dedup

  // 1. Check receipt_number if provided
  if (receiptNumber) {
    const existing = await prisma.claim.findFirst({
      where: {
        firm_id: firmId,
        receipt_number: receiptNumber,
      },
      select: { id: true, merchant: true, claim_date: true },
    });

    if (existing) {
      const dateStr = existing.claim_date.toISOString().split('T')[0];
      return {
        isDuplicate: true,
        message: `Duplicate: receipt #${receiptNumber} already exists (${existing.merchant}, ${dateStr})`,
      };
    }
  }

  // 2. Check composite key: employee + date + merchant + amount
  const existing = await prisma.claim.findFirst({
    where: {
      firm_id: firmId,
      employee_id: employeeId,
      claim_date: { gte: dateStart, lte: dateEnd },
      merchant: { equals: merchant, mode: 'insensitive' },
      amount: amount,
      type: { in: ['claim', 'receipt'] },
    },
    select: { id: true, receipt_number: true },
  });

  if (existing) {
    return {
      isDuplicate: true,
      message: `Duplicate: claim for ${merchant} (RM${amount.toFixed(2)}) on this date already exists${existing.receipt_number ? ` (#${existing.receipt_number})` : ''}`,
    };
  }

  return { isDuplicate: false };
}
