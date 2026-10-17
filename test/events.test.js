// Scene triggers: one event per transition, a baseline first, flat payloads
// within the limits of the core (30 keys, scalars, strings of 1000 characters).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectEvents, TRIGGERS, STALE_MINUTES, MAX_EVENTS } from '../src/events.js';
import { NOW } from './helpers/fixtures.js';

const gladys = {
  externalIds: (type, id) => ({ device: `ext:isypower:${type}:${id}`, feature: (k) => k }),
};
const station = (overrides = {}) => ({
  id: '1',
  name: 'Maison',
  info: { lastUpdate: NOW - 60 * 1000 },
  equipment: [
    { serial: 'VM1', name: 'Toit', type: 'vm', typeName: 'Micro-onduleur', online: true },
  ],
  batteries: [{ serial: 'BAT1', name: 'Garage', live: { state: 'standby', soc: 80 } }],
  upgrades: [],
  ...overrides,
});
const run = (stations, seen) => detectEvents({ gladys, stations, seen, now: NOW, language: 'fr' });

test('the first reading is a baseline', () => {
  const first = run([station()]);
  assert.deepEqual(first.events, []);
  assert.deepEqual(first.seen, {
    batteries: { BAT1: 'standby' },
    equipment: { VM1: 'online' },
    upgrades: { 1: [] },
    reporting: { 1: 'reporting' },
  });
});

test('a firmware offered fires once; the list not read this time changes nothing', () => {
  const { seen } = run([station()]);
  const offered = run([station({ upgrades: ['VM1'] })], seen);
  assert.deepEqual(offered.events, [
    {
      key: TRIGGERS.FIRMWARE,
      data: {
        station: 'ext:isypower:station:1',
        station_name: 'Maison',
        equipment_name: 'Toit',
        equipment_type: 'vm',
        serial_number: 'VM1',
      },
    },
  ]);
  assert.deepEqual(run([station({ upgrades: null })], offered.seen).events, []);
  assert.deepEqual(run([station({ upgrades: ['VM1'] })], offered.seen).events, []);
});

test('unknown values change nothing; the box silent past the threshold', () => {
  const { seen } = run([station()]);
  const unknown = run(
    [
      station({
        equipment: null,
        batteries: [{ serial: 'BAT1', live: null }],
        info: { lastUpdate: null },
      }),
    ],
    seen,
  );
  assert.deepEqual(unknown.events, []);
  assert.deepEqual(unknown.seen, seen);
  const stale = run([station({ info: { lastUpdate: NOW - STALE_MINUTES * 60 * 1000 } })], seen);
  assert.deepEqual(
    stale.events.map((event) => [event.key, event.data.state, event.data.minutes_since_update]),
    [[TRIGGERS.REPORTING, 'stale', STALE_MINUTES]],
  );
});

test('payloads are flat, at most 30 keys, and capped per reading', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({
    serial: `VM${i}`,
    name: 'x'.repeat(2000),
    type: 'vm',
    online: true,
  }));
  const { seen } = run([station({ equipment: many })]);
  const offline = run(
    [station({ equipment: many.map((item) => ({ ...item, online: false })) })],
    seen,
  );
  assert.equal(offline.events.length, MAX_EVENTS);
  for (const event of offline.events) {
    const entries = Object.entries(event.data);
    assert.ok(entries.length <= 30);
    for (const [, value] of entries) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
      assert.ok(typeof value !== 'string' || value.length <= 1000);
    }
  }
});
