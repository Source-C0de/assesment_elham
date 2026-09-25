# Appointment Booking API

A standalone NestJS + Prisma + PostgreSQL + Socket.IO backend for booking
fixed appointment slots. Built as a recruitment exercise.

- **Stack**: TypeScript, NestJS, Express (under the hood), PostgreSQL,
  Prisma ORM, Socket.IO, `@nestjs/swagger` (Swagger UI).
- **No** frontend, **no** auth, **no** payments, **no** cloud deploy,
  **no** Docker, **no** CI/CD.

## Endpoints

| Method | Path                  | Description                                  |
|--------|-----------------------|----------------------------------------------|
| GET    | `/slots`              | Available slots (no active booking), sorted. |
| POST   | `/bookings`           | Book an available slot.                      |
| DELETE | `/bookings/{id}`      | Cancel a booking (idempotent).                |
| GET    | `/docs`               | Swagger UI.                                  |
| GET    | `/openapi.json`       | OpenAPI 3 spec.                              |
| -      | `socket.io` (default) | Real-time events (see below).                |

### Error envelope

All error responses use:

```json
{ "error": { "code": "<CODE>", "message": "<human-readable>" } }
```

Codes: `VALIDATION_ERROR`, `SLOT_NOT_FOUND`, `BOOKING_NOT_FOUND`,
`SLOT_UNAVAILABLE`, `INTERNAL_ERROR`.

### Real-time events (Socket.IO)

- Default namespace `/`, default path `/socket.io`.
- No auth, no rooms, no client events.
- The server broadcasts exactly once, **after** the database commit succeeds:
  - `slot.booked`   — `{ "slotId": "<uuid>", "bookingId": "<uuid>", "available": false }`
  - `slot.released` — `{ "slotId": "<uuid>", "bookingId": "<uuid>", "available": true }`
- No events are emitted for rejected requests (validation, 404, 409) or for
  repeated cancellation.
- No customer data is ever included in events.
- Durable delivery, replay, and exactly-once semantics are out of scope.

## Prerequisites

- Node.js 20+ (tested on Node 25).
- A running PostgreSQL instance (tested on 17).
- A database for the dev server and (optionally) one for tests.

## Installation

```bash
npm install
```

## Environment

Copy and edit `.env.example`:

```bash
cp .env.example .env
# then edit .env so DATABASE_URL points at your PostgreSQL
```

`.env.test` is provided and points at `booking_test` on port 5433 by default;
adjust as needed.

Required variables:

| Variable       | Example                                                                      |
|----------------|------------------------------------------------------------------------------|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/booking?schema=public`            |
| `PORT`         | `3000`                                                                       |

## Database setup

```bash
# 1. Create the database (one-time)
createdb booking                # or: psql -U postgres -c "CREATE DATABASE booking;"
# 2. Apply migrations (creates tables and the partial unique index)
npx prisma migrate deploy
# 3. Seed ten fixed slots
npm run prisma:seed
```

The seed creates 10 slots on 2030-01-15, 09:00–14:00 UTC, 30 minutes each.
The first slot uses the canonical UUID `11111111-1111-4111-8111-111111111111`
so manual smoke tests line up with the spec.

## Running

```bash
npm run start         # production-style
npm run start:dev     # with file-watch
```

By default the server listens on `http://localhost:3000`.

- Swagger UI:   http://localhost:3000/docs
- OpenAPI:      http://localhost:3000/openapi.json
- Socket.IO:    ws://localhost:3000/socket.io

## Frontend-free Socket.IO verification

A standalone verification script ships at `scripts/verify-socket.js`.
It uses `socket.io-client` to listen for events while triggering bookings
over plain HTTP:

```bash
node scripts/verify-socket.js
# or override the target:
SERVER_URL=http://localhost:3000 SLOT_ID=11111111-1111-4111-8111-111111111111 node scripts/verify-socket.js
```

Sample output:

```
[client] connected as ...
[event] slot.booked  {"slotId":"11111111-1111-4111-8111-111111111111","bookingId":"...","available":false}
[event] slot.released {"slotId":"11111111-1111-4111-8111-111111111111","bookingId":"...","available":true}
OK: observed slot.booked and slot.released.
```

## Tests

End-to-end tests run against a real PostgreSQL test database. They exercise
the HTTP API end-to-end via `supertest` and verify the Socket.IO gateway.

```bash
# 1. Create the test database (one-time)
createdb booking_test
# 2. Make sure DATABASE_URL in .env.test points at it
# 3. Run the suite (the global-setup hook applies migrations automatically)
npm run test:e2e
```

The test suite covers (per the task spec):

1. **Successful booking returns 201 and removes the slot from availability.**
2. **Two overlapping requests for one slot return one 201 and one 409; verify
   one active booking persists.** No sequential substitute, no mocked
   persistence — both requests fire in parallel via `Promise.all` against the
   real HTTP server.
3. **Cancellation returns 200, restores availability, and permits a new booking.**

Plus defence-in-depth checks: `404 SLOT_NOT_FOUND`, `404 BOOKING_NOT_FOUND`,
`400 VALIDATION_ERROR`, ordering, and the Socket.IO events.

## Conflict-prevention mechanism (chosen approach)

Two layers of defense:

1. **Postgres partial unique index** (in `prisma/migrations/.../migration.sql`):
   ```sql
   CREATE UNIQUE INDEX "one_active_booking_per_slot"
   ON "bookings" ("slot_id")
   WHERE "status" = 'active';
   ```
   This is the **source of truth**: the database physically refuses to have
   two `status = 'active'` rows for the same `slotId`. Even a buggy
   application cannot create a double-active booking.

2. **SERIALIZABLE transaction with application-level pre-check**
   (`src/bookings/bookings.service.ts`):
   ```ts
   await prisma.$transaction(async (tx) => {
     // confirm slot exists
     const slot = await tx.slot.findUnique(...);
     if (!slot) throw new SlotNotFoundException();
     // re-check for an existing active booking
     const active = await tx.booking.findFirst({ where: { slotId, status: 'active' } });
     if (active) throw new SlotUnavailableException();
     // insert; P2002 from the unique index -> 409
     return tx.booking.create({ data: { ... status: 'active' } });
   }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
   ```
   Postgres SERIALIZABLE adds **predicate-lock** tracking: two concurrent
   transactions that both observe "no active booking" and then both INSERT
   cannot both commit. One fails with a 40001 serialization failure; we
   retry once. If the retry still conflicts, we return 409.

The combination guarantees the spec requirement:

> Two simultaneous valid requests for one available slot must produce
> exactly one 201 and one 409, and exactly one persisted active booking,
> whether customer details match or differ.

The included e2e test (`Two overlapping requests for one slot ...`) asserts
exactly this.

### Why not the alternatives?

- *Check-then-insert without locking*: racy; two requests can both pass the
  check and both insert.
- *Pure SERIALIZABLE with retry, no unique index*: works, but the unique
  index is a stronger invariant and survives application bugs.
- *Advisory locks per slot*: works, but the partial unique index is more
  declarative and removes a class of subtle off-by-one bugs.

## Key decisions

- **NestJS over plain Express**: first-class DI, decorators for OpenAPI and
  the WebSocket gateway, clean module boundaries for a 3-endpoint service.
- **Swagger UI over Scalar**: classic, well-known UI served via
  `@nestjs/swagger`.
- **`BookingStatus` enum instead of soft-delete flags**: explicit, queryable,
  indexable.
- **Validation via `class-validator` + `class-transformer`** with `@Transform`
  decorators that trim and lower-case inputs *before* validation runs.
- **Custom domain exceptions** (`SlotNotFoundException`,
  `BookingNotFoundException`, `SlotUnavailableException`,
  `ValidationException`) carry their own `code` + `message` so the global
  filter can produce the spec's exact error envelope.
- **Idempotent cancellation**: a repeat DELETE on an already-cancelled
  booking returns 200 with the same row, with no DB write and no event.

## Future improvements

- Pagination on `GET /slots` once the catalog grows.
- Time-based availability rules (e.g., "no bookings within 1 hour of now").
- Authentication & per-customer booking lists.
- Observability: structured logging, OpenTelemetry, Prometheus metrics.
- Dockerfile + docker-compose for one-command spin-up.
- Migration to a queue-based broadcast for stronger delivery semantics if
  Socket.IO ever needs replay.

## Project layout

```
.
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   ├── 20260925170010_init/migration.sql
│   │   └── 20260925170025_one_active_booking_per_slot/migration.sql
│   └── seed.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── slots/
│   │   ├── slots.module.ts
│   │   ├── slots.controller.ts
│   │   ├── slots.service.ts
│   │   └── dto/slot.dto.ts
│   ├── bookings/
│   │   ├── bookings.module.ts
│   │   ├── bookings.controller.ts
│   │   ├── bookings.service.ts
│   │   ├── bookings.gateway.ts
│   │   └── dto/{booking.dto.ts, create-booking.dto.ts}
│   └── common/
│       ├── errors.ts
│       ├── exceptions.ts
│       ├── filters/http-exception.filter.ts
│       ├── prisma/{prisma.module.ts, prisma.service.ts}
│       └── dto/api-error.dto.ts
├── test/
│   ├── app.e2e-spec.ts
│   ├── jest-e2e.json
│   ├── global-setup.ts
│   └── global-teardown.ts
├── scripts/verify-socket.js
├── .env.example
├── .env.test
├── .gitignore
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## Time spent & unfinished parts

- **Actual time**: roughly 2.5 hours of focused development + verification.
- **Incomplete**: nothing the spec required is missing. See "Future
  improvements" for ideas explicitly out of scope.

## AI disclosure

- **Tools used**: puku-cli (MiniMax-M3 routing system) assisted with
  scaffolding the NestJS module/controller/service layout, drafting
  the Prisma schema, writing the conflict-prevention service, and
  producing the README.
- **How output was reviewed/tested**:
  - Built the project with `npm run build` (TypeScript compiles clean).
  - Ran the full e2e suite against PostgreSQL: 8/8 passing including the
    concurrent-booking test.
  - Manually exercised every endpoint with `curl` to confirm codes, status,
    and the Socket.IO payloads via the standalone verifier script.
  - Verified the partial unique index exists in the database and is used
    by the booking path (visible in the `bookings` table DDL).
- I made minor manual adjustments during review (e.g., fixing a default
  error-code mapping in the global filter, switching `import * as` to a
  default import for `supertest`).
