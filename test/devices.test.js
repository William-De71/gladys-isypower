// The discovered devices against what Gladys expects but does not always say
// (community feedback, thread 11005): a single invalid field rejects the whole
// discovery batch, a missing min / max / read_only / has_feedback makes "Add"
// fail with a 422, a wrong category / type pair shows no icon nor label.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import {
  buildStationDevice,
  buildBatteryDevice,
  buildStationStates,
  buildBatteryStates,
  parseExternalId,
  isIndexFeature,
  hasBattery,
  STATION_FEATURES,
} from '../src/device.js';
import { parseStationInfo, parseReport, parseBattery, parseBatterySettings } from '../src/model.js';
import { LANGUAGES } from '../src/i18n.js';
import { defaultState, TZ, BATTERY_SN } from './helpers/fixtures.js';

const gladys = {
  externalIds: (type, id) => ({
    device: `ext:isypower:${type}:${id}`,
    feature: (key) => `ext:isypower:${type}:${id}:${key}`,
  }),
};
const fixtures = defaultState();
const STATION = {
  id: '41235',
  name: 'Maison',
  capacity: 3200,
  info: parseStationInfo(fixtures.info, TZ),
  totals: parseReport(fixtures.reports.all),
  batteries: [{ serial: BATTERY_SN }],
};
const BATTERY = {
  serial: BATTERY_SN,
  name: 'IZY-BAT 5K',
  typeName: 'Batterie',
  firmware: 'V2.0.3',
  station: '41235',
  modes: true,
  live: parseBattery({ data: fixtures.battery }),
  settings: parseBatterySettings({ data: fixtures.settings }),
};
// The units the core (server/utils/constants.js, v5.2.0) accepts per category.
const UNITS_BY_CATEGORY = {
  [CATEGORIES.ENERGY_SENSOR]: [UNITS.WATT, UNITS.KILOWATT, UNITS.WATT_HOUR, UNITS.KILOWATT_HOUR],
  [CATEGORIES.ENERGY_PRODUCTION_SENSOR]: [UNITS.WATT, UNITS.KILOWATT, UNITS.KILOWATT_HOUR],
  [CATEGORIES.GRID_SENSOR]: [UNITS.WATT, UNITS.KILOWATT, UNITS.KILOWATT_HOUR],
  [CATEGORIES.HOME_OUTPUT_SENSOR]: [UNITS.WATT, UNITS.KILOWATT, UNITS.KILOWATT_HOUR],
  [CATEGORIES.BATTERY_STORAGE]: [UNITS.PERCENT, UNITS.WATT, UNITS.KILOWATT, UNITS.KILOWATT_HOUR],
  [CATEGORIES.DEVICE_TEMPERATURE_SENSOR]: [UNITS.CELSIUS],
};

const devices = (language = 'en') => [
  buildStationDevice(gladys, STATION, { language }),
  buildStationDevice(
    gladys,
    { ...STATION, id: '9', batteries: [], info: { ...STATION.info, soc: null } },
    { language },
  ),
  buildBatteryDevice(gladys, BATTERY, { language }),
  buildBatteryDevice(gladys, { ...BATTERY, serial: 'SLAVE01', modes: false }, { language }),
];

test('every feature has min, max, read_only, has_feedback; no poll, nothing to resync', () => {
  for (const language of LANGUAGES) {
    for (const device of devices(language)) {
      assert.equal(device.should_poll, false, device.external_id);
      assert.equal(device.poll_frequency, undefined);
      assert.ok(device.name.startsWith('Isypower '), device.name);
      for (const feature of device.features) {
        for (const key of ['min', 'max', 'read_only', 'has_feedback', 'keep_history']) {
          assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
        }
        assert.ok(feature.min <= feature.max, feature.external_id);
        assert.ok(feature.name, feature.external_id);
      }
    }
  }
});

test('category / type pairs and units come from the SDK and the core', () => {
  const typesOf = (category) => {
    if (category === CATEGORIES.DEVICE_TEMPERATURE_SENSOR) {
      return Object.values(TYPES.SENSOR);
    }
    const key = Object.keys(CATEGORIES).find((name) => CATEGORIES[name] === category);
    return Object.values(TYPES[key] ?? {});
  };
  for (const device of devices()) {
    for (const feature of device.features) {
      assert.ok(Object.values(CATEGORIES).includes(feature.category), feature.external_id);
      assert.ok(typesOf(feature.category).includes(feature.type), feature.external_id);
      if (feature.category === CATEGORIES.TEXT) {
        assert.equal(feature.unit, undefined);
        continue;
      }
      assert.ok(
        UNITS_BY_CATEGORY[feature.category].includes(feature.unit),
        `${feature.external_id}: ${feature.unit}`,
      );
    }
  }
});

test('the energy tracking of Gladys: one consumption index, one production index', () => {
  const [station] = devices();
  const count = (category, type) =>
    station.features.filter((f) => f.category === category && f.type === type).length;
  assert.equal(count(CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.INDEX), 1);
  assert.equal(count(CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.ENERGY), 0);
  assert.equal(count(CATEGORIES.ENERGY_PRODUCTION_SENSOR, TYPES.ENERGY_PRODUCTION_SENSOR.INDEX), 1);
  const grid = station.features.find(
    (f) => f.category === CATEGORIES.GRID_SENSOR && f.type === TYPES.GRID_SENSOR.POWER,
  );
  assert.deepEqual([grid.min, grid.max], [-100000, 100000], 'signed, symmetric bounds');
});

test('a station without battery has no battery feature; a slave battery no mode', () => {
  const [withBattery, without, battery, slave] = devices();
  assert.equal(withBattery.features.length, STATION_FEATURES.length);
  assert.equal(without.features.length, 6);
  assert.ok(!without.features.some((f) => f.category === CATEGORIES.BATTERY_STORAGE));
  assert.equal(hasBattery({ batteries: [], info: { soc: 50 } }), true, 'known by its level');
  assert.equal(battery.features.length, 8);
  assert.equal(slave.features.length, 6);
  const modes = battery.features.filter((f) => f.type === TYPES.TEXT.SELECT);
  assert.deepEqual(
    modes.map((f) => [f.external_id.split(':').pop(), f.read_only, f.has_feedback]),
    [
      ['control_mode', false, true],
      ['manual_mode', false, true],
    ],
  );
  const fr = buildBatteryDevice(gladys, BATTERY, { language: 'fr' });
  assert.deepEqual(
    fr.features.find((f) => f.external_id.endsWith(':control_mode')).supported_options,
    [
      { value: 'intelligent', label: 'Intelligent', sort_order: 0 },
      { value: 'manual', label: 'Manuel', sort_order: 1 },
      { value: 'calendar', label: 'Calendrier', sort_order: 2 },
    ],
  );
  const noMeter = buildBatteryDevice(
    gladys,
    { ...BATTERY, settings: { ...BATTERY.settings, hasMeter: false } },
    { language: 'en' },
  );
  assert.deepEqual(
    noMeter.features
      .find((f) => f.external_id.endsWith(':control_mode'))
      .supported_options.map((o) => o.value),
    ['manual', 'calendar'],
  );
});

test('external ids: the cloud station id and the serial number in lower case', () => {
  const [station, , battery] = devices();
  assert.equal(station.external_id, 'ext:isypower:station:41235');
  assert.equal(battery.external_id, 'ext:isypower:battery:izb5k0001234');
  assert.deepEqual(parseExternalId(battery.external_id), { kind: 'battery', id: 'izb5k0001234' });
  assert.deepEqual(parseExternalId(`${station.external_id}:grid_power`), {
    kind: 'station',
    id: '41235',
  });
  assert.equal(parseExternalId('ext:other:thing'), null);
  assert.equal(isIndexFeature('ext:isypower:station:1:grid_import_index'), true);
  assert.equal(isIndexFeature('ext:isypower:station:1:grid_power'), false);
});

test('states: numbers within the bounds, texts for the dropdowns, nothing unknown', () => {
  const [station, , battery] = devices();
  const bounds = new Map([...station.features, ...battery.features].map((f) => [f.external_id, f]));
  const states = [...buildStationStates(gladys, STATION), ...buildBatteryStates(gladys, BATTERY)];
  for (const state of states) {
    const feature = bounds.get(state.device_feature_external_id);
    assert.ok(feature, state.device_feature_external_id);
    if (feature.type === TYPES.TEXT.SELECT) {
      assert.ok(
        feature.supported_options.some((option) => option.value === state.text),
        state.device_feature_external_id,
      );
    } else {
      assert.ok(Number.isFinite(state.state), state.device_feature_external_id);
      assert.ok(state.state >= feature.min && state.state <= feature.max);
    }
  }
  // Discharging: the signed battery power of the station split in two.
  const discharging = buildStationStates(gladys, {
    ...STATION,
    info: { ...STATION.info, power: { ...STATION.info.power, battery: -450 } },
  });
  const value = (key) =>
    discharging.find((s) => s.device_feature_external_id.endsWith(`:${key}`))?.state;
  assert.equal(value('battery_charge_power'), 0);
  assert.equal(value('battery_discharge_power'), 450);
  // Nothing read yet: nothing published.
  assert.deepEqual(buildStationStates(gladys, { id: '1', batteries: [] }), []);
  assert.deepEqual(buildBatteryStates(gladys, { serial: 'X', modes: true }), []);
});
