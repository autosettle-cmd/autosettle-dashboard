import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

export async function getSession(phone: string) {
  return prisma.session.findUnique({
    where: { phone },
  });
}

export async function createSession(
  phone: string,
  pendingData: Prisma.InputJsonValue
) {
  // Only one session per phone — delete existing if any
  await prisma.session.deleteMany({ where: { phone } });

  return prisma.session.create({
    data: {
      phone,
      state: "COLLECTING",
      step: "AWAITING_CONFIRMATION",
      pending_receipt: pendingData,
    },
  });
}

export async function updateSession(
  id: string,
  updates: { step?: string; pending_receipt?: Prisma.InputJsonValue }
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
