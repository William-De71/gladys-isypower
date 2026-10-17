// A fake Isypower Cloud for the tests, served through the `fetch` option of the
// integration. Tests never touch the network.
//
// The answers are RECONSTRUCTED, not captured: there is no public
// documentation, and no account was available. Their fields are the ones the
// Home Assistant integration izypower_cloud reads (sensor.py, select.py,
// number.py), with its wrappings: `{ code, msg, data }` for the lists and the
// battery, the station info and the reports read at the top level. The error
// answers (HTTP 200 with `code` 500 for a wrong account, 401 for a refused
// token) were checked against the real server on 2026-10-17.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 2026-10-17 14:00 in Paris.
const NOW = Date.parse('2026-10-17T12:00:00Z');
const TZ = 'Europe/Paris';
const HOST = 'application.izypowercloud.fr';
const ACCOUNT = { username: 'owner@example.com', password: 's3cret pass' };
const STATION_ID = 41235;
const BATTERY_SN = 'IZB5K0001234';
const VM_SN = 'IZM800005678';
const METER_SN = 'IZC300009012';

const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary path for the file kept in /data.
 * @returns {string} The path (its directory exists, the file does not).
 */
const storePath = () => join(mkdtempSync(join(tmpdir(), 'isypower-')), 'isypower.json');

/**
 * @description A JWT with an expiry (not signed: the integration only reads `exp`).
 * @param {number} exp - Expiry, in seconds.
 * @returns {string} The token.
 */
const jwt = (exp) =>
  [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 'owner', exp })).toString('base64url'),
    'signature',
  ].join('.');

/**
 * @description The default content of the fake account.
 * @returns {object} The state.
 */
function defaultState() {
  return {
    stations: [
      {
        stationsId: STATION_ID,
        stationName: 'Maison',
        installedCapacity: 3200,
        address: '1 rue des Lilas, Mâcon',
      },
    ],
    info: {
      // At the top level, as the Home Assistant integration reads it.
      power: 2140,
      consumption: 860,
      grid_power: -980,
      battery_power: 300,
      battery_pv_power: 0,
      battery_soc: 62,
      ev_power: 0,
      lastUpdate: '2026-10-17 13:58:30 UTC+02:00',
      extraData: {
        production: { day: '9.84', month: 182.3, year: 2410.5, all: 5230.75 },
        consumption: { day: 6.1 },
      },
      deviceTypes: [
        { value: 'vm', name: 'Micro-onduleur' },
        { value: 'battery', name: 'Batterie' },
        { value: 'meter', name: 'Compteur' },
      ],
    },
    reports: {
      day: {
        total_consumption: 6.1,
        consumption: 4.2,
        meter_energy_p: 1.3,
        meter_energy_n: 3.4,
        storage_in: 2.2,
        storage_out: 0.6,
        energy_self_rate: '78.7%',
        consumption_rate: '42.7%',
        cover_rate: '161%',
      },
      all: {
        total_consumption: 6120.4,
        consumption: 2510.2,
        meter_energy_p: 3120.6,
        meter_energy_n: 1480.9,
        storage_in: 820.3,
        storage_out: 760.1,
        energy_self_rate: '49%',
        consumption_rate: '48%',
      },
      month: {
        total_consumption: 140.2,
        consumption: 70.5,
        meter_energy_p: 51.4,
        meter_energy_n: 60.2,
        storage_in: 30.1,
        storage_out: 28.4,
        energy_self_rate: '63.3%',
        consumption_rate: '38.7%',
      },
      year: {
        total_consumption: 3110.4,
        consumption: 1200.2,
        meter_energy_p: 1500.6,
        meter_energy_n: 800.1,
        storage_in: 410.3,
        storage_out: 380.1,
        energy_self_rate: '51.7%',
        consumption_rate: '49.8%',
      },
    },
    devices: [
      {
        deviceId: 9001,
        sn: VM_SN,
        deviceName: 'Micro-onduleur toit',
        deviceType: 'vm',
        onlineState: 1,
        softwareVersion: 'V1.2.7',
      },
      {
        deviceId: 9002,
        sn: BATTERY_SN,
        deviceName: 'IZY-BAT 5K',
        deviceType: 'battery',
        onlineState: 1,
        softwareVersion: 'V2.0.3',
        connectInfoJson: { clusterMode: '1002' },
        dataDtos: [{ key: '6002', value: '62.0%' }],
      },
      {
        deviceId: 9003,
        serialNumber: METER_SN,
        deviceName: 'Compteur',
        deviceType: 'meter',
        onlineState: 1,
      },
    ],
    battery: {
      soc: 62,
      socKwh: 3.1,
      socTemp: '24.5',
      onlineState: 1001,
      chargeData: { power1: 0, power2: 300, remainingTime: '4h' },
      dischargeData: { power1: 0, power2: 0, remainingTime: '-' },
      consumptionPower: 860,
      batteryPower: 300,
      offGridPower: 0,
      items: [{ sn: 'LINK01', soc: 62, kwh: 3.1, temp: 24 }],
    },
    settings: {
      mode: { ctr_mode: 2 },
      manual: { mode: 0, power: 0 },
      min_soc: 10,
      hasMeter: true,
      power: { max_in_power: 2400, max_out_power: 800 },
    },
    upgrades: [{ sn: VM_SN, needUpgrade: false }],
    // `{ status }` for every request, 'network' to throw, or a body code.
    fail: null,
    wrongPassword: false,
    // Refuse the next token once (code 401).
    expireToken: false,
    tokenLifetime: 3600,
  };
}

/**
 * @description The fake Isypower Cloud.
 * @param {object} [options] - `{ now }`: `() => ms`, for the token expiry.
 * @returns {Function} A fetch function, with `.calls`, `.state`, `.writes`.
 */
function fakeCloud({ now = () => NOW } = {}) {
  const state = defaultState();
  const calls = [];
  const writes = [];
  let issued = 0;
  const valid = new Set();
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const ok = (data) => json({ code: 200, msg: 'success', data });

  const fetchFn = async (url, init = {}) => {
    const target = new URL(url);
    const headers = Object.fromEntries(
      Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const body = init.body ? JSON.parse(init.body) : undefined;
    const path = target.pathname.replace('/photo_voltaic', '');
    calls.push({ method: init.method ?? 'GET', url: String(url), path, headers, body });
    if (target.hostname !== HOST) {
      throw new TypeError('unexpected host');
    }
    if (state.fail === 'network') {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.fail?.status) {
      return new Response('<html>Bad gateway</html>', { status: state.fail.status });
    }
    if (path === '/api/login') {
      if (
        state.wrongPassword ||
        body?.username !== ACCOUNT.username ||
        body?.password !== ACCOUNT.password
      ) {
        return json({
          app: '172.28.0.14',
          msg: 'Le compte ou le mot de passe est incorrect',
          code: 500,
        });
      }
      issued += 1;
      const token = jwt(Math.floor(now() / 1000) + state.tokenLifetime);
      const value = `${token}.${issued}`;
      valid.add(value);
      return ok({ token: value });
    }
    const token = headers['x-tts-access-token'];
    if (!valid.has(token) || state.expireToken) {
      state.expireToken = false;
      valid.delete(token);
      return json({ app: '172.28.0.8', msg: '请重新登录', errorKey: 'MEMBER_403', code: 401 });
    }
    if (state.fail?.code) {
      return json({ code: state.fail.code, msg: 'Erreur interne' });
    }
    const id = (prefix) => decodeURIComponent(path.slice(prefix.length));
    if (path === '/api/powerStations/page') {
      return ok({ records: state.stations, total: state.stations.length });
    }
    if (path.startsWith('/api/v3/powerStations/info/')) {
      return json({ code: 200, msg: 'success', ...state.info });
    }
    if (path.startsWith('/api/report/v2/powerStations/data/')) {
      const period = target.searchParams.get('timeType');
      return json({ code: 200, ...(state.reports[period] ?? {}) });
    }
    if (path === '/api/device/page') {
      return ok({ records: state.devices });
    }
    if (path.startsWith('/api/v3/device/upgrade/')) {
      return ok(state.upgrades);
    }
    if (path.startsWith('/izy/v2/battery/')) {
      return id('/izy/v2/battery/') === BATTERY_SN
        ? ok(state.battery)
        : json({ code: 404, msg: 'no' });
    }
    if (path.startsWith('/api/v2/device/cmd/')) {
      return ok(state.settings);
    }
    if (path.startsWith('/api/v2/device/yz/battery/')) {
      writes.push({ path, body });
      if (path.includes('/mode/')) {
        state.settings = { ...state.settings, mode: { ctr_mode: body.ctr_mode } };
      } else if (path.includes('/manual_mode_value/')) {
        state.settings = { ...state.settings, manual: { mode: body.mode, power: body.power } };
      } else if (path.includes('/min_soc/')) {
        state.settings = { ...state.settings, min_soc: body.value };
      }
      return ok(null);
    }
    return json({ code: 404, msg: 'not found' });
  };
  fetchFn.calls = calls;
  fetchFn.writes = writes;
  fetchFn.state = state;
  fetchFn.callsTo = (prefix) => calls.filter((call) => call.path.startsWith(prefix));
  return fetchFn;
}

export {
  NOW,
  TZ,
  HOST,
  ACCOUNT,
  STATION_ID,
  BATTERY_SN,
  VM_SN,
  METER_SN,
  silent,
  storePath,
  jwt,
  fakeCloud,
  defaultState,
};
