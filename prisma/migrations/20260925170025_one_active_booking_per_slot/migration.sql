-- Conflict prevention:
-- Postgres-level guarantee that at most one row with status='active' can exist per slot.
-- This is the source of truth: the application cannot create two active bookings for the same slot
-- even under concurrent load. The application also checks inside a SERIALIZABLE transaction
-- with SELECT ... FOR UPDATE for clean 409 responses in the common case.
CREATE UNIQUE INDEX "one_active_booking_per_slot"
ON "bookings" ("slot_id")
WHERE "status" = 'active';