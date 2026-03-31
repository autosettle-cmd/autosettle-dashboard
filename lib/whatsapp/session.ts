import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/** Generate a short 4-hex-char key like "a1b2" */
export function generateReceiptKey(): string {
  return randomBytes(2).toString("hex");
}

export async function getSession(phone: string) {
  return prisma.session.findUnique({
    where: { phone },
  });
}

/**
 * Add a pending receipt to the session's receipt map.
 * Creates session if none exists; appends to map if one does.
 */
export async function addPendingReceipt(
  phone: string,
  key: string,
  receiptData: Record<string, unknown>
) {
  const existing = await prisma.session.findUnique({ where: { phone } });

  if (existing) {
    const currentMap =
      (existing.pending_receipt as Record<string, unknown>) || {};
    currentMap[key] = receiptData;
    return prisma.session.update({
      where: { id: existing.id },
      data: {
        state: "COLLECTING",
        pending_receipt: currentMap as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.session.create({
    data: {
      phone,
      state: "COLLECTING",
      step: null,
      pending_receipt: { [key]: receiptData } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Remove one receipt from the pending map.
 * Deletes the entire session when no receipts remain.
 * Returns true if session was deleted (map empty).
 */
export async function removePendingReceipt(
  phone: string,
  key: string
): Promise<boolean> {
  const session = await prisma.session.findUnique({ where: { phone } });
  if (!session) return true;

  const currentMap =
    (session.pending_receipt as Record<string, unknown>) || {};
  delete currentMap[key];

  if (Object.keys(currentMap).length === 0) {
    await prisma.session.delete({ where: { id: session.id } });
    return true;
  }

  // Clear correction step since we just resolved one receipt
  await prisma.session.update({
    where: { id: session.id },
    data: {
      pending_receipt: currentMap as Prisma.InputJsonValue,
      step: null,
    },
  });
  return false;
}

export async function updateSession(
  id: string,
  updates: { step?: string | null; pending_receipt?: Prisma.InputJsonValue }
) {
  return prisma.session.update({
    where: { id },
    data: updates,
  });
}

export async function deleteSession(id: string) {
  return prisma.session.delete({
    where: { id },
  });
}
