// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The three widgets of a house in Mâcon on a sunny October afternoon: the
// answers of the fake Isypower Cloud of the tests (test/helpers/fixtures.js,
// reconstructed, not captured) go through the real readers (src/model.js)
// and the real widget builders (src/widgets.js). The curves come from 24 hours
// of samples drawn with a fixed seed: the same image at every run.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildOverviewWidget, buildReportWidget, buildBatteryWidget } = await load('src/widgets.js');
const { parseStationInfo, parseReport, parseBattery, parseBatterySettings } =
  await load('src/model.js');
const { LANGUAGES } = await load('src/i18n.js');
const { defaultState, NOW, TZ, BATTERY_SN } = await load('test/helpers/fixtures.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

const state = defaultState();
const info = parseStationInfo(state.info, TZ);
const station = { id: '41235', name: 'Maison', info, today: parseReport(state.reports.day) };
const battery = {
  serial: BATTERY_SN,
  name: 'IZY-BAT 5K',
  modes: true,
  live: parseBattery({ data: state.battery }),
  settings: parseBatterySettings({
    data: { ...state.settings, mode: { ctr_mode: 1 }, manual: { mode: 1, power: 800 } },
  }),
};

// A seeded random: the same clouds at every run.
let seed = 71;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const samples = [];
for (let t = NOW - 24 * 3600 * 1000; t <= NOW; t += 3 * 60 * 1000) {
  const hour = (new Date(t).getUTCHours() + 2 + new Date(t).getUTCMinutes() / 60) % 24;
  const sun = Math.max(0, Math.sin(((hour - 7.5) / 11) * Math.PI));
  const clouds = 0.75 + 0.25 * random();
  const evening = hour >= 18.5 && hour <= 22 ? 1400 : 0;
  const morning = hour >= 7 && hour <= 8.5 ? 900 : 0;
  samples.push({
    t,
    p: Math.round(2900 * sun * clouds),
    c: Math.round(280 + 220 * random() + evening + morning),
  });
}

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    overview: buildOverviewWidget({ station, samples, now: NOW, language, timeZone: TZ }),
    report: buildReportWidget({
      station,
      period: 'month',
      report: parseReport(state.reports.month),
      production: info.production.month,
      language,
    }),
    battery: buildBatteryWidget({ battery, language }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
