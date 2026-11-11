import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictError, createBooking, listBookings, ValidationError } from '../src/bookings.js';
import { createStore } from '../src/store.js';

const validBooking = {
  roomId: 'cedar',
  title: 'Product brainstorm',
  organizer: 'Alex Morgan',
  startTime: '2030-06-12T09:00:00Z',
  endTime: '2030-06-12T10:00:00Z',
};

test('each store starts with three stable rooms and no bookings', () => {
  const first = createStore();
  assert.deepEqual(first.rooms.map((room) => room.id), ['cedar', 'maple', 'aspen']);
  first.bookings.push({});
  first.rooms[0].name = 'Changed';
  const second = createStore();
  assert.equal(second.bookings.length, 0);
  assert.equal(second.rooms[0].name, 'Cedar');
});

test('creates a booking, trims text, and normalizes UTC timestamps', () => {
  const store = createStore();
  const result = createBooking(store, { ...validBooking, title: '  Product brainstorm  ', ignored: true });
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(result, {
    id: result.id, ...validBooking,
    startTime: '2030-06-12T09:00:00.000Z', endTime: '2030-06-12T10:00:00.000Z',
  });
  assert.equal(store.bookings.length, 1);
});

test('lists only the selected room and date in start-time order', () => {
  const store = createStore();
  const late = createBooking(store, { ...validBooking, startTime: '2030-06-12T14:00:00Z', endTime: '2030-06-12T15:00:00Z' });
  const early = createBooking(store, validBooking);
  createBooking(store, { ...validBooking, roomId: 'maple' });
  createBooking(store, { ...validBooking, startTime: '2030-06-13T09:00:00Z', endTime: '2030-06-13T10:00:00Z' });
  assert.deepEqual(listBookings(store, 'cedar', '2030-06-12').map((booking) => booking.id), [early.id, late.id]);
  assert.deepEqual(listBookings(store, 'cedar', '2030-06-14'), []);
});

test('a booking spanning midnight appears on each affected day, but not after its end', () => {
  const store = createStore();
  const booking = createBooking(store, {
    ...validBooking, startTime: '2030-06-12T23:00:00Z', endTime: '2030-06-14T00:00:00Z',
  });
  assert.deepEqual(listBookings(store, 'cedar', '2030-06-12'), [booking]);
  assert.deepEqual(listBookings(store, 'cedar', '2030-06-13'), [booking]);
  assert.deepEqual(listBookings(store, 'cedar', '2030-06-14'), []);
});

test('accepts a real leap day and millisecond timestamps', () => {
  const booking = createBooking(createStore(), {
    ...validBooking, startTime: '2032-02-29T09:00:00.125Z', endTime: '2032-02-29T10:00:00.125Z',
  });
  assert.equal(booking.startTime, '2032-02-29T09:00:00.125Z');
});

const invalidInputs = [
  ['missing body', undefined],
  ['null body', null],
  ['array body', []],
  ['unknown room', { ...validBooking, roomId: 'missing' }],
  ['missing title', { ...validBooking, title: undefined }],
  ['blank title', { ...validBooking, title: '  ' }],
  ['long title', { ...validBooking, title: 'a'.repeat(101) }],
  ['blank organizer', { ...validBooking, organizer: ' ' }],
  ['non-string organizer', { ...validBooking, organizer: 123 }],
  ['missing timestamp', { ...validBooking, startTime: undefined }],
  ['invalid timestamp', { ...validBooking, startTime: 'not-a-date' }],
  ['missing UTC suffix', { ...validBooking, startTime: '2030-06-12T09:00:00' }],
  ['non-UTC offset', { ...validBooking, startTime: '2030-06-12T09:00:00+02:00' }],
  ['impossible day', { ...validBooking, startTime: '2030-02-30T09:00:00Z' }],
  ['invalid leap day', { ...validBooking, startTime: '2030-02-29T09:00:00Z' }],
  ['impossible hour', { ...validBooking, startTime: '2030-06-12T24:00:00Z' }],
  ['zero duration', { ...validBooking, endTime: validBooking.startTime }],
  ['negative duration', { ...validBooking, endTime: '2030-06-12T08:00:00Z' }],
];

for (const [description, input] of invalidInputs) {
  test(`rejects ${description} without storing a booking`, () => {
    const store = createStore();
    assert.throws(() => createBooking(store, input), ValidationError);
    assert.equal(store.bookings.length, 0);
  });
}

for (const date of [undefined, '', '2030-2-1', '2030-02-30', 'not-a-date']) {
  test(`rejects invalid date filter: ${String(date)}`, () => {
    assert.throws(() => listBookings(createStore(), 'cedar', date), ValidationError);
  });
}

test('rejects an unknown room filter', () => {
  assert.throws(() => listBookings(createStore(), 'missing', '2030-06-12'), ValidationError);
});

test('rejects an overlapping booking in the same room and leaves the store unchanged', () => {
  const store = createStore();
  createBooking(store, validBooking);
  assert.throws(
    () => createBooking(store, { ...validBooking, startTime: '2030-06-12T09:30:00Z', endTime: '2030-06-12T10:30:00Z' }),
    ConflictError
  );
  assert.equal(store.bookings.length, 1);
});

test('allows back-to-back bookings where one starts exactly when the other ends', () => {
  const store = createStore();
  createBooking(store, validBooking);
  const before = createBooking(store, { ...validBooking, startTime: '2030-06-12T08:00:00Z', endTime: validBooking.startTime });
  const after = createBooking(store, { ...validBooking, startTime: validBooking.endTime, endTime: '2030-06-12T11:00:00Z' });
  assert.equal(store.bookings.length, 3);
  assert.equal(before.endTime, '2030-06-12T09:00:00.000Z');
  assert.equal(after.startTime, '2030-06-12T10:00:00.000Z');
});

test('allows the same time range to be booked in a different room', () => {
  const store = createStore();
  createBooking(store, validBooking);
  const other = createBooking(store, { ...validBooking, roomId: 'maple' });
  assert.equal(store.bookings.length, 2);
  assert.equal(other.roomId, 'maple');
});

test('reports the earliest-starting conflict when a wide request straddles two existing bookings', () => {
  const store = createStore();
  const first = createBooking(store, { ...validBooking, startTime: '2030-06-12T09:00:00Z', endTime: '2030-06-12T10:00:00Z' });
  createBooking(store, { ...validBooking, startTime: '2030-06-12T10:30:00Z', endTime: '2030-06-12T11:30:00Z' });
  assert.throws(
    () => createBooking(store, { ...validBooking, startTime: '2030-06-12T09:30:00Z', endTime: '2030-06-12T11:00:00Z' }),
    (error) => error instanceof ConflictError && error.message.includes(formatRangeFragment(first))
  );
});

test('the conflict message states the existing interval, the overlap, and status 409 — never the other title or organizer', () => {
  const store = createStore();
  createBooking(store, { ...validBooking, startTime: '2030-06-12T09:00:00Z', endTime: '2030-06-12T10:00:00Z' });
  try {
    createBooking(store, { ...validBooking, title: 'Other meeting', organizer: 'Jamie Lee', startTime: '2030-06-12T09:30:00Z', endTime: '2030-06-12T11:00:00Z' });
    assert.fail('expected a ConflictError');
  } catch (error) {
    assert.ok(error instanceof ConflictError);
    assert.equal(error.status, 409);
    assert.equal(error.message, 'Room Cedar is already booked from 09:00 to 10:00, resulting in a conflict from 09:30 to 10:00.');
    assert.ok(!error.message.includes('Other meeting'));
    assert.ok(!error.message.includes('Jamie Lee'));
  }
});

test('validation errors take precedence over the conflict check', () => {
  const store = createStore();
  createBooking(store, validBooking);
  assert.throws(
    () => createBooking(store, { ...validBooking, title: '', startTime: '2030-06-12T09:30:00Z', endTime: '2030-06-12T10:30:00Z' }),
    ValidationError
  );
  assert.equal(store.bookings.length, 1);
});

function formatRangeFragment(booking) {
  return `from ${booking.startTime.slice(11, 16)} to ${booking.endTime.slice(11, 16)}`;
}
