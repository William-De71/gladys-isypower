// -----------------------------------------------------------------------------
// The Gladys devices of an Isypower account.
//
// One device per power station ("Isypower Home"), external id
// `ext:<selector>:station:<station id>` (the id of the station in the cloud):
//   - solar production: `energy-production-sensor` / `power` (W) and its
//     lifetime index / `index` (kWh): Gladys follows the production with it;
//   - house consumption: `energy-sensor` / `power` (W);
//   - grid exchange: `grid-sensor` / `power` (W, import > 0, export < 0);
//   - energy bought from the grid: `energy-sensor` / `index` (kWh): the only
//     index Gladys turns into consumption and cost, and what the bill counts;
//   - energy sold to the grid: `grid-sensor` / `output-index` (kWh);
//   - when the station has a battery: its level (%), charge and discharge
//     powers (W) and indexes (kWh), `battery-storage`.
//
// One device per battery ("Isypower IZY-BAT 5K"), external id
// `ext:<selector>:battery:<serial number in lower case>`: level, stored
// energy, charge and discharge powers, temperature, backup outlet power, and,
// for a master or standalone battery, its control mode and manual mode as
// dropdowns (`text` / `select`).
//
// `should_poll` stays false: the cloud is read on the integration's own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

import { t } from './i18n.js';
import { CONTROL_MODES, MANUAL_MODES } from './model.js';

const MODEL_STATION = 'Isypower Cloud';
const MAX_POWER = 100000;
const MAX_INDEX = 100000000;

const sensor = (category, type, unit, min, max) => ({
  category,
  type,
  unit,
  min,
  max,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});
const power = (category, type) => sensor(category, type, UNITS.WATT, 0, MAX_POWER);
const index = (category, type) => sensor(category, type, UNITS.KILOWATT_HOUR, 0, MAX_INDEX);
const level = () =>
  sensor(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.BATTERY_LEVEL, UNITS.PERCENT, 0, 100);
const select = () => ({
  category: CATEGORIES.TEXT,
  type: TYPES.TEXT.SELECT,
  min: 0,
  max: 0,
  read_only: false,
  has_feedback: true,
  keep_history: false,
});

const positive = (value) => (value === null ? null : Math.max(0, value));
const round = (value, digits = 0) =>
  value === null || value === undefined ? null : Number(value.toFixed(digits));

// The features of a station: key (eternal), name (TEXTS key), shape, the state
// from the station data (null: nothing to publish), and whether it needs a
// battery.
const STATION_FEATURES = [
  {
    key: 'production_power',
    name: 'feature_production_power',
    shape: power(CATEGORIES.ENERGY_PRODUCTION_SENSOR, TYPES.ENERGY_PRODUCTION_SENSOR.POWER),
    state: (s) => round(positive(s.info?.power.production)),
  },
  {
    key: 'production_index',
    name: 'feature_production_index',
    shape: index(CATEGORIES.ENERGY_PRODUCTION_SENSOR, TYPES.ENERGY_PRODUCTION_SENSOR.INDEX),
    state: (s) => round(s.info?.production.all ?? null, 3),
  },
  {
    key: 'consumption_power',
    name: 'feature_consumption_power',
    shape: power(CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.POWER),
    state: (s) => round(positive(s.info?.power.consumption)),
  },
  {
    key: 'grid_power',
    name: 'feature_grid_power',
    shape: {
      ...power(CATEGORIES.GRID_SENSOR, TYPES.GRID_SENSOR.POWER),
      min: -MAX_POWER,
    },
    state: (s) => round(s.info?.power.grid ?? null),
  },
  {
    key: 'grid_import_index',
    name: 'feature_grid_import_index',
    shape: index(CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.INDEX),
    state: (s) => round(s.totals?.gridImport ?? null, 3),
  },
  {
    key: 'grid_export_index',
    name: 'feature_grid_export_index',
    shape: index(CATEGORIES.GRID_SENSOR, TYPES.GRID_SENSOR.OUTPUT_INDEX),
    state: (s) => round(s.totals?.gridExport ?? null, 3),
  },
  {
    key: 'battery_level',
    name: 'feature_battery_level',
    shape: level(),
    state: (s) => round(s.info?.soc ?? null),
    battery: true,
  },
  {
    key: 'battery_charge_power',
    name: 'feature_battery_charge_power',
    shape: power(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.CHARGE_POWER),
    state: (s) => {
      const value = s.info?.power.battery ?? null;
      return value === null ? null : round(Math.max(0, value));
    },
    battery: true,
  },
  {
    key: 'battery_discharge_power',
    name: 'feature_battery_discharge_power',
    shape: power(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.DISCHARGE_POWER),
    state: (s) => {
      const value = s.info?.power.battery ?? null;
      return value === null ? null : round(Math.max(0, -value));
    },
    battery: true,
  },
  {
    key: 'battery_charge_index',
    name: 'feature_battery_charge_index',
    shape: index(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.CHARGE_INDEX),
    state: (s) => round(s.totals?.batteryCharge ?? null, 3),
    battery: true,
  },
  {
    key: 'battery_discharge_index',
    name: 'feature_battery_discharge_index',
    shape: index(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.DISCHARGE_INDEX),
    state: (s) => round(s.totals?.batteryDischarge ?? null, 3),
    battery: true,
  },
];

// The features of a battery, the state from `{ live, settings }`.
const BATTERY_FEATURES = [
  {
    key: 'level',
    name: 'feature_level',
    shape: level(),
    state: (b) => round(b.live?.soc ?? null),
  },
  {
    key: 'energy',
    name: 'feature_energy',
    shape: sensor(
      CATEGORIES.BATTERY_STORAGE,
      TYPES.BATTERY_STORAGE.BATTERY_ENERGY_REMAINING,
      UNITS.KILOWATT_HOUR,
      0,
      1000,
    ),
    state: (b) => round(b.live?.energy ?? null, 2),
  },
  {
    key: 'charge_power',
    name: 'feature_charge_power',
    shape: power(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.CHARGE_POWER),
    state: (b) => round(positive(b.live?.chargePower ?? null)),
  },
  {
    key: 'discharge_power',
    name: 'feature_discharge_power',
    shape: power(CATEGORIES.BATTERY_STORAGE, TYPES.BATTERY_STORAGE.DISCHARGE_POWER),
    state: (b) => round(positive(b.live?.dischargePower ?? null)),
  },
  {
    key: 'temperature',
    name: 'feature_temperature',
    shape: sensor(
      CATEGORIES.DEVICE_TEMPERATURE_SENSOR,
      TYPES.SENSOR.DECIMAL,
      UNITS.CELSIUS,
      -40,
      100,
    ),
    state: (b) => round(b.live?.temperature ?? null, 1),
  },
  {
    key: 'off_grid_power',
    name: 'feature_off_grid_power',
    shape: power(CATEGORIES.HOME_OUTPUT_SENSOR, TYPES.HOME_OUTPUT_SENSOR.OFF_GRID_POWER),
    state: (b) => round(positive(b.live?.offGridPower ?? null)),
  },
  {
    key: 'control_mode',
    name: 'feature_control_mode',
    shape: select(),
    state: (b) => (b.settings?.controlMode ? { text: b.settings.controlMode } : null),
    modes: true,
  },
  {
    key: 'manual_mode',
    name: 'feature_manual_mode',
    shape: select(),
    state: (b) => (b.settings?.manualMode ? { text: b.settings.manualMode } : null),
    modes: true,
  },
];

/**
 * @description The ids of a station device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} stationId - The station id.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const stationIds = (gladys, stationId) => gladys.externalIds('station', String(stationId));

/**
 * @description The ids of a battery device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} serial - The serial number.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const batteryIds = (gladys, serial) =>
  gladys.externalIds(
    'battery',
    String(serial)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-'),
  );

/**
 * @description What a device external id stands for.
 * @param {unknown} externalId - A device (or feature) external id.
 * @returns {{ kind: 'station'|'battery', id: string }|null} The kind and id.
 * @example
 * parseExternalId('ext:isypower:battery:izb5k00123'); // -> { kind: 'battery', id: 'izb5k00123' }
 */
function parseExternalId(externalId) {
  const match = /:(station|battery):([a-z0-9_-]+)(?::[a-z_]+)?$/i.exec(String(externalId ?? ''));
  return match ? { kind: match[1], id: match[2] } : null;
}

/**
 * @description Whether a feature is a lifetime index (never goes down).
 * @param {string} externalId - The feature external id.
 * @returns {boolean} True for an index.
 */
const isIndexFeature = (externalId) => /:[a-z_]+_index$/.test(String(externalId));

/**
 * @description Whether a station has a battery.
 * @param {object} station - `{ info, batteries }`.
 * @returns {boolean} True when it has one.
 */
const hasBattery = (station) =>
  (station.batteries?.length ?? 0) > 0 ||
  (station.info?.soc !== null && station.info?.soc !== undefined);

/**
 * @description The options of the mode dropdowns, in a language.
 * @param {string} key - control_mode or manual_mode.
 * @param {object|null} settings - The battery settings.
 * @param {string} language - The language.
 * @returns {object[]} `[{ value, label, sort_order }]`.
 */
function modeOptions(key, settings, language) {
  const modes =
    key === 'control_mode'
      ? Object.keys(CONTROL_MODES).filter(
          // The intelligent mode follows the smart meter: none, no intelligent mode.
          (mode) => mode !== 'intelligent' || settings?.hasMeter !== false,
        )
      : Object.keys(MANUAL_MODES);
  return modes.map((mode, order) => ({
    value: mode,
    label: t(`mode_${mode}`, language),
    sort_order: order,
  }));
}

/**
 * @description The device of a station.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - `{ id, name, capacity, address, info, batteries }`.
 * @param {object} [options] - `{ language }`.
 * @returns {object} The discovered device.
 */
function buildStationDevice(gladys, station, { language = 'en' } = {}) {
  const ids = stationIds(gladys, station.id);
  const battery = hasBattery(station);
  return {
    name: t('stationName', language, { name: station.name }),
    external_id: ids.device,
    model: MODEL_STATION,
    should_poll: false,
    params: [
      { name: 'STATION_ID', value: String(station.id) },
      ...(station.capacity !== null && station.capacity !== undefined
        ? [{ name: 'INSTALLED_CAPACITY_W', value: String(station.capacity) }]
        : []),
    ],
    features: STATION_FEATURES.filter((spec) => !spec.battery || battery).map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
    })),
  };
}

/**
 * @description The device of a battery.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} battery - `{ serial, name, typeName, firmware, station,
 * modes, settings }`.
 * @param {object} [options] - `{ language }`.
 * @returns {object} The discovered device.
 */
function buildBatteryDevice(gladys, battery, { language = 'en' } = {}) {
  const ids = batteryIds(gladys, battery.serial);
  return {
    name: t('batteryName', language, { name: battery.name ?? battery.serial }),
    external_id: ids.device,
    model: battery.typeName ?? 'Isypower battery',
    should_poll: false,
    params: [
      { name: 'SERIAL_NUMBER', value: battery.serial },
      { name: 'STATION_ID', value: String(battery.station) },
      ...(battery.firmware ? [{ name: 'FIRMWARE', value: battery.firmware }] : []),
    ],
    features: BATTERY_FEATURES.filter((spec) => !spec.modes || battery.modes).map((spec) => ({
      name: t(spec.name, language),
      external_id: ids.feature(spec.key),
      ...spec.shape,
      ...(spec.modes
        ? { supported_options: modeOptions(spec.key, battery.settings, language) }
        : {}),
    })),
  };
}

/**
 * @description The states of a station device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} station - `{ id, info, totals, batteries }`.
 * @returns {object[]} `[{ device_feature_external_id, state }]`.
 */
function buildStationStates(gladys, station) {
  const ids = stationIds(gladys, station.id);
  const battery = hasBattery(station);
  return STATION_FEATURES.filter((spec) => !spec.battery || battery)
    .map((spec) => ({ spec, value: spec.state(station) }))
    .filter(({ value }) => value !== null && value !== undefined && Number.isFinite(value))
    .map(({ spec, value }) => ({
      device_feature_external_id: ids.feature(spec.key),
      state: value,
    }));
}

/**
 * @description The states of a battery device.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} battery - `{ serial, modes, live, settings }`.
 * @returns {object[]} `[{ device_feature_external_id, state | text }]`.
 */
function buildBatteryStates(gladys, battery) {
  const ids = batteryIds(gladys, battery.serial);
  return BATTERY_FEATURES.filter((spec) => !spec.modes || battery.modes)
    .map((spec) => ({ spec, value: spec.state(battery) }))
    .filter(({ value }) => value !== null && value !== undefined)
    .filter(({ value }) => typeof value === 'object' || Number.isFinite(value))
    .map(({ spec, value }) => ({
      device_feature_external_id: ids.feature(spec.key),
      ...(typeof value === 'object' ? value : { state: value }),
    }));
}

export {
  STATION_FEATURES,
  BATTERY_FEATURES,
  MAX_POWER,
  stationIds,
  batteryIds,
  parseExternalId,
  isIndexFeature,
  hasBattery,
  modeOptions,
  buildStationDevice,
  buildBatteryDevice,
  buildStationStates,
  buildBatteryStates,
};
