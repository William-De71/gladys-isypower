// Reading the answers of Isypower Cloud: both wrappings, numbers as strings,
// unknown values as null (never 0).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  num,
  field,
  parseLastUpdate,
  parseStations,
  parseStationInfo,
  parseReport,
  parseEquipment,
  isBattery,
  parseBattery,
  parseBatterySettings,
  parseUpgrades,
  acceptsModes,
} from '../src/model.js';
import { defaultState, TZ, BATTERY_SN, VM_SN, METER_SN } from './helpers/fixtures.js';

const fixtures = defaultState();

test('num: numbers, numeric strings with a unit or a percent, else null', () => {
  assert.equal(num(12), 12);
  assert.equal(num('85.2%'), 85.2);
  assert.equal(num(' 3,5 kWh'), 3.5);
  assert.equal(num('-980'), -980);
  for (const value of [null, undefined, '', '-', 'abc', NaN, Infinity, {}, true]) {
    assert.equal(num(value), null, String(value));
  }
});

test('field: at the top level first, then in data', () => {
  assert.equal(field({ power: 1, data: { power: 2 } }, 'power'), 1);
  assert.equal(field({ code: 200, data: { power: 2 } }, 'power'), 2);
  assert.equal(field({ data: [1] }, 'power'), undefined);
  assert.equal(field(null, 'power'), undefined);
});

test('the last report of the box, with or without its offset', () => {
  assert.equal(
    parseLastUpdate('2026-02-10 22:39:29 UTC+01:00'),
    Date.parse('2026-02-10T21:39:29Z'),
  );
  assert.equal(
    parseLastUpdate('2026-10-17 13:58:30', TZ),
    Date.parse('2026-10-17T11:58:30Z'),
    'Paris summer time',
  );
  assert.equal(parseLastUpdate('yesterday'), null);
  assert.equal(parseLastUpdate(null), null);
});

test('stations: id, name (either spelling), capacity; records without id dropped', () => {
  assert.deepEqual(
    parseStations({
      code: 200,
      data: {
        records: [
          ...fixtures.stations,
          { stationsId: '77', stationsName: 'Atelier' },
          { stationName: 'No id' },
        ],
      },
    }),
    [
      { id: '41235', name: 'Maison', capacity: 3200, address: '1 rue des Lilas, Mâcon' },
      { id: '77', name: 'Atelier', capacity: null, address: null },
    ],
  );
});

test('station info: powers, battery, production per period, names of the types', () => {
  const info = parseStationInfo({ code: 200, ...fixtures.info }, TZ);
  assert.deepEqual(info.power, { production: 2140, consumption: 860, grid: -980, battery: 300 });
  assert.equal(info.soc, 62);
  assert.deepEqual(info.production, { day: 9.84, month: 182.3, year: 2410.5, all: 5230.75 });
  assert.equal(info.lastUpdate, Date.parse('2026-10-17T11:58:30Z'));
  assert.equal(info.deviceTypes.vm, 'Micro-onduleur');
  // Wrapped in data, it reads the same.
  assert.deepEqual(parseStationInfo({ code: 200, data: fixtures.info }, TZ), info);
  // A station without battery.
  const bare = parseStationInfo({ power: 100 }, TZ);
  assert.equal(bare.soc, null);
  assert.equal(bare.power.battery, null);
});

test('reports: energies and rates', () => {
  assert.deepEqual(parseReport({ code: 200, ...fixtures.reports.day }), {
    consumption: 6.1,
    selfConsumption: 4.2,
    gridImport: 1.3,
    gridExport: 3.4,
    batteryCharge: 2.2,
    batteryDischarge: 0.6,
    selfSufficiency: 78.7,
    selfConsumptionRate: 42.7,
  });
  assert.equal(parseReport({ code: 200 }).gridImport, null);
});

test('equipment: serial (sn or serialNumber), online, cluster; batteries found by type', () => {
  const list = parseEquipment(
    { code: 200, data: { records: [...fixtures.devices, { deviceName: 'no serial' }] } },
    parseStationInfo(fixtures.info).deviceTypes,
  );
  assert.deepEqual(
    list.map((item) => [item.serial, item.type, item.typeName, item.online, item.cluster]),
    [
      [VM_SN, 'vm', 'Micro-onduleur', true, 0],
      [BATTERY_SN, 'battery', 'Batterie', true, 1002],
      [METER_SN, 'meter', 'Compteur', true, 0],
    ],
  );
  assert.deepEqual(
    list.filter(isBattery).map((item) => item.serial),
    [BATTERY_SN],
  );
  assert.equal(isBattery({ type: 'yz', typeName: 'Batterie IZY' }), true);
  const offline = parseEquipment({ data: { records: [{ sn: 'X', onlineState: 0 }] } });
  assert.equal(offline[0].online, false);
  const asString = parseEquipment({
    data: { records: [{ sn: 'Y', connectInfoJson: '{"clusterMode":"1001"}' }] },
  });
  assert.equal(asString[0].cluster, 1001);
  assert.equal(acceptsModes(asString[0]), false, 'a slave follows its master');
  assert.equal(acceptsModes({ cluster: 1000 }), true);
  assert.equal(acceptsModes({ cluster: 0 }), true);
});

test('battery: level, energy, temperature, state, charge and discharge powers', () => {
  assert.deepEqual(parseBattery({ code: 200, data: fixtures.battery }), {
    soc: 62,
    energy: 3.1,
    temperature: 24.5,
    state: 'charging',
    chargePower: 300,
    dischargePower: 0,
    offGridPower: 0,
    modules: 1,
  });
  const unknown = parseBattery({ code: 200, data: { onlineState: 42 } });
  assert.equal(unknown.state, null);
  assert.equal(unknown.chargePower, null);
});

test('battery settings: modes by name, minimum, smart meter, maximum powers', () => {
  assert.deepEqual(parseBatterySettings({ code: 200, data: fixtures.settings }), {
    controlMode: 'calendar',
    manualMode: 'standby',
    manualPower: 0,
    minSoc: 10,
    hasMeter: true,
    maxCharge: 2400,
    maxDischarge: 800,
  });
  assert.equal(
    parseBatterySettings({ data: { power: { cluster_max_out_power: 1600 } } }).maxDischarge,
    1600,
  );
  assert.equal(parseBatterySettings({ code: 200, data: null }), null);
});

test('upgrades: the serial numbers waiting for a firmware', () => {
  assert.deepEqual(
    parseUpgrades({
      data: [
        { sn: 'A', needUpgrade: true },
        { sn: 'B', needUpgrade: false },
        { needUpgrade: true },
      ],
    }),
    ['A'],
  );
  assert.deepEqual(parseUpgrades({ code: 200, data: null }), []);
});
