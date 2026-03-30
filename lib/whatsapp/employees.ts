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
  };
}

export type EmployeeInfo = NonNullable<
  Awaited<ReturnType<typeof lookupEmployeeByPhone>>
>;
