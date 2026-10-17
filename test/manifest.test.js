// The manifest against the code: the keys it declares are the ones the code
// handles, the store limits hold, the transport and permissions are right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

import { TRIGGERS } from '../src/events.js';
import { SCENE_ACTIONS, ACTIONS, REPORT_OUTPUTS } from '../src/app.js';
import { WIDGETS, REPORT_PERIODS, MIN_SOC, MAX_MANUAL_POWER } from '../src/widgets.js';
import { AUTO_LANGUAGE, INTERVALS, DEFAULT_INTERVAL } from '../src/config.js';
import { CONTROL_MODES, MANUAL_MODES } from '../src/model.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Isypower');
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-isypower:${pkg.version}`);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/William-De71/gladys-isypower/main/cover.jpg',
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-isypower');
});

test('declares the cloud transport only: Isypower Cloud', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
  assert.match(
    source('../src/isypower-api.js'),
    /https:\/\/application\.izypowercloud\.fr\/photo_voltaic/,
  );
});

test('requires the first Gladys with button forms and text selects; no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.2.0');
  assert.deepEqual(manifest.categories, ['energy']);
  for (const key of ['location', 'network_wake', 'containers', 'network_discovery', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // Button forms (fields) need 5.2.0.
  assert.match(source('../src/widgets.js'), /fields: \[/);
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.values(TRIGGERS).sort(),
  );
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.values(WIDGETS).sort(),
  );
  const app = source('../src/app.js');
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  assert.match(app, /onWidgetAction\(WIDGETS\.BATTERY/);
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((action) => action.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
});

test('the account: an e-mail string and a secret password, the intervals of the code', () => {
  const config = byKey(manifest.config_schema);
  assert.equal(config.get('username').type, 'string');
  assert.equal(config.get('username').required, true);
  assert.equal(config.get('password').type, 'secret');
  assert.equal(config.get('password').required, true);
  const interval = config.get('interval');
  assert.deepEqual(values(interval), INTERVALS.map(String));
  assert.equal(interval.default, String(DEFAULT_INTERVAL));
  for (const field of manifest.config_schema) {
    assert.ok(!['text', 'password'].includes(field.type), `${field.key}: ${field.type}`);
    assert.equal(field.display_if, undefined, field.key);
  }
});

test('the options and outputs are the values the code reads and returns', () => {
  const actions = byKey(manifest.scene_actions);
  const mode = byKey(actions.get('set_battery_mode').fields);
  assert.deepEqual(values(mode.get('control_mode')), Object.keys(CONTROL_MODES));
  assert.deepEqual(values(mode.get('manual_mode')), Object.keys(MANUAL_MODES));
  assert.equal(mode.get('power').max, MAX_MANUAL_POWER);
  assert.equal(mode.get('battery').source, 'devices');
  const minimum = byKey(actions.get('set_minimum_charge').fields).get('level');
  assert.deepEqual([minimum.min, minimum.max], [MIN_SOC.min, MIN_SOC.max]);
  const report = actions.get('get_energy_report');
  assert.deepEqual(values(byKey(report.fields).get('period')), REPORT_PERIODS);
  assert.deepEqual(
    report.outputs.map((output) => output.key),
    REPORT_OUTPUTS,
  );
  const widgets = byKey(manifest.widgets);
  assert.deepEqual(values(byKey(widgets.get('report').settings).get('period')), REPORT_PERIODS);
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(values(byKey(triggers.get('battery_state_changed').fields).get('state')), [
    'charging',
    'discharging',
    'standby',
  ]);
  assert.deepEqual(values(byKey(triggers.get('station_reporting_changed').fields).get('state')), [
    'stale',
    'reporting',
  ]);
});

test('every trigger filter is a key of the event data', () => {
  const dataKeys = {
    battery_state_changed: ['station', 'battery', 'state'],
    equipment_connection_changed: ['station', 'state', 'equipment_type'],
    firmware_update_available: ['station'],
    station_reporting_changed: ['station', 'state'],
  };
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.ok(dataKeys[trigger.key].includes(field.key), `${trigger.key}.${field.key}`);
    }
  }
  const events = source('../src/events.js');
  for (const trigger of manifest.scene_triggers) {
    for (const variable of trigger.variables) {
      assert.match(events, new RegExp(`\\b${variable.key}\\b`), `${trigger.key}.${variable.key}`);
    }
  }
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20);
  assert.ok(manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
    assert.ok(
      (action.fields ?? []).length <= 10 && (action.outputs ?? []).length <= 20,
      action.key,
    );
  }
  for (const widget of manifest.widgets) {
    assert.ok((widget.settings ?? []).length <= 10);
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});
