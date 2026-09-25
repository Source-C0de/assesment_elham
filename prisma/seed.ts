/**
 * Prisma seed: creates ten fixed appointment slots on 2030-01-15 UTC, 30 minutes each.
 * Idempotent: if slots already exist (by startsAt), they are skipped.
 * The first slot is pinned to the spec's example UUID so manual smoke tests
 * match the documentation.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST_SLOT_ID = '11111111-1111-4111-8111-111111111111';

async function main(): Promise<void> {
  const baseHour = 9;
  const slots = Array.from({ length: 10 }, (_, i) => {
    const startsAt = new Date(Date.UTC(2030, 0, 15, baseHour + i, 0, 0, 0));
    const endsAt = new Date(Date.UTC(2030, 0, 15, baseHour + i, 30, 0, 0));
    const id = i === 0 ? FIRST_SLOT_ID : undefined;
    return { index: i, startsAt, endsAt, id };
  });

  for (const slot of slots) {
    const existing = await prisma.slot.findFirst({ where: { startsAt: slot.startsAt } });
    if (existing) {
      // If the first slot exists but with a different UUID, do not clobber it.
      continue;
    }
    const created = await prisma.slot.create({
      data: { startsAt: slot.startsAt, endsAt: slot.endsAt },
    });
    if (slot.id && slot.id !== created.id) {
      // Pin the first slot to the canonical example UUID.
      await prisma.slot.update({ where: { id: created.id }, data: { id: slot.id } });
    }
  }

  const count = await prisma.slot.count();
  console.log(`Seed complete. Total slots: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
