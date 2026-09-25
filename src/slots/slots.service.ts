import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SlotDto } from './dto/slot.dto';

/**
 * Returns slots with no active booking, ordered by startsAt ASC, id ASC.
 * Uses a NOT EXISTS correlated subquery — supported by the (slot_id, status) index.
 */
@Injectable()
export class SlotsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailable(): Promise<SlotDto[]> {
    const rows = await this.prisma.slot.findMany({
      where: {
        bookings: {
          none: { status: 'active' },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: { id: true, startsAt: true, endsAt: true },
    });

    return rows.map((r) => ({
      id: r.id,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
    }));
  }
}
