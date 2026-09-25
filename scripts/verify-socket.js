/**
 * Frontend-free Socket.IO verification script.
 *
 * What it does:
 *   1. Connects a socket.io-client to the running server.
 *   2. Logs every `slot.booked` and `slot.released` event received.
 *   3. POSTs a booking (which should trigger `slot.booked`).
 *   4. DELETEs that booking (which should trigger `slot.released`).
 *   5. Exits 0 when both events have been observed within a timeout, 1 otherwise.
 *
 * Usage:
 *   SERVER_URL=http://localhost:3000 node scripts/verify-socket.js
 *
 * Env:
 *   SERVER_URL (default: http://localhost:3000)
 *   SLOT_ID    (default: 11111111-1111-4111-8111-111111111111)
 *   TIMEOUT_MS (default: 8000)
 */
const { io } = require('socket.io-client');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const SLOT_ID = process.env.SLOT_ID || '11111111-1111-4111-8111-111111111111';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 8000);

let sawBooked = false;
let sawReleased = false;
let bookingId = null;

const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  reconnection: false,
});

socket.on('connect', () => {
  console.log(`[client] connected as ${socket.id}`);
});

socket.on('slot.booked', (payload) => {
  console.log('[event] slot.booked', JSON.stringify(payload));
  if (payload.slotId === SLOT_ID && payload.available === false) sawBooked = true;
});

socket.on('slot.released', (payload) => {
  console.log('[event] slot.released', JSON.stringify(payload));
  if (payload.slotId === SLOT_ID && payload.available === true) sawReleased = true;
});

socket.on('disconnect', () => {
  console.log('[client] disconnected');
});

socket.on('connect_error', (err) => {
  console.error('[client] connect_error:', err.message);
});

async function post(path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return JSON.parse(text);
}

async function del(path) {
  const res = await fetch(`${SERVER_URL}${path}`, { method: 'DELETE' });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return JSON.parse(text);
}

async function run() {
  // wait briefly to ensure the connect is fully wired before triggering events
  await new Promise((r) => setTimeout(r, 300));

  console.log('[action] POST /bookings ...');
  const { booking } = await post('/bookings', {
    slotId: SLOT_ID,
    customerName: 'Verifier',
    customerEmail: 'verifier@example.com',
  });
  bookingId = booking.id;
  console.log(`[action] created booking ${bookingId}`);

  console.log('[action] DELETE /bookings/{id} ...');
  await del(`/bookings/${bookingId}`);

  // wait for both events to be received
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    if (sawBooked && sawReleased) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  socket.disconnect();

  console.log('---');
  console.log(`sawBooked:   ${sawBooked}`);
  console.log(`sawReleased: ${sawReleased}`);

  if (sawBooked && sawReleased) {
    console.log('OK: observed slot.booked and slot.released.');
    process.exit(0);
  } else {
    console.error('FAIL: did not observe both events within timeout.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('verify-socket failed:', err);
  socket.disconnect();
  process.exit(1);
});
