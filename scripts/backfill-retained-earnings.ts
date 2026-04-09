import { prisma } from '../lib/prisma';

async function main() {
  const firms = await prisma.firm.findMany({
    where: { default_retained_earnings_gl_id: null },
    select: { id: true, name: true },
  });

  let updated = 0;
  for (const firm of firms) {
    const reAccount = await prisma.gLAccount.findFirst({
      where: { firm_id: firm.id, account_code: '320-000' },
      select: { id: true },
    });
    if (reAccount) {
      await prisma.firm.update({
        where: { id: firm.id },
        data: { default_retained_earnings_gl_id: reAccount.id },
      });
      console.log('Set retained earnings default for:', firm.name);
      updated++;
    }
  }
  console.log('Done. Updated', updated, 'firms.');
  await prisma.$disconnect();
}

main();
