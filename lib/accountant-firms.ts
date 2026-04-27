import { prisma } from "./prisma";

// Simple in-memory cache: userId → { firmIds, expiresAt }
const firmIdsCache = new Map<string, { firmIds: string[] | null; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Returns the firm IDs an accountant is assigned to.
 * If the accountant has no assignments, returns null (super admin — sees everything).
 * Results are cached for 30s to avoid redundant DB lookups on the same request cycle.
 */
export async function getAccountantFirmIds(
  userId: string
): Promise<string[] | null> {
  const cached = firmIdsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.firmIds;
  }

  const assignments = await prisma.accountantFirm.findMany({
    where: { user_id: userId },
    select: { firm_id: true },
  });

  const firmIds = assignments.length === 0 ? null : assignments.map((a) => a.firm_id);
  firmIdsCache.set(userId, { firmIds, expiresAt: Date.now() + CACHE_TTL_MS });
  return firmIds;
}

/**
 * Returns a Prisma `where` clause fragment to scope queries by firm.
 * - If firmIds is null (super admin), returns {} (no filter).
 * - If a specific firmId is selected AND it's in the allowed list, scopes to that firm.
 * - Otherwise scopes to all assigned firms.
 */
export function firmScope(
  firmIds: string[] | null,
  selectedFirmId?: string | null
): { firm_id?: string | { in: string[] } } {
  if (selectedFirmId) {
    if (!firmIds || firmIds.includes(selectedFirmId)) {
      return { firm_id: selectedFirmId };
    }
    return { firm_id: "__blocked__" };
  }

  if (!firmIds) return {};
  return { firm_id: { in: firmIds } };
}

/**
 * Returns true if the accountant is an owner (has any AccountantFirm with role='owner').
 */
export async function isAccountantOwner(userId: string): Promise<boolean> {
  const ownerRecord = await prisma.accountantFirm.findFirst({
    where: { user_id: userId, role: 'owner' },
  });
  return !!ownerRecord;
}
