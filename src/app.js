// -----------------------------------------------------------------------------
// The Isypower integration: every handler, registered on a Gladys client.
//
// Brings the solar installations of Isypower Cloud (Materfrance) into Gladys:
//   - devices (device.js): one per power station (production, consumption,
//     grid exchange, batteries as a whole, lifetime indexes for the energy
//     tracking of Gladys) and one per battery (level, powers, temperature,
//     control and manual modes as dropdowns);
//   - scene triggers (events.js): battery state changed, equipment offline or
//     back, firmware update offered, station silent or reporting again;
//   - scene actions: set the mode of a battery, set its minimum charge, read
//     the energy report of a period;
//   - dashboard widgets (widgets.js): overview, energy report, battery.
//
// The cloud is read on the integration's own timer (3 minutes by default: the
// boxes report every three minutes), never on a Gladys poll. Transport: cloud
// only. A refused login stops the readings until the configuration changes,
// so that the account is never locked by retries.
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK (test/app.test.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  hasAccount,
  readLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createIsypowerClient } from './isypower-api.js';
import { createStore, DEFAULT_PATH } from './store.js';
import {
  CONTROL_MODES,
  MANUAL_MODES,
  parseStations,
  parseStationInfo,
  parseReport,
  parseEquipment,
  isBattery,
  parseBattery,
  parseBatterySettings,
  parseUpgrades,
  acceptsModes,
} from './model.js';
import {
  stationIds,
  batteryIds,
  isIndexFeature,
  buildStationDevice,
  buildBatteryDevice,
  buildStationStates,
  buildBatteryStates,
} from './device.js';
import { detectEvents } from './events.js';
import {
  WIDGETS,
  WIDGET_ACTIONS,
  MIN_SOC,
  MAX_MANUAL_POWER,
  messageContent,
  buildOverviewWidget,
  buildReportWidget,
  buildBatteryWidget,
  readWidgetSettings,
} from './widgets.js';
import { defaultTimeZone, localClock, MINUTE_MS } from './time.js';
import { t, all, formatEnergy, formatPercent } from './i18n.js';

const ACTIONS = { REFRESH: 'refresh', DIAGNOSTIC: 'diagnostic' };
const SCENE_ACTIONS = {
  SET_BATTERY_MODE: 'set_battery_mode',
  SET_MINIMUM_CHARGE: 'set_minimum_charge',
  GET_ENERGY_REPORT: 'get_energy_report',
};
const REPORT_OUTPUTS = [
  'production_kwh',
  'consumption_kwh',
  'grid_import_kwh',
  'grid_export_kwh',
  'battery_charge_kwh',
  'battery_discharge_kwh',
  'self_sufficiency_percent',
  'summary',
];
// The list of stations changes rarely: read again after this delay.
const STATIONS_MAX_AGE_MS = 60 * MINUTE_MS;
// The settings of a battery (modes, minimum charge): read again after this delay.
const SETTINGS_MAX_AGE_MS = 15 * MINUTE_MS;
// The firmware updates: read again after this delay.
const UPGRADES_MAX_AGE_MS = 6 * 60 * MINUTE_MS;
// The month and year reports, read on demand, are kept this long.
const REPORT_CACHE_MS = 30 * MINUTE_MS;
// After a failed reading: a quicker try first.
const RETRY_MS = 2 * MINUTE_MS;
// A manual refresh never reads again within this delay.
const REFRESH_MIN_INTERVAL_MS = 60 * 1000;
// Power samples kept for the curves.
const SAMPLES_MS = 24 * 3600 * 1000;
const MAX_SAMPLES = 600;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/**
 * @description Keep only the declared outputs of a scene action.
 * @param {object} values - The values.
 * @param {string[]} keys - The declared outputs.
 * @returns {object} The outputs, without the unknown (null) ones.
 */
function pick(values, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => values[key] !== null && values[key] !== undefined)
      .map((key) => [key, values[key]]),
  );
}

/**
 * @description The keys of an answer, without its values: what the diagnostic
 * shows of an undocumented API.
 * @param {unknown} json - The answer.
 * @returns {object|null} `{ top, data }`.
 */
function shapeOf(json) {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const keys = (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value).slice(0, 60)
      : null;
  const data = json.data;
  return {
    top: keys(json),
    data: Array.isArray(data) ? { array: data.length, item: keys(data[0]) } : keys(data),
  };
}

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of Isypower Cloud (tests).
 * @param {string} [options.storePath] - The file kept in /data.
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of "today" (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timer (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    storePath = DEFAULT_PATH,
    now = () => Date.now(),
    timeZone = defaultTimeZone(),
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // Language of the last widget request: the fallback of the texts Gladys does
  // not ask for in a language, when the `language` setting is `auto`. French
  // until a widget is shown: Isypower is sold in France.
  let language = 'fr';
  let api = null;
  let createdDevices = new Set();
  // The stations read: `{ id, name, capacity, address, info, today, totals,
  // equipment, batteries, upgrades, upgradesReadAt }`.
  let stations = [];
  let stationsReadAt = null;
  let readAt = null;
  let lastStatus = null;
  let lastDiscovery = null;
  let lastError = null;
  let failures = 0;
  // A refused login: no reading until the configuration changes.
  let authBlocked = false;
  let timer = null;
  let running = null;
  let stopped = false;
  const reportCache = new Map();
  const shapes = {};

  const store = createStore({ path: storePath, logger });
  const today = () => localClock(now(), timeZone).date;

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Create the API client of the current account.
   */
  function connectApi() {
    api = createIsypowerClient({
      username: config.username,
      password: config.password,
      language: textLanguage(),
      ...(fetchFn ? { fetch: fetchFn } : {}),
      now,
    });
  }

  /**
   * @description Remember the language of a request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (typeof next !== 'string' || !/^[a-z]{2}$/.test(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   * @param {string[]} keys - The widget keys.
   */
  function refreshWidgets(keys) {
    for (const key of keys) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Call the API and remember the shape of the answer.
   * @param {string} name - The name of the endpoint (diagnostic).
   * @param {Promise<object>} promise - The call.
   * @returns {Promise<object>} The answer.
   */
  async function fetchShape(name, promise) {
    const json = await promise;
    shapes[name] = shapeOf(json);
    return json;
  }

  // --- Reading -----------------------------------------------------------------------

  const allBatteries = () => stations.flatMap((station) => station.batteries ?? []);

  /**
   * @description Read one station: its live data, today's and lifetime
   * reports, its equipment and batteries. A failed secondary call keeps the
   * previous value; the station info is required.
   * @param {object} station - The station (updated in place).
   * @param {object} options - `{ forceSettings }`.
   * @returns {Promise<void>}
   */
  async function readStation(station, { forceSettings = false } = {}) {
    const date = today();
    station.info = parseStationInfo(
      await fetchShape('info', api.stationInfo(station.id)),
      timeZone,
    );
    const optional = async (name, work, fallback) => {
      try {
        return await work();
      } catch (err) {
        if (err.kind === 'auth') {
          throw err;
        }
        logger.warn(`Isypower ${name} of station ${station.id} not read: ${err.message}`);
        return fallback;
      }
    };
    station.today = await optional(
      'day report',
      async () => parseReport(await fetchShape('report', api.report(station.id, 'day', date))),
      station.today ?? null,
    );
    station.totals = await optional(
      'lifetime report',
      async () => parseReport(await fetchShape('report_all', api.report(station.id, 'all', date))),
      station.totals ?? null,
    );
    // null: not read this time (no connection event can be told).
    station.equipment = await optional(
      'equipment',
      async () =>
        parseEquipment(
          await fetchShape('devices', api.devices(station.id)),
          station.info.deviceTypes,
        ),
      null,
    );
    if (station.equipment) {
      const previous = new Map((station.batteries ?? []).map((b) => [b.serial, b]));
      station.batteries = station.equipment.filter(isBattery).map((item) => ({
        ...(previous.get(item.serial) ?? { live: null, settings: null, settingsReadAt: null }),
        serial: item.serial,
        id: item.id,
        name: item.name,
        typeName: item.typeName,
        firmware: item.firmware,
        station: station.id,
        modes: acceptsModes(item),
      }));
    }
    for (const battery of station.batteries ?? []) {
      battery.live = await optional(
        `battery ${battery.serial}`,
        async () => parseBattery(await fetchShape('battery', api.battery(battery.serial))),
        null,
      );
      if (
        forceSettings ||
        !battery.settingsReadAt ||
        now() - battery.settingsReadAt > SETTINGS_MAX_AGE_MS
      ) {
        const settings = await optional(
          `settings of battery ${battery.serial}`,
          async () =>
            parseBatterySettings(
              await fetchShape('battery_settings', api.batterySettings(battery.serial)),
            ),
          undefined,
        );
        if (settings !== undefined) {
          battery.settings = settings;
          battery.settingsReadAt = now();
        }
      }
    }
    station.upgrades = null;
    if (!station.upgradesReadAt || now() - station.upgradesReadAt > UPGRADES_MAX_AGE_MS) {
      const upgrades = await optional(
        'firmware updates',
        async () => parseUpgrades(await fetchShape('upgrades', api.upgrades(station.id))),
        null,
      );
      if (upgrades) {
        station.upgrades = upgrades;
        station.upgradesKnown = upgrades;
        station.upgradesReadAt = now();
      }
    }
  }

  /**
   * @description Read the list of stations when it is old, then every station.
   * @param {object} options - `{ force }`.
   * @returns {Promise<void>}
   */
  async function readAll({ force = false } = {}) {
    if (force || !stationsReadAt || now() - stationsReadAt > STATIONS_MAX_AGE_MS) {
      const list = parseStations(await fetchShape('stations', api.stations()));
      const previous = new Map(stations.map((station) => [station.id, station]));
      stations = list.map((item) => ({ ...(previous.get(item.id) ?? {}), ...item }));
      stationsReadAt = now();
    }
    let read = 0;
    let error = null;
    for (const station of stations) {
      try {
        await readStation(station, { forceSettings: force });
        read += 1;
      } catch (err) {
        if (err.kind === 'auth') {
          throw err;
        }
        error = err;
        logger.warn(`Isypower station ${station.id} not read: ${err.message}`);
      }
    }
    if (stations.length && !read && error) {
      throw error;
    }
    readAt = now();
  }

  // --- Devices and states ------------------------------------------------------------

  /**
   * @description Offer the devices on the Discovery screen, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} The count.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = stations.flatMap((station) => [
      buildStationDevice(gladys, station, { language: lang }),
      ...(station.batteries ?? []).map((battery) =>
        buildBatteryDevice(gladys, battery, { language: lang }),
      ),
    ]);
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description Publish the states of the created devices (only the changed
   * ones). A lifetime index lower than the last one published is skipped.
   * @returns {Promise<void>}
   */
  async function publishStates() {
    const states = [];
    for (const station of stations) {
      if (createdDevices.has(stationIds(gladys, station.id).device)) {
        states.push(...buildStationStates(gladys, station));
      }
      for (const battery of station.batteries ?? []) {
        if (createdDevices.has(batteryIds(gladys, battery.serial).device)) {
          states.push(...buildBatteryStates(gladys, battery));
        }
      }
    }
    const accepted = states.filter((state) => {
      if (!isIndexFeature(state.device_feature_external_id)) {
        return true;
      }
      const last = store.data.indexes[state.device_feature_external_id];
      if (typeof last === 'number' && state.state < last - 0.001) {
        logger.debug?.(
          `Index ${state.device_feature_external_id} went down (${last} -> ${state.state}): skipped`,
        );
        return false;
      }
      store.data.indexes[state.device_feature_external_id] = state.state;
      return true;
    });
    for (let index = 0; index < accepted.length; index += 100) {
      await gladys.publishChangedStates(accepted.slice(index, index + 100));
    }
  }

  const publishQuietly = () =>
    publishStates().catch((err) => logger.warn(`Unable to publish the states: ${err.message}`));

  /**
   * @description Keep the power samples of the curves.
   */
  function sample() {
    const current = now();
    for (const station of stations) {
      const power = station.info?.power;
      if (!power || (power.production === null && power.consumption === null)) {
        continue;
      }
      const list = (store.data.samples[station.id] ?? []).filter(
        (s) => current - s.t <= SAMPLES_MS,
      );
      list.push({ t: current, p: power.production, c: power.consumption });
      store.data.samples[station.id] = list.slice(-MAX_SAMPLES);
    }
    const known = new Set(stations.map((station) => String(station.id)));
    for (const id of Object.keys(store.data.samples)) {
      if (!known.has(String(id))) {
        delete store.data.samples[id];
      }
    }
  }

  /**
   * @description Fire the scene events, publish everything.
   * @returns {Promise<void>}
   */
  async function digest() {
    sample();
    const { events, seen } = detectEvents({
      gladys,
      stations,
      seen: store.data.seen,
      now: now(),
      language: textLanguage(),
    });
    store.data.seen = seen;
    for (const event of events) {
      try {
        await gladys.publishSceneEvent(event.key, event.data);
      } catch (err) {
        logger.warn(`Unable to fire ${event.key}: ${err.message}`);
      }
    }
    if (events.length) {
      logger.info(`${events.length} scene event(s) fired`);
    }
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    await publishQuietly();
    await store.save();
    refreshWidgets(Object.values(WIDGETS));
  }

  /**
   * @description The summary of the stations, for the status messages.
   * @param {string} l - The language.
   * @returns {string} The summary.
   */
  const stationsSummary = (l) =>
    stations
      .map((station) =>
        t('statusStation', l, { name: station.name, batteries: station.batteries?.length ?? 0 }),
      )
      .join(', ');

  /**
   * @description The multi-language message of a failed reading.
   * @param {Error} err - The error.
   * @param {number} minutes - Minutes before the next try.
   * @returns {object} The message.
   */
  function errorMessage(err, minutes) {
    const detail = String(err.message).slice(0, 80);
    if (err.kind === 'auth') {
      return all('statusAuth', { detail });
    }
    return err.kind === 'refused' || err.kind === 'invalid'
      ? all('statusRefused', { detail, minutes })
      : all('statusUnreachable', { detail, minutes });
  }

  /**
   * @description One reading round.
   * @param {object} [options] - `{ force }`.
   * @returns {Promise<boolean>} True when the cloud was read.
   */
  async function round({ force = false } = {}) {
    if (!hasAccount(config)) {
      await reportStatus(false, all('noAccount'));
      return false;
    }
    if (authBlocked) {
      return false;
    }
    try {
      await readAll({ force });
    } catch (err) {
      failures += 1;
      lastError = { at: now(), kind: err.kind ?? 'error', message: err.message };
      if (err.kind === 'auth') {
        authBlocked = true;
      }
      logger.warn(`Isypower Cloud reading failed (${err.kind ?? 'error'}): ${err.message}`);
      const minutes = Math.max(1, Math.round(nextDelay(true) / MINUTE_MS));
      await reportStatus(false, errorMessage(err, minutes));
      return false;
    }
    failures = 0;
    lastError = null;
    try {
      await digest();
    } catch (err) {
      logger.error('Processing', err);
    }
    await reportStatus(
      true,
      stations.length
        ? all('statusConnected', (l) => ({
            stations: stationsSummary(l),
            interval: config.interval,
          }))
        : all('statusNoStation'),
    );
    return true;
  }

  /**
   * @description Run one reading at a time.
   * @param {object} [options] - round() options.
   * @returns {Promise<boolean>} The result of round().
   */
  function read(options) {
    if (!running) {
      running = round(options).finally(() => {
        running = null;
      });
    }
    return running;
  }

  // --- Timer -------------------------------------------------------------------------

  /**
   * @description The delay before the next reading.
   * @param {boolean} [failed] - After a failure.
   * @returns {number} Milliseconds.
   */
  function nextDelay(failed = lastError !== null) {
    const interval = config.interval * MINUTE_MS;
    return failed && failures <= 1 ? Math.min(interval, RETRY_MS) : interval;
  }

  /**
   * @description Arm the timer for the next reading.
   */
  function schedule() {
    if (!timers || stopped) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(tick, nextDelay());
    timer.unref?.();
  }

  /**
   * @description What the timer does when it fires.
   * @returns {Promise<void>}
   */
  async function tick() {
    try {
      await read();
    } catch (err) {
      logger.error('Timer', err);
    }
    schedule();
  }

  // --- Lookups -----------------------------------------------------------------------

  /**
   * @description The station of a device external id (or the first station).
   * @param {unknown} externalId - A station device external id, or nothing.
   * @returns {object|null} The station.
   */
  function stationOf(externalId) {
    if (externalId) {
      return (
        stations.find((station) => stationIds(gladys, station.id).device === externalId) ?? null
      );
    }
    return stations[0] ?? null;
  }

  /**
   * @description The battery of a device external id (or the first battery).
   * @param {unknown} externalId - A battery device external id, or nothing.
   * @returns {object|null} The battery.
   */
  function batteryOf(externalId) {
    if (externalId) {
      return (
        allBatteries().find(
          (battery) => batteryIds(gladys, battery.serial).device === externalId,
        ) ?? null
      );
    }
    return allBatteries()[0] ?? null;
  }

  /**
   * @description The energy report of a period: today and lifetime from the
   * last reading, this month and this year read on demand (cached).
   * @param {object} station - The station.
   * @param {string} period - day, month, year or all.
   * @returns {Promise<{ report: object, production: number|null }>} The report.
   */
  async function reportOf(station, period) {
    const production = station.info?.production?.[period] ?? null;
    if (period === 'day' || period === 'all') {
      const report = period === 'day' ? station.today : station.totals;
      if (!report) {
        throw new Error('not read yet');
      }
      return { report, production };
    }
    const date = period === 'month' ? today().slice(0, 7) : today().slice(0, 4);
    const key = `${station.id}:${period}:${date}`;
    const cached = reportCache.get(key);
    if (cached && now() - cached.at < REPORT_CACHE_MS) {
      return { report: cached.report, production };
    }
    const report = parseReport(await api.report(station.id, period, date));
    reportCache.set(key, { at: now(), report });
    return { report, production };
  }

  // --- Battery commands --------------------------------------------------------------

  /**
   * @description Read the settings of a battery again, publish them.
   * @param {object} battery - The battery.
   * @returns {Promise<void>}
   */
  async function rereadSettings(battery) {
    try {
      const settings = parseBatterySettings(await api.batterySettings(battery.serial));
      if (settings) {
        battery.settings = settings;
        battery.settingsReadAt = now();
      }
    } catch (err) {
      logger.warn(`Settings of battery ${battery.serial} not read again: ${err.message}`);
    }
    await publishQuietly();
    refreshWidgets([WIDGETS.BATTERY]);
  }

  /**
   * @description Change the control mode (and the manual mode) of a battery.
   * @param {object} battery - The battery.
   * @param {object} wanted - `{ controlMode, manualMode, power }` (names; the
   * manual mode and power only matter in manual control).
   * @returns {Promise<object>} `{ controlMode, manualMode, power }` sent.
   */
  async function applyMode(battery, { controlMode, manualMode, power }) {
    if (!battery.modes) {
      throw Object.assign(new Error('this battery follows its master battery'), {
        message_key: 'toastNoModes',
      });
    }
    if (!(controlMode in CONTROL_MODES)) {
      throw new Error(`Unknown control mode: ${controlMode}`);
    }
    if (controlMode === 'intelligent' && battery.settings?.hasMeter === false) {
      throw Object.assign(new Error('the intelligent mode needs the smart meter'), {
        message_key: 'toastNoMeter',
      });
    }
    if (manualMode !== undefined && manualMode !== null && !(manualMode in MANUAL_MODES)) {
      throw new Error(`Unknown manual mode: ${manualMode}`);
    }
    await api.setControlMode(battery.serial, CONTROL_MODES[controlMode]);
    let sent = { controlMode, manualMode: null, power: null };
    if (controlMode === 'manual' && manualMode) {
      const settings = battery.settings ?? {};
      let watts = 0;
      if (manualMode !== 'standby') {
        const fallback = manualMode === 'charge' ? settings.maxCharge : settings.maxDischarge;
        const chosen = Number.isFinite(power) ? power : settings.manualPower || fallback || 0;
        watts = Math.max(0, Math.min(MAX_MANUAL_POWER, Math.round(chosen)));
      }
      await api.setManualMode(battery.serial, MANUAL_MODES[manualMode], watts);
      sent = { controlMode, manualMode, power: watts };
    }
    await rereadSettings(battery);
    return sent;
  }

  /**
   * @description Change the minimum charge of a battery.
   * @param {object} battery - The battery.
   * @param {number} value - %, rounded to a step of 5 within 5 to 100.
   * @returns {Promise<number>} The level sent.
   */
  async function applyMinimum(battery, value) {
    if (!Number.isFinite(value)) {
      throw new Error('The minimum charge must be a number');
    }
    const level = Math.max(MIN_SOC.min, Math.min(MIN_SOC.max, Math.round(value / 5) * 5));
    await api.setMinimumCharge(battery.serial, level);
    await rereadSettings(battery);
    return level;
  }

  /**
   * @description The multi-language message of a refused command.
   * @param {Error} err - The error.
   * @returns {object} The message.
   */
  const commandError = (err) =>
    err.message_key
      ? all(err.message_key)
      : all('toastFailed', { detail: String(err.message).slice(0, 120) });

  gladys.onSetValue(async (device, feature, value) => {
    const battery = batteryOf(device?.external_id);
    if (!battery) {
      throw new Error(`Unknown battery: ${device?.external_id}`);
    }
    const key = String(feature?.external_id ?? '')
      .split(':')
      .pop();
    const wanted = String(value);
    if (key === 'control_mode') {
      await applyMode(battery, {
        controlMode: wanted,
        manualMode: wanted === 'manual' ? battery.settings?.manualMode : null,
      });
    } else if (key === 'manual_mode') {
      await applyMode(battery, { controlMode: 'manual', manualMode: wanted });
    } else {
      throw new Error(`Read-only feature: ${feature?.external_id}`);
    }
  });

  // --- Dashboard widgets -------------------------------------------------------------

  gladys.onWidgetGet(WIDGETS.OVERVIEW, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const station = stationOf(readWidgetSettings(settings).device);
    if (!station) {
      return messageContent(t(readAt ? 'widgetNoStation' : 'widgetNotRead', lang));
    }
    if (!station.info) {
      return messageContent(t('widgetNotRead', lang), 60);
    }
    return buildOverviewWidget({
      station,
      samples: store.data.samples[station.id] ?? [],
      now: now(),
      language: lang,
      timeZone,
    });
  });

  gladys.onWidgetGet(WIDGETS.REPORT, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { device, period } = readWidgetSettings(settings);
    const station = stationOf(device);
    if (!station) {
      return messageContent(t(readAt ? 'widgetNoStation' : 'widgetNotRead', lang));
    }
    try {
      const { report, production } = await reportOf(station, period);
      return buildReportWidget({ station, period, report, production, language: lang });
    } catch (err) {
      return messageContent(
        station.info
          ? t('widgetReportError', lang, { detail: err.message })
          : t('widgetNotRead', lang),
        60,
      );
    }
  });

  gladys.onWidgetGet(WIDGETS.BATTERY, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const battery = batteryOf(readWidgetSettings(settings).device);
    if (!battery) {
      return messageContent(t(readAt ? 'widgetNoBattery' : 'widgetNotRead', lang));
    }
    return buildBatteryWidget({ battery, language: lang });
  });

  gladys.onWidgetAction(WIDGETS.BATTERY, async (actionKey, params = {}, context = {}) => {
    const battery = allBatteries().find((candidate) => candidate.serial === params.serial);
    if (!battery) {
      return all('toastUnknownBattery');
    }
    const values = context.values ?? {};
    const name = battery.name ?? battery.serial;
    try {
      if (actionKey === WIDGET_ACTIONS.SET_MODE) {
        const power =
          values.power === undefined || values.power === null ? undefined : Number(values.power);
        const sent = await applyMode(battery, {
          controlMode: values.control_mode,
          manualMode: values.manual_mode ?? null,
          power,
        });
        return all('toastModeDone', (l) => ({
          name,
          mode: [
            t(`mode_${sent.controlMode}`, l),
            sent.manualMode ? t(`mode_${sent.manualMode}`, l) : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }));
      }
      if (actionKey === WIDGET_ACTIONS.SET_MINIMUM) {
        const level = await applyMinimum(battery, Number(values.level));
        return all('toastMinimumDone', { name, level });
      }
    } catch (err) {
      logger.warn(`Widget action ${actionKey} on ${battery.serial}: ${err.message}`);
      return commandError(err);
    }
    throw new Error(`Unknown widget action: ${actionKey}`);
  });

  // --- Scene actions -----------------------------------------------------------------

  /**
   * @description The battery a scene action names.
   * @param {unknown} value - The device external id.
   * @returns {object} The battery.
   * @throws {Error} When unknown.
   */
  function actionBattery(value) {
    const battery = batteryOf(value);
    if (!battery) {
      throw new Error(`Unknown battery: ${value ?? '(none)'}`);
    }
    return battery;
  }

  gladys.onSceneAction(SCENE_ACTIONS.SET_BATTERY_MODE, async (fields = {}) => {
    const battery = actionBattery(fields.battery);
    const power =
      fields.power === undefined || fields.power === null || fields.power === ''
        ? undefined
        : Number(fields.power);
    const sent = await applyMode(battery, {
      controlMode: fields.control_mode,
      manualMode: fields.manual_mode || null,
      power,
    });
    return pick(
      { control_mode: sent.controlMode, manual_mode: sent.manualMode, power: sent.power },
      ['control_mode', 'manual_mode', 'power'],
    );
  });

  gladys.onSceneAction(SCENE_ACTIONS.SET_MINIMUM_CHARGE, async (fields = {}) => {
    const battery = actionBattery(fields.battery);
    const level = await applyMinimum(battery, Number(fields.level));
    return { minimum_charge: level };
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_ENERGY_REPORT, async (fields = {}) => {
    const station = stationOf(fields.station || null);
    if (!station) {
      throw new Error(`Unknown station: ${fields.station ?? '(none)'}`);
    }
    const period = ['day', 'month', 'year', 'all'].includes(fields.period) ? fields.period : 'day';
    const { report, production } = await reportOf(station, period);
    const l = textLanguage();
    const round3 = (value) => (value === null ? null : Math.round(value * 1000) / 1000);
    return pick(
      {
        production_kwh: round3(production),
        consumption_kwh: round3(report.consumption),
        grid_import_kwh: round3(report.gridImport),
        grid_export_kwh: round3(report.gridExport),
        battery_charge_kwh: round3(report.batteryCharge),
        battery_discharge_kwh: round3(report.batteryDischarge),
        self_sufficiency_percent:
          report.selfSufficiency === null ? null : Math.round(report.selfSufficiency),
        summary: t('reportSummary', l, {
          station: station.name,
          period: t(`period_${period}`, l).toLowerCase(),
          production: formatEnergy(production, l) || '-',
          consumption: formatEnergy(report.consumption, l) || '-',
          bought: formatEnergy(report.gridImport, l) || '-',
          sold: formatEnergy(report.gridExport, l) || '-',
          selfSufficiency: formatPercent(report.selfSufficiency, l) || '-',
        }),
      },
      REPORT_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------
  gladys.onAction(ACTIONS.REFRESH, async () => {
    if (!hasAccount(config)) {
      return all('noAccount');
    }
    if (readAt && now() - readAt < REFRESH_MIN_INTERVAL_MS && !lastError) {
      return all('refreshTooSoon', { seconds: Math.round((now() - readAt) / 1000) });
    }
    // A manual refresh is the user's decision: try the login again.
    authBlocked = false;
    const ok = await read({ force: true });
    schedule();
    if (!ok) {
      return lastStatus ? JSON.parse(lastStatus)[1] : all('noAccount');
    }
    return stations.length
      ? all('refreshDone', (l) => ({ stations: stationsSummary(l) }))
      : all('statusNoStation');
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const report = {
      version: VERSION,
      timeZone: timeZone ?? null,
      today: today(),
      interval: config.interval,
      account: Boolean(config.username),
      authBlocked,
      readAt: readAt ? new Date(readAt).toISOString() : null,
      stations: stations.map((station) => ({
        id: station.id,
        capacity: station.capacity,
        created: createdDevices.has(stationIds(gladys, station.id).device),
        info: station.info
          ? {
              ...station.info,
              lastUpdate: station.info.lastUpdate
                ? new Date(station.info.lastUpdate).toISOString()
                : null,
            }
          : null,
        today: station.today,
        totals: station.totals,
        equipment: (station.equipment ?? []).map(
          ({ type, typeName, online, firmware, cluster }) => ({
            type,
            typeName,
            online,
            firmware,
            cluster,
          }),
        ),
        batteries: (station.batteries ?? []).map((battery) => ({
          created: createdDevices.has(batteryIds(gladys, battery.serial).device),
          modes: battery.modes,
          live: battery.live,
          settings: battery.settings,
        })),
        upgrades: station.upgradesKnown?.length ?? null,
      })),
      shapes,
      lastError,
      failures,
      requests: api?.requests ?? null,
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Isypower diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    if (!stations.length) {
      await read({ force: true });
    }
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    await publishQuietly();
    await store.save();
    refreshWidgets(Object.values(WIDGETS));
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
    connectApi();
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previous = `${config.username}\n${config.password}`;
    await loadConfig(rawConfig);
    if (`${config.username}\n${config.password}` !== previous) {
      // Another account: start from scratch.
      stations = [];
      stationsReadAt = null;
      readAt = null;
      reportCache.clear();
    }
    authBlocked = false;
    lastDiscovery = null;
    failures = 0;
    logger.info('Configuration updated');
    await read({ force: true });
    schedule();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await loadConfig();
      await store.load();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await read({ force: true });
      schedule();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearTimeout(timer);
    await store.save();
  });

  return {
    store,
    read,
    tick,
    getConfig: () => config,
    getStations: () => stations,
    isAuthBlocked: () => authBlocked,
    getApi: () => api,
    whenReady: () => startup,
  };
}

export {
  createApp,
  pick,
  shapeOf,
  ACTIONS,
  SCENE_ACTIONS,
  REPORT_OUTPUTS,
  REFRESH_MIN_INTERVAL_MS,
};
