import { Injectable, Logger } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import {
  BookingNotFoundException,
  SlotNotFoundException,
  SlotUnavailableException,
} from '../common/exceptions';
import { PrismaService } from '../common/prisma/prisma.service';
import { BookingsGateway } from './bookings.gateway';
import { CreateBookingDto } from './dto/create-booking.dto';

/**
 * Application service for booking lifecycle.
 *
 * Concurrency model for POST /bookings (defense in depth):
 *
 *   Layer 1 — Postgres partial unique index `one_active_booking_per_slot`
 *     A UNIQUE index on bookings(slot_id) WHERE status='active' is the ultimate
 *     source of truth: the database physically refuses to have two active rows
 *     for the same slot. We never rely solely on application code.
 *
 *   Layer 2 — SERIALIZABLE transaction with predicate locking
 *     Postgres SERIALIZABLE adds predicate-lock tracking. Two concurrent
 *     transactions that both observe "no active booking" and then both INSERT
 *     cannot both commit: one will fail at commit with a 40001 serialization
 *     failure (Prisma: P2034). We retry such failures once; if still conflict,
 *     return 409.
 *
 *   Layer 3 — Pre-check inside the transaction
 *     Before inserting, we re-check for an existing active booking under the
 *     same transaction. This produces a clean 409 response in the common case
 *     (most requests are not racing; only one is "first").
 *
 *   The combination guarantees:
 *     - Under no concurrency: exactly one 201, then any subsequent attempt -> 409.
 *     - Under two simultaneous valid requests: exactly one 201, exactly one 409,
 *       exactly one persisted active booking.
 *
 * For DELETE /bookings/{id}, cancellation is idempotent: repeated cancel on an
 * already-cancelled booking returns 200 with the same row and emits NO event.
 */
@Injectable()
export class BookingsService {
  private readonly logger = new Logger('BookingsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: BookingsGateway,
  ) {}

  async create(input: CreateBookingDto): Promise<Booking> {
    const isRetryable = (err: unknown): boolean =>
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === 'P2034' || err.code === 'P2002');

    const attempt = async (): Promise<Booking> =>
      this.prisma.$transaction(
        async (tx) => {
          const slot = await tx.slot.findUnique({
            where: { id: input.slotId },
            select: { id: true },
          });
          if (!slot) throw new SlotNotFoundException();

          const active = await tx.booking.findFirst({
            where: { slotId: input.slotId, status: 'active' },
            select: { id: true },
          });
          if (active) throw new SlotUnavailableException();

          try {
            return await tx.booking.create({
              data: {
                slotId: input.slotId,
                customerName: input.customerName,
                customerEmail: input.customerEmail,
                status: 'active',
              },
            });
          } catch (err) {
            if (
              err instanceof Prisma.PrismaClientKnownRequestError &&
              err.code === 'P2002'
            ) {
              throw new SlotUnavailableException();
            }
            throw err;
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

    let created: Booking;
    try {
      created = await attempt();
    } catch (err) {
      if (isRetryable(err)) {
        try {
          created = await attempt();
        } catch (err2) {
          if (isRetryable(err2)) throw new SlotUnavailableException();
          throw err2;
        }
      } else {
        throw err;
      }
    }

    // Broadcast ONLY after the transaction commits.
    this.gateway.emitSlotBooked(created.slotId, created.id);

    return created;
  }

  async cancel(id: string): Promise<{ booking: Booking; changed: boolean }> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new BookingNotFoundException();
    }

    // Repeated cancellation: no DB write, no event, return same row.
    if (booking.status === 'cancelled') {
      return { booking, changed: false };
    }

    const cancelled = await this.prisma.booking.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Broadcast ONLY when state actually changed.
    this.gateway.emitSlotReleased(cancelled.slotId, cancelled.id);

    return { booking: cancelled, changed: true };
  }
}
