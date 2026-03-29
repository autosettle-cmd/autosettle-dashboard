import { prisma } from "./prisma";

/**
 * Returns the firm IDs an accountant is assigned to.
 * If the accountant has no assignments, returns null (super admin — sees everything).
 */
export async function getAccountantFirmIds(
  userId: string
): Promise<string[] | null> {
  const assignments = await prisma.accountantFirm.findMany({
    where: { user_id: userId },
    select: { firm_id: true },
  });

  if (assignments.length === 0) return null;
  return assignments.map((a) => a.firm_id);
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
