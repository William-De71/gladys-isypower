// -----------------------------------------------------------------------------
// The answers of Isypower Cloud, read into plain objects.
//
// The API is undocumented and not consistent: some answers wrap their content
// in `{ code, msg, data }`, the station info and the reports carry their
// fields at the top level (as the Home Assistant integration reads them).
// Every reader here accepts both, and every number may come as a string
// ("85.2%", "1.23"): `num()` reads them, and anything else is `null` (never 0:
// an unknown value is not published).
//
// Units of the API: powers in W, energies in kWh, rates in %.
// Battery power of the station: positive while charging (the Home Assistant
// integration has to invert it for the energy dashboard), negative while
// discharging. Grid power: positive while importing.
// -----------------------------------------------------------------------------

import { zonedInstant } from './time.js';

// `onlineState` of a battery's live data.
const BATTERY_STATES = { 1000: 'standby', 1001: 'charging', 1002: 'discharging' };
// `clusterMode` of a battery in a multi-battery installation: the master and a
// standalone battery accept the mode commands, a slave follows its master.
const CLUSTER = { MASTER: 1000, SLAVE: 1001, STANDALONE: 1002 };
// `ctr_mode` and the manual `mode` of a battery.
const CONTROL_MODES = { intelligent: 0, manual: 1, calendar: 2 };
const MANUAL_MODES = { standby: 0, charge: 1, discharge: 2 };
const PERIODS = ['day', 'month', 'year', 'all'];

/**
 * @description A number from the API: a number, or a numeric string with a
 * unit or a percent sign.
 * @param {unknown} value - The raw value.
 * @returns {number|null} The number, or null.
 * @example
 * num('85.2%'); // -> 85.2
 * num(''); // -> null
 */
function num(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^\s*(-?\d+(?:[.,]\d+)?)/.exec(value);
  return match ? Number(match[1].replace(',', '.')) : null;
}

/**
 * @description A field of an answer, at its top level or in its `data`.
 * @param {object} json - The answer.
 * @param {string} key - The field.
 * @returns {unknown} The value, or undefined.
 */
function field(json, key) {
  if (!json || typeof json !== 'object') {
    return undefined;
  }
  if (json[key] !== undefined && json[key] !== null) {
    return json[key];
  }
  const data = json.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data[key] : undefined;
}

/**
 * @description The records of a paged answer.
 * @param {object} json - The answer.
 * @returns {object[]} The records.
 */
function records(json) {
  const list = json?.data?.records ?? json?.records ?? (Array.isArray(json?.data) ? json.data : []);
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : [];
}

/**
 * @description An object that may come as a JSON string.
 * @param {unknown} value - The raw value.
 * @returns {object} The object, `{}` when unreadable.
 */
function objectOf(value) {
  if (value && typeof value === 'object') {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const id = (value) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && /^[\w-]+$/.test(value))
    ? String(value)
    : null;

/**
 * @description When the box last reported to the cloud: "2026-02-10 22:39:29
 * UTC+01:00", or without its offset (then in the timezone of the installation).
 * @param {unknown} value - The raw value.
 * @param {string} [timeZone] - IANA timezone of the installation.
 * @returns {number|null} The instant in ms, or null.
 * @example
 * parseLastUpdate('2026-02-10 22:39:29 UTC+01:00'); // -> Date.parse('2026-02-10T21:39:29Z')
 */
function parseLastUpdate(value, timeZone) {
  const match =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\s*(?:UTC|GMT)?\s*([+-]\d{2}):?(\d{2}))?/.exec(
      String(value ?? ''),
    );
  if (!match) {
    return null;
  }
  const [, date, hours, minutes, seconds = '00', offsetHours, offsetMinutes] = match;
  if (offsetHours !== undefined) {
    const instant = Date.parse(
      `${date}T${hours}:${minutes}:${seconds}${offsetHours}:${offsetMinutes}`,
    );
    return Number.isFinite(instant) ? instant : null;
  }
  return (
    zonedInstant(date, Number(hours) * 60 + Number(minutes), timeZone) + Number(seconds) * 1000
  );
}

/**
 * @description The power stations of the account.
 * @param {object} json - Answer of /api/powerStations/page.
 * @returns {object[]} `[{ id, name, capacity, address }]`.
 */
function parseStations(json) {
  return records(json)
    .map((record) => ({
      id: id(record.stationsId ?? record.stationId ?? record.id),
      name: text(record.stationName) ?? text(record.stationsName),
      capacity: num(record.installedCapacity),
      address: text(record.address),
    }))
    .filter((station) => station.id)
    .map((station) => ({ ...station, name: station.name ?? `Station ${station.id}` }));
}

/**
 * @description The live data of a station.
 * @param {object} json - Answer of /api/v3/powerStations/info/{id}.
 * @param {string} [timeZone] - IANA timezone of the installation.
 * @returns {object} `{ lastUpdate, power: { production, consumption, grid,
 * battery }, soc, production: { day, month, year, all }, deviceTypes }`.
 */
function parseStationInfo(json, timeZone) {
  const extra = objectOf(field(json, 'extraData'));
  const production = objectOf(extra.production);
  const types = field(json, 'deviceTypes');
  return {
    lastUpdate: parseLastUpdate(field(json, 'lastUpdate'), timeZone),
    power: {
      production: num(field(json, 'power')),
      consumption: num(field(json, 'consumption')),
      grid: num(field(json, 'grid_power')),
      battery: num(field(json, 'battery_power')),
    },
    soc: num(field(json, 'battery_soc')),
    production: Object.fromEntries(PERIODS.map((period) => [period, num(production[period])])),
    deviceTypes: Object.fromEntries(
      (Array.isArray(types) ? types : [])
        .filter((type) => type && text(type.value) && text(type.name))
        .map((type) => [type.value, type.name]),
    ),
  };
}

/**
 * @description The energy report of a period.
 * @param {object} json - Answer of /api/report/v2/powerStations/data/{id}.
 * @returns {object} kWh: `{ consumption, selfConsumption, gridImport,
 * gridExport, batteryCharge, batteryDischarge }`; %: `{ selfSufficiency,
 * selfConsumptionRate }`.
 */
function parseReport(json) {
  const value = (key) => num(field(json, key));
  return {
    consumption: value('total_consumption'),
    selfConsumption: value('consumption'),
    gridImport: value('meter_energy_p'),
    gridExport: value('meter_energy_n'),
    batteryCharge: value('storage_in'),
    batteryDischarge: value('storage_out'),
    selfSufficiency: value('energy_self_rate'),
    selfConsumptionRate: value('consumption_rate'),
  };
}

/**
 * @description The equipment of a station (micro-inverters, batteries, meters,
 * charging stations).
 * @param {object} json - Answer of /api/device/page.
 * @param {object} [deviceTypes] - Names of the types, from the station info.
 * @returns {object[]} `[{ id, serial, name, type, typeName, online,
 * firmware, cluster }]`.
 */
function parseEquipment(json, deviceTypes = {}) {
  return records(json)
    .map((record) => {
      const type = text(record.deviceType);
      const state = num(record.onlineState);
      return {
        id: id(record.deviceId),
        serial: text(record.sn) ?? text(record.serialNumber),
        name: text(record.deviceName),
        type,
        typeName: (type && deviceTypes[type]) ?? type,
        // 0 offline; the other codes are online states.
        online: state === null ? null : state !== 0,
        firmware: text(record.softwareVersion),
        cluster: num(objectOf(record.connectInfoJson).clusterMode) ?? 0,
      };
    })
    .filter((item) => item.serial);
}

/**
 * @description Whether a piece of equipment is a battery.
 * @param {object} item - From parseEquipment.
 * @returns {boolean} True for a battery.
 */
const isBattery = (item) =>
  item.type === 'battery' || /battery|batterie/i.test(String(item.typeName ?? ''));

/**
 * @description The live data of a battery.
 * @param {object} json - Answer of /izy/v2/battery/{sn}.
 * @returns {object} `{ soc, energy, temperature, state, chargePower,
 * dischargePower, offGridPower, modules }`.
 */
function parseBattery(json) {
  const data = objectOf(json?.data ?? json);
  const charge = objectOf(data.chargeData);
  const discharge = objectOf(data.dischargeData);
  const charging = [num(charge.power1), num(charge.power2)].filter((v) => v !== null);
  return {
    soc: num(data.soc),
    energy: num(data.socKwh),
    temperature: num(data.socTemp),
    state: BATTERY_STATES[num(data.onlineState)] ?? null,
    // Into the battery: from the grid or an external source, and from the panels.
    chargePower: charging.length ? charging.reduce((sum, v) => sum + v, 0) : null,
    // Out of the battery (power2 is the solar power passed through, not the battery's).
    dischargePower: num(discharge.power1),
    offGridPower: num(data.offGridPower),
    modules: Array.isArray(data.items) ? data.items.length : 0,
  };
}

/**
 * @description The settings of a battery.
 * @param {object} json - Answer of /api/v2/device/cmd/{sn}.
 * @returns {object|null} `{ controlMode, manualMode, manualPower, minSoc,
 * hasMeter, maxCharge, maxDischarge }` (modes as names), null when the answer
 * holds none.
 */
function parseBatterySettings(json) {
  const data = objectOf(json?.data);
  if (!Object.keys(data).length) {
    return null;
  }
  const byValue = (modes, value) =>
    Object.keys(modes).find((name) => modes[name] === num(value)) ?? null;
  const power = objectOf(data.power);
  return {
    controlMode: byValue(CONTROL_MODES, objectOf(data.mode).ctr_mode),
    manualMode: byValue(MANUAL_MODES, objectOf(data.manual).mode),
    manualPower: num(objectOf(data.manual).power),
    minSoc: num(data.min_soc),
    hasMeter: data.hasMeter === undefined ? null : Boolean(data.hasMeter),
    maxCharge: num(power.max_in_power),
    maxDischarge: num(power.max_out_power) ?? num(power.cluster_max_out_power),
  };
}

/**
 * @description The serial numbers with a firmware update waiting.
 * @param {object} json - Answer of /api/v3/device/upgrade/{id}.
 * @returns {string[]} The serial numbers.
 */
function parseUpgrades(json) {
  const list = Array.isArray(json?.data) ? json.data : records(json);
  return list.filter((item) => item?.needUpgrade === true && text(item.sn)).map((item) => item.sn);
}

/**
 * @description Whether a battery accepts the mode commands: a master or a
 * standalone battery (a battery without cluster information is taken as
 * standalone).
 * @param {object} item - From parseEquipment.
 * @returns {boolean} True when it does.
 */
const acceptsModes = (item) =>
  item.cluster === 0 || item.cluster === CLUSTER.MASTER || item.cluster === CLUSTER.STANDALONE;

export {
  BATTERY_STATES,
  CLUSTER,
  CONTROL_MODES,
  MANUAL_MODES,
  PERIODS,
  num,
  field,
  records,
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
};
