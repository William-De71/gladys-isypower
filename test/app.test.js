// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Isypower Cloud (test/helpers/fixtures.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, SCENE_ACTIONS, ACTIONS, REPORT_OUTPUTS } from '../src/app.js';
import { WIDGETS, WIDGET_ACTIONS } from '../src/widgets.js';
import { TRIGGERS } from '../src/events.js';
import {
  fakeCloud,
  storePath,
  silent,
  NOW,
  TZ,
  ACCOUNT,
  STATION_ID,
  BATTERY_SN,
  VM_SN,
} from './helpers/fixtures.js';

const CONFIG = { ...ACCOUNT, interval: '3' };
const STATION = `ext:test-integration:station:${STATION_ID}`;
const BATTERY = `ext:test-integration:battery:${BATTERY_SN.toLowerCase()}`;
const MINUTE = 60 * 1000;

/**
 * @description The integration, connected to a fake Gladys and a fake cloud.
 * @param {object} [options] - `{ config, path, prepare }` (prepare: `(cloud) => void`, before connecting).
 * @returns {Promise<object>} `{ gladys, app, cloud, clock, path }`.
 */
async function startApp({ config = CONFIG, path = storePath(), prepare } = {}) {
  const clock = { now: NOW };
  const cloud = fakeCloud({ now: () => clock.now });
  prepare?.(cloud);
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    fetch: cloud,
    storePath: path,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, app, cloud, clock, path };
}

const created = async (gladys, externalId) => {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  assert.ok(device, `${externalId} is offered`);
  await gladys.fake.deviceCreated(device);
  return device;
};
const eventsOf = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('the account becomes a station and a battery, read with the documented headers', async (t) => {
  const { gladys, cloud } = await startApp();
  t.after(() => gladys.fake.shutdown());
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [
      device.external_id,
      device.name,
      device.features.length,
    ]),
    [
      [STATION, 'Isypower Maison', 11],
      [BATTERY, 'Isypower IZY-BAT 5K', 8],
    ],
  );
  const login = cloud.callsTo('/api/login')[0];
  assert.equal(login.method, 'POST');
  assert.deepEqual(login.body, ACCOUNT);
  assert.equal(login.headers['app-platform'], 'izy');
  assert.equal(cloud.callsTo('/api/login').length, 1, 'one login, the token is reused');
  const info = cloud.callsTo('/api/v3/powerStations/info/')[0];
  assert.match(info.headers['x-tts-access-token'], /^ey/);
  assert.equal(info.headers.authorization, undefined);
  assert.equal(info.headers['accept-language'], 'fr');
  const day = cloud.calls.find((call) => call.url.includes('timeType=day'));
  assert.match(day.url, /searchTime=2026-10-17/);
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.fr,
    'Connecté à Isypower Cloud : Maison (1 batterie(s)). Lecture toutes les 3 min.',
  );
  // The first reading is a baseline: no scene event.
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('states once the devices are created, with the signs and units of Gladys', async (t) => {
  const { gladys } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, STATION);
  await created(gladys, BATTERY);
  const state = (key) => gladys.fake.lastState(key);
  assert.equal(state(`${STATION}:production_power`), 2140);
  assert.equal(state(`${STATION}:production_index`), 5230.75);
  assert.equal(state(`${STATION}:consumption_power`), 860);
  assert.equal(state(`${STATION}:grid_power`), -980, 'exporting: negative');
  assert.equal(state(`${STATION}:grid_import_index`), 3120.6);
  assert.equal(state(`${STATION}:grid_export_index`), 1480.9);
  assert.equal(state(`${STATION}:battery_level`), 62);
  assert.equal(state(`${STATION}:battery_charge_power`), 300);
  assert.equal(state(`${STATION}:battery_discharge_power`), 0);
  assert.equal(state(`${STATION}:battery_charge_index`), 820.3);
  assert.equal(state(`${BATTERY}:level`), 62);
  assert.equal(state(`${BATTERY}:energy`), 3.1);
  assert.equal(state(`${BATTERY}:charge_power`), 300);
  assert.equal(state(`${BATTERY}:temperature`), 24.5);
  assert.equal(state(`${BATTERY}:control_mode`), 'calendar');
  assert.equal(state(`${BATTERY}:manual_mode`), 'standby');
});

test('an index going down is never published; transitions fire one scene event each', async (t) => {
  const { gladys, app, cloud, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  await created(gladys, STATION);
  cloud.state.reports.all = { ...cloud.state.reports.all, meter_energy_p: 0 };
  cloud.state.battery = {
    ...cloud.state.battery,
    onlineState: 1002,
    dischargeData: { power1: 650 },
  };
  cloud.state.devices = cloud.state.devices.map((device) =>
    device.sn === VM_SN ? { ...device, onlineState: 0 } : device,
  );
  clock.now += 3 * MINUTE;
  await app.tick();
  assert.equal(gladys.fake.lastState(`${STATION}:grid_import_index`), 3120.6, 'kept');
  const [battery] = eventsOf(gladys, TRIGGERS.BATTERY_STATE);
  assert.deepEqual(battery.data, {
    station: STATION,
    station_name: 'Maison',
    battery: BATTERY,
    battery_name: 'IZY-BAT 5K',
    state: 'discharging',
    previous_state: 'charging',
    level: 62,
    power: 650,
  });
  const [offline] = eventsOf(gladys, TRIGGERS.CONNECTION);
  assert.equal(offline.data.state, 'offline');
  assert.equal(offline.data.equipment_type, 'vm');
  assert.equal(offline.data.equipment_type_name, 'Micro-onduleur');
  // Nothing new: nothing fired.
  clock.now += 3 * MINUTE;
  await app.tick();
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('a silent box fires station_reporting_changed, and again when it reports', async (t) => {
  const { gladys, app, cloud, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  clock.now += 25 * MINUTE;
  await app.tick();
  const [silentEvent] = eventsOf(gladys, TRIGGERS.REPORTING);
  assert.equal(silentEvent.data.state, 'stale');
  assert.equal(silentEvent.data.minutes_since_update, 27);
  cloud.state.info = { ...cloud.state.info, lastUpdate: '2026-10-17 14:24:00 UTC+02:00' };
  clock.now += 1 * MINUTE;
  await app.tick();
  assert.deepEqual(
    eventsOf(gladys, TRIGGERS.REPORTING).map((event) => event.data.state),
    ['stale', 'reporting'],
  );
});

test('the events survive a restart: no duplicate after reconnecting', async (t) => {
  const path = storePath();
  const first = await startApp({ path });
  first.cloud.state.battery = { ...first.cloud.state.battery, onlineState: 1000 };
  first.clock.now += 3 * MINUTE;
  await first.app.tick();
  assert.equal(eventsOf(first.gladys, TRIGGERS.BATTERY_STATE).length, 1);
  await first.gladys.fake.shutdown();
  const stored = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(stored.seen.batteries[BATTERY_SN], 'standby');
  assert.equal(JSON.stringify(stored).includes(ACCOUNT.password), false, 'no password in /data');

  const second = await startApp({
    path,
    prepare: (cloud) => {
      cloud.state.battery = { ...cloud.state.battery, onlineState: 1000 };
    },
  });
  t.after(() => second.gladys.fake.shutdown());
  assert.deepEqual(second.gladys.fake.sceneEvents, []);
});

test('a wrong password stops the readings until the configuration changes', async (t) => {
  const { gladys, app, cloud, clock } = await startApp({
    config: { ...CONFIG, password: 'wrong' },
  });
  t.after(() => gladys.fake.shutdown());
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.fr,
    /Le compte ou le mot de passe est incorrect/,
  );
  assert.equal(app.isAuthBlocked(), true);
  clock.now += 10 * MINUTE;
  await app.tick();
  assert.equal(cloud.callsTo('/api/login').length, 1, 'never retried by the timer');
  await gladys.fake.configUpdated(CONFIG);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(app.isAuthBlocked(), false);
});

test('an expired token is renewed once; an unreachable cloud is reported', async (t) => {
  const { gladys, app, cloud, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  cloud.state.expireToken = true;
  clock.now += 3 * MINUTE;
  assert.equal(await app.read(), true);
  assert.equal(cloud.callsTo('/api/login').length, 2);
  cloud.state.fail = { status: 502 };
  clock.now += 3 * MINUTE;
  assert.equal(await app.read(), false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /cannot be reached \(HTTP 502\)\. Next try in 2 min/,
  );
  cloud.state.fail = null;
  clock.now += 2 * MINUTE;
  assert.equal(await app.read(), true);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('no account: a message, no request', async (t) => {
  const { gladys, cloud } = await startApp({ config: {} });
  t.after(() => gladys.fake.shutdown());
  assert.equal(cloud.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Enter the e-mail and the password/);
});

test('the mode dropdowns send the commands of the application', async (t) => {
  const { gladys, cloud } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const device = await created(gladys, BATTERY);
  const feature = (key) => device.features.find((f) => f.external_id === `${BATTERY}:${key}`);
  assert.deepEqual(
    feature('control_mode').supported_options.map((option) => option.value),
    ['intelligent', 'manual', 'calendar'],
  );
  const ack = await gladys.fake.setValue(device, feature('control_mode'), 'intelligent');
  assert.equal(ack.success, true);
  assert.deepEqual(cloud.writes.at(-1), {
    path: `/api/v2/device/yz/battery/mode/${BATTERY_SN}`,
    body: { ctr_mode: 0 },
  });
  assert.equal(gladys.fake.lastState(`${BATTERY}:control_mode`), 'intelligent');

  await gladys.fake.setValue(device, feature('manual_mode'), 'charge');
  assert.deepEqual(
    cloud.writes.slice(-2).map((write) => write.body),
    [{ ctr_mode: 1 }, { mode: 1, power: 2400 }],
    'manual control, the maximum charge power when no manual power is set',
  );
  assert.equal(gladys.fake.lastState(`${BATTERY}:manual_mode`), 'charge');
  const refused = await gladys.fake.setValue(device, feature('control_mode'), 'turbo');
  assert.equal(refused.success, false);
});

test('scene actions: battery mode, minimum charge, energy report', async (t) => {
  const { gladys, cloud } = await startApp();
  t.after(() => gladys.fake.shutdown());
  const mode = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_BATTERY_MODE, {
    battery: BATTERY,
    control_mode: 'manual',
    manual_mode: 'discharge',
    power: 650,
  });
  assert.equal(mode.success, true);
  assert.deepEqual(mode.data.outputs, {
    control_mode: 'manual',
    manual_mode: 'discharge',
    power: 650,
  });
  assert.deepEqual(cloud.writes.at(-1).body, { mode: 2, power: 650 });

  const minimum = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_MINIMUM_CHARGE, {
    battery: BATTERY,
    level: 33,
  });
  assert.deepEqual(minimum.data.outputs, { minimum_charge: 35 });
  assert.deepEqual(cloud.writes.at(-1), {
    path: `/api/v2/device/yz/battery/min_soc/${BATTERY_SN}`,
    body: { value: 35 },
  });

  const report = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_ENERGY_REPORT, {
    period: 'month',
  });
  assert.deepEqual(Object.keys(report.data.outputs).sort(), [...REPORT_OUTPUTS].sort());
  assert.equal(report.data.outputs.production_kwh, 182.3);
  assert.equal(report.data.outputs.grid_import_kwh, 51.4);
  assert.equal(report.data.outputs.self_sufficiency_percent, 63);
  assert.equal(
    report.data.outputs.summary,
    'Maison, ce mois-ci : 182 kWh produits, 140 kWh consommés, 51,4 kWh achetés, 60,2 kWh vendus, autonomie 63 %.',
  );
  assert.match(
    cloud.calls.find((call) => call.url.includes('timeType=month')).url,
    /searchTime=2026-10/,
  );
  // A scene action never fires a scene event.
  assert.deepEqual(gladys.fake.sceneEvents, []);
  const unknown = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_MINIMUM_CHARGE, {
    battery: 'ext:test-integration:battery:nope',
    level: 20,
  });
  assert.equal(unknown.success, false);
});

test('widgets: valid contents in every language, and the battery buttons', async (t) => {
  const { gladys, app, cloud, clock } = await startApp();
  t.after(() => gladys.fake.shutdown());
  for (let i = 0; i < 4; i += 1) {
    clock.now += 10 * MINUTE;
    await app.tick();
  }
  for (const key of Object.values(WIDGETS)) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const answer = await gladys.fake.widgetGet(key, { language });
      assert.equal(answer.success, true);
      assert.deepEqual(validateWidgetContent(answer.data.content), [], `${key} ${language}`);
    }
  }
  const overview = (await gladys.fake.widgetGet(WIDGETS.OVERVIEW, { language: 'fr' })).data.content;
  assert.ok(overview.components.some((c) => c.type === 'chart'));
  const report = (
    await gladys.fake.widgetGet(WIDGETS.REPORT, { language: 'en', settings: { period: 'year' } })
  ).data.content;
  assert.equal(report.components[0].text, 'Maison · This year');

  const toast = await gladys.fake.widgetAction(
    WIDGETS.BATTERY,
    WIDGET_ACTIONS.SET_MINIMUM,
    { serial: BATTERY_SN },
    { values: { level: 20 } },
  );
  assert.deepEqual(toast.data.message, {
    en: 'Minimum charge of IZY-BAT 5K: 20 %.',
    fr: 'Charge minimale de IZY-BAT 5K : 20 %.',
    de: 'Mindestladung von IZY-BAT 5K: 20 %.',
    es: 'Carga mínima de IZY-BAT 5K: 20 %.',
  });
  cloud.state.fail = { code: 500 };
  const refused = await gladys.fake.widgetAction(
    WIDGETS.BATTERY,
    WIDGET_ACTIONS.SET_MODE,
    { serial: BATTERY_SN },
    { values: { control_mode: 'manual', manual_mode: 'standby' } },
  );
  assert.equal(refused.data.message.fr, 'Isypower Cloud a refusé : Erreur interne');
});

test('the configuration actions: refresh and diagnostic (without secrets)', async (t) => {
  const logs = [];
  const clock = { now: NOW };
  const cloud = fakeCloud({ now: () => clock.now });
  const gladys = createFakeGladys({ config: CONFIG });
  createApp(gladys, {
    fetch: cloud,
    storePath: storePath(),
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    logger: { ...silent, info: (message) => logs.push(message) },
  });
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const soon = await gladys.fake.action(ACTIONS.REFRESH);
  assert.match(soon.data.message.en, /Already read/);
  clock.now += 2 * MINUTE;
  const done = await gladys.fake.action(ACTIONS.REFRESH);
  assert.equal(done.data.message.fr, 'Lu : Maison (1 batterie(s)).');
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.en, /Diagnostic written/);
  const written = logs.filter((line) => line.startsWith('Isypower diagnostic')).join('');
  assert.ok(written.includes('"shapes"'));
  for (const secret of [ACCOUNT.password, ACCOUNT.username, BATTERY_SN, VM_SN, 'Lilas']) {
    assert.equal(written.includes(secret), false, `${secret} is not logged`);
  }
});
