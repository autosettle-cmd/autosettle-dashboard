import { prisma } from "@/lib/prisma";

export async function lookupEmployeeByPhone(phone: string) {
  const employee = await prisma.employee.findUnique({
    where: { phone, is_active: true },
    include: {
      firm: {
        select: {
          id: true,
          name: true,
        },
      },
      users: {
        select: { id: true, role: true },
        take: 1,
      },
    },
  });

  if (!employee) return null;

  return {
    id: employee.id,
    name: employee.name,
    phone: employee.phone,
    email: employee.email,
    firmId: employee.firm.id,
    firmName: employee.firm.name,
    userId: employee.users[0]?.id ?? null,
    role: employee.users[0]?.role ?? "employee",
  };
}

export type EmployeeInfo = NonNullable<
  Awaited<ReturnType<typeof lookupEmployeeByPhone>>
>;
