/**
 * End-to-end tests against a real PostgreSQL test database.
 *
 * Pre-requisites (documented in README):
 *   - Created the test database (e.g. `createdb booking_test`).
 *   - DATABASE_URL in .env.test points at it.
 *   - `prisma migrate deploy` and `prisma generate` have been run by global-setup.ts.
 *
 * Each `beforeAll`:
 *   - Truncates bookings & slots.
 *   - Re-seeds ten fixed slots.
 *   - Boots a real Nest app on an ephemeral port (so we hit a real HTTP server).
 *
 * Tests (per task spec):
 *   1. Successful booking returns 201 and removes the slot from availability.
 *   2. Two overlapping requests for one slot return one 201 and one 409;
 *      verify one active booking persists. No sequential substitute or mocked
 *      persistence — we hit the real DB.
 *   3. Cancellation returns 200, restores availability, permits a new booking.
 *
 * Plus a few defense-in-depth assertions (404 SLOT_NOT_FOUND, 400 VALIDATION,
 * 404 BOOKING_NOT_FOUND, idempotent cancel).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';

const FIRST_SLOT_ID = '11111111-1111-4111-8111-111111111111';

describe('Appointment Booking API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0); // ephemeral port
    baseUrl = await app.getUrl();

    prisma = app.get(PrismaService);

    // Fresh slate. Truncate bookings first because of the partial unique index
    // and FK; then delete slots.
    await prisma.booking.deleteMany();
    await prisma.slot.deleteMany();

    // Seed ten fixed slots starting at 2030-01-15 09:00 UTC. First slot keeps
    // the canonical example UUID.
    for (let i = 0; i < 10; i++) {
      const startsAt = new Date(Date.UTC(2030, 0, 15, 9 + i, 0, 0, 0));
      const endsAt = new Date(Date.UTC(2030, 0, 15, 9 + i, 30, 0, 0));
      const created = await prisma.slot.create({ data: { startsAt, endsAt } });
      if (i === 0) {
        await prisma.slot.update({ where: { id: created.id }, data: { id: FIRST_SLOT_ID } });
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1) Successful booking returns 201 and removes the slot from availability', async () => {
    const before = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(before.body.slots.find((s: any) => s.id === FIRST_SLOT_ID)).toBeTruthy();

    const post = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        slotId: FIRST_SLOT_ID,
        customerName: 'Alex Morgan',
        customerEmail: 'alex@example.com',
      })
      .expect(201);

    expect(post.body.booking).toMatchObject({
      slotId: FIRST_SLOT_ID,
      customerName: 'Alex Morgan',
      customerEmail: 'alex@example.com',
      status: 'active',
    });
    expect(post.body.booking.id).toMatch(/^[0-9a-f-]{36}$/);

    const after = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(after.body.slots.find((s: any) => s.id === FIRST_SLOT_ID)).toBeUndefined();
  });

  it('2) Two overlapping requests for one slot return exactly one 201 and one 409; exactly one persisted active booking', async () => {
    // Use a slot that hasn't been touched in test 1: pick the second one by ordering.
    const slots = await prisma.slot.findMany({ orderBy: [{ startsAt: 'asc' }] });
    const target = slots[1].id;

    const body = {
      slotId: target,
      customerName: 'Race A',
      customerEmail: 'a@example.com',
    };
    const body2 = {
      slotId: target,
      customerName: 'Race B',
      customerEmail: 'b@example.com',
    };

    // Fire both requests in parallel against the real HTTP server.
    const [r1, r2] = await Promise.all([
      request(app.getHttpServer()).post('/bookings').send(body),
      request(app.getHttpServer()).post('/bookings').send(body2),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = r1.status === 201 ? r1 : r2;
    const loser = r1.status === 409 ? r1 : r2;
    expect(winner.body.booking.status).toBe('active');
    expect(loser.body.error.code).toBe('SLOT_UNAVAILABLE');

    // Persisted state: exactly one active row for this slot, regardless of
    // how many cancelled rows might exist.
    const active = await prisma.booking.findMany({
      where: { slotId: target, status: 'active' },
    });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(winner.body.booking.id);

    // The slot is no longer in the available list.
    const available = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(available.body.slots.find((s: any) => s.id === target)).toBeUndefined();
  });

  it('3) Cancellation returns 200, restores availability, and permits a new booking', async () => {
    const slots = await prisma.slot.findMany({ orderBy: [{ startsAt: 'asc' }] });
    const target = slots[2].id;

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .send({ slotId: target, customerName: 'Cancel Me', customerEmail: 'c@example.com' })
      .expect(201);

    expect(created.body.booking.status).toBe('active');

    const cancelled = await request(app.getHttpServer())
      .delete(`/bookings/${created.body.booking.id}`)
      .expect(200);

    expect(cancelled.body.booking).toMatchObject({
      id: created.body.booking.id,
      status: 'cancelled',
    });

    // Slot is available again.
    const available = await request(app.getHttpServer()).get('/slots').expect(200);
    expect(available.body.slots.find((s: any) => s.id === target)).toBeTruthy();

    // A new booking for the same slot now succeeds.
    const recreated = await request(app.getHttpServer())
      .post('/bookings')
      .send({ slotId: target, customerName: 'New', customerEmail: 'n@example.com' })
      .expect(201);

    expect(recreated.body.booking.status).toBe('active');
    expect(recreated.body.booking.id).not.toBe(created.body.booking.id);

    // Repeated cancellation of the original (cancelled) booking returns 200
    // and does not change anything.
    const repeat = await request(app.getHttpServer())
      .delete(`/bookings/${created.body.booking.id}`)
      .expect(200);
    expect(repeat.body.booking.status).toBe('cancelled');
    expect(repeat.body.booking.id).toBe(created.body.booking.id);

    // The newer active booking for the same slot still wins (it isn't affected
    // by old cancellations).
    const stillActive = await prisma.booking.findMany({
      where: { slotId: target, status: 'active' },
    });
    expect(stillActive.map((b) => b.id)).toEqual([recreated.body.booking.id]);
  });

  it('returns 404 SLOT_NOT_FOUND for an unknown slot', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({ slotId: ghost, customerName: 'Ghost', customerEmail: 'g@example.com' })
      .expect(404);
    expect(res.body.error.code).toBe('SLOT_NOT_FOUND');
  });

  it('returns 404 BOOKING_NOT_FOUND for an unknown booking id', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const res = await request(app.getHttpServer())
      .delete(`/bookings/${ghost}`)
      .expect(404);
    expect(res.body.error.code).toBe('BOOKING_NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for bad payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/bookings')
      .send({ slotId: 'not-a-uuid', customerName: '', customerEmail: 'no' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /slots returns slots ordered by startsAt ASC then id ASC', async () => {
    const res = await request(app.getHttpServer()).get('/slots').expect(200);
    const slots = res.body.slots as Array<{ id: string; startsAt: string }>;
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i - 1].startsAt <= slots[i].startsAt).toBe(true);
    }
  });

  it('Socket.IO emits slot.booked and slot.released', async () => {
    // Pick a slot not yet booked by other tests: the 4th one.
    const slots = await prisma.slot.findMany({ orderBy: [{ startsAt: 'asc' }] });
    const target = slots[3].id;

    const events: Array<{ name: string; payload: any }> = [];
    const client: ClientSocket = ioClient(baseUrl, { transports: ['websocket'] });

    const seen = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for events')), 8000);
      client.on('slot.booked', (p) => {
        events.push({ name: 'slot.booked', payload: p });
        if (events.some((e) => e.name === 'slot.released')) {
          clearTimeout(timer);
          resolve();
        }
      });
      client.on('slot.released', (p) => {
        events.push({ name: 'slot.released', payload: p });
        if (events.some((e) => e.name === 'slot.booked')) {
          clearTimeout(timer);
          resolve();
        }
      });
      client.on('connect_error', (e) => reject(e));
    });

    // Wait for the socket to actually be open before triggering server-side events.
    await new Promise<void>((resolve) => client.on('connect', () => resolve()));

    const created = await request(app.getHttpServer())
      .post('/bookings')
      .send({ slotId: target, customerName: 'Socket Test', customerEmail: 's@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/bookings/${created.body.booking.id}`)
      .expect(200);

    await seen;
    client.disconnect();

    const booked = events.find((e) => e.name === 'slot.booked')?.payload;
    const released = events.find((e) => e.name === 'slot.released')?.payload;
    expect(booked).toMatchObject({
      slotId: target,
      bookingId: created.body.booking.id,
      available: false,
    });
    expect(released).toMatchObject({
      slotId: target,
      bookingId: created.body.booking.id,
      available: true,
    });
    // No customer data in events.
    expect(JSON.stringify(events)).not.toMatch(/Socket Test|s@example\.com/);
  });
});
