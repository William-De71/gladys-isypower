// The widget contents against the vocabulary and the budget of the core
// (validateWidgetContent of the SDK), in every language and in the edge cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import {
  buildOverviewWidget,
  buildReportWidget,
  buildBatteryWidget,
  powerChart,
  messageContent,
  readWidgetSettings,
  WIDGET_ACTIONS,
} from '../src/widgets.js';
import { parseStationInfo, parseReport, parseBattery, parseBatterySettings } from '../src/model.js';
import { LANGUAGES } from '../src/i18n.js';
import { defaultState, NOW, TZ, BATTERY_SN } from './helpers/fixtures.js';

const fixtures = defaultState();
const info = parseStationInfo(fixtures.info, TZ);
const STATION = { id: '41235', name: 'Maison', info, today: parseReport(fixtures.reports.day) };
const BATTERY = {
  serial: BATTERY_SN,
  name: 'IZY-BAT 5K',
  modes: true,
  live: parseBattery({ data: fixtures.battery }),
  settings: parseBatterySettings({ data: fixtures.settings }),
};
// A sunny day: a sample every three minutes for 24 hours.
const SAMPLES = Array.from({ length: 480 }, (_, i) => {
  const t = NOW - (480 - i) * 3 * 60 * 1000;
  const hour = new Date(t).getUTCHours() + 2;
  return { t, p: Math.max(0, Math.round(3000 * Math.sin(((hour - 7) / 12) * Math.PI))), c: 400 };
});

const count = (content, type) => content.components.filter((c) => c.type === type).length;

test('every widget is valid and within the budget, in every language', () => {
  for (const language of LANGUAGES) {
    const contents = [
      buildOverviewWidget({ station: STATION, samples: SAMPLES, now: NOW, language, timeZone: TZ }),
      ...['day', 'month', 'year', 'all'].map((period) =>
        buildReportWidget({
          station: STATION,
          period,
          report: parseReport(fixtures.reports[period === 'all' ? 'all' : period]),
          production: info.production[period],
          language,
        }),
      ),
      buildBatteryWidget({ battery: BATTERY, language }),
      buildBatteryWidget({ battery: { ...BATTERY, modes: false }, language }),
      buildBatteryWidget({
        battery: { serial: 'X', modes: true, live: null, settings: null },
        language,
      }),
      buildOverviewWidget({
        station: { name: 'Vide', info: { power: {} } },
        samples: [],
        now: NOW,
        language,
      }),
      messageContent('x'.repeat(400)),
    ];
    for (const content of contents) {
      assert.deepEqual(
        validateWidgetContent(content),
        [],
        `${language}: ${JSON.stringify(content).slice(0, 200)}`,
      );
      assert.ok(content.components.length <= 8);
      assert.ok(count(content, 'status') <= 1);
      assert.ok(count(content, 'value') + count(content, 'gauge') <= 6);
      assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600);
    }
  }
});

test('overview: tiles, the curves of 24 hours averaged per 10 minutes, the last report', () => {
  const content = buildOverviewWidget({
    station: STATION,
    samples: SAMPLES,
    now: NOW,
    language: 'fr',
    timeZone: TZ,
  });
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => [tile.label, tile.value, tile.unit, tile.color]),
    [
      ['Production', 2140, 'W', 'success'],
      ['Consommation', 860, 'W', 'neutral'],
      ['Vers le réseau', 980, 'W', 'success'],
      ['Batterie', 62, '%', 'success'],
    ],
  );
  const chart = content.components.find((c) => c.type === 'chart');
  assert.equal(chart.series.length, 2);
  assert.equal(chart.series[0].points.length, 144);
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Produit aujourd’hui', '9,8 kWh'],
      ['Consommé aujourd’hui', '6,1 kWh'],
      ['Acheté aujourd’hui', '1,3 kWh'],
      ['Vendu aujourd’hui', '3,4 kWh'],
      ['Autonomie', '79 %'],
      ['Dernier relevé du boîtier', '17/10 13:58'],
    ],
  );
  assert.equal(powerChart([{ t: NOW, p: 1, c: 1 }], NOW, 'en'), null, 'one slot is no curve');
});

test('report: kWh below 10 MWh, MWh above', () => {
  const content = buildReportWidget({
    station: STATION,
    period: 'all',
    report: { ...parseReport(fixtures.reports.all), consumption: 12500 },
    production: 5230.75,
    language: 'en',
  });
  const tiles = content.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.slice(0, 2).map((tile) => [tile.value, tile.unit]),
    [
      [5231, 'kWh'],
      [12.5, 'MWh'],
    ],
  );
  assert.equal(content.components[0].text, 'Maison · Since installation');
});

test('battery: a form to change the mode, another for the minimum charge', () => {
  const content = buildBatteryWidget({ battery: BATTERY, language: 'en' });
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((button) => [button.action.key, button.action.params]),
    [
      [WIDGET_ACTIONS.SET_MODE, { serial: BATTERY_SN }],
      [WIDGET_ACTIONS.SET_MINIMUM, { serial: BATTERY_SN }],
    ],
  );
  const [mode, minimum] = buttons;
  assert.deepEqual(
    mode.action.fields.map((field) => [field.key, field.type, field.default]),
    [
      ['control_mode', 'select', 'calendar'],
      ['manual_mode', 'select', 'standby'],
      ['power', 'number', 0],
    ],
  );
  assert.equal(mode.action.fields[2].max, 2400);
  assert.deepEqual(
    [minimum.action.fields[0].min, minimum.action.fields[0].max, minimum.action.fields[0].default],
    [5, 100, 10],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.value),
    ['Charging', 'Calendar', '10%', 1],
  );
  // A slave battery: no button.
  const slave = buildBatteryWidget({ battery: { ...BATTERY, modes: false }, language: 'en' });
  assert.equal(count(slave, 'button'), 0);
});

test('settings: the device chosen, the period', () => {
  assert.deepEqual(readWidgetSettings({ station: 'ext:a', period: 'year' }), {
    device: 'ext:a',
    period: 'year',
  });
  assert.deepEqual(readWidgetSettings({ battery: 'ext:b', period: 'week' }), {
    device: 'ext:b',
    period: 'day',
  });
  assert.deepEqual(readWidgetSettings(undefined), { device: null, period: 'day' });
});
