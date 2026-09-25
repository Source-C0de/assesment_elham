APPOINTMENT BOOKING API:
Standalone recruitment exercise. Target effort: 2–3 hours. This is a target, not a verified completion-time estimate. Report actual time spent and any incomplete requirements.
STACK & SCOPE
TypeScript; NestJS or Express; PostgreSQL; Prisma ORM; Socket.IO; OpenAPI with Swagger UI or Scalar.
Provide fixed appointment slots through a seed script. Each slot accepts at most one active booking. Choose your data model, architecture, and conflict-prevention mechanism and explain your decisions.
Do not build a frontend, authentication, payments, cloud deployment, or CI/CD. Docker is not required. No extra credit for additional features.
COMMON CONTRACT
JSON request/response bodies. UUID string IDs. ISO 8601 UTC timestamps. Each seeded slot has fixed startsAt and endsAt, with endsAt later than startsAt. Available means no active booking; no date-based availability rules. Booking status: active or cancelled. No authentication, pagination, or additional endpoints required.
1. GET /slots
200: {"slots":[{"id":"11111111-1111-4111-8111-111111111111","startsAt":"2030-01-15T09:00:00.000Z","endsAt":"2030-01-15T09:30:00.000Z"}]}
Return available slots only, ordered by startsAt then id ascending. Empty response: {"slots":[]}.
2. POST /bookings
Request: {"slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com"}
All fields required. slotId must be a UUID. Trim customerName and customerEmail before validation and storage. Name must be non-empty; email must have valid syntax.
201: {"booking":{"id":"22222222-2222-4222-8222-222222222222","slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com","status":"active"}}
400 VALIDATION_ERROR: invalid/missing fields or malformed JSON.
404 SLOT_NOT_FOUND: valid UUID for a nonexistent slot.
409 SLOT_UNAVAILABLE: an active booking already exists.
500 INTERNAL_ERROR: unexpected failure.
CONCURRENCY: Two simultaneous valid requests for one available slot must produce exactly one 201 and one 409, and exactly one persisted active booking, whether customer details match or differ. Choose and explain your mechanism; no prescribed solution.
3. DELETE /bookings/{bookingId}
UUID path parameter; no request body.
200: {"booking":{"id":"22222222-2222-4222-8222-222222222222","slotId":"11111111-1111-4111-8111-111111111111","customerName":"Alex Morgan","customerEmail":"alex@example.com","status":"cancelled"}}
An active booking becomes cancelled and releases its slot. Repeated cancellation returns 200 with the same cancelled booking, without further state change or event. An old cancelled booking must not affect a newer active booking for the same slot. Cancelled bookings remain addressable.
400 VALIDATION_ERROR: invalid UUID.
404 BOOKING_NOT_FOUND: valid UUID for a nonexistent booking.
500 INTERNAL_ERROR: unexpected failure.
ERROR FORMAT
{"error":{"code":"SLOT_UNAVAILABLE","message":"This slot already has an active booking."}}
Codes must match this specification; message wording may vary but must be clear and non-empty. Do not expose stack traces or database internals.
SOCKET.IO
Same server; default namespace / and path /socket.io. No authentication, rooms, or client application events required.
Broadcast once after the successful database change commits:
slot.booked: {"slotId":"11111111-1111-4111-8111-111111111111","bookingId":"22222222-2222-4222-8222-222222222222","available":false}
slot.released: {"slotId":"11111111-1111-4111-8111-111111111111","bookingId":"22222222-2222-4222-8222-222222222222","available":true}
No events on rejected requests or repeated cancellation. No customer data in events. Durable delivery, replay, and exactly-once delivery guarantees are out of scope.
Provide a frontend-free verification method, such as a socket.io-client script with commands.
OPENAPI
GET /docs: Swagger UI or Scalar. GET /openapi.json: OpenAPI specification.
Document all three endpoints, parameters, required fields, types, formats, validation, success/error schemas, all status codes above, examples, repeated cancellation, and absence of authentication. Documentation must match behavior. Document Socket.IO details in README, not as HTTP operations.
REQUIRED AUTOMATED TESTS
Use PostgreSQL and exercise the API:
1. Successful booking returns 201 and removes the slot from availability.
2. Two overlapping requests for one slot return one 201 and one 409; verify one active booking persists. No sequential substitute or mocked persistence.
3. Cancellation returns 200, restores availability, and permits a new booking.
Make tests repeatable and explain test database setup.
MANDATORY ZIP SUBMISSION
Include source, package manifest and lockfile, Prisma schema, migrations, seed, tests, README, and .env.example with placeholders only. Exclude node_modules, real .env files, credentials, and secrets.
README: prerequisites; installation; environment; migration/seed/start commands; test database and test commands; API and documentation URLs; frontend-free Socket.IO verification; conflict-prevention explanation; key decisions; future improvements; actual time; unfinished parts; AI disclosure.
AI disclosure: tools used and how output was reviewed/tested, or explicitly “No AI used”. AI is allowed; explain your code and make a short modification in the interview.
GitHub is optional and does not replace ZIP.
EVALUATION
40% Correct behavior and conflict prevention.
20% Code quality and data design.
20% OpenAPI accuracy.
15% Tests and ease of running.
5% Real-time updates.
No points for unrequested features.
