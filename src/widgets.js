// -----------------------------------------------------------------------------
// Dashboard widgets of the Isypower integration.
//
//   - `overview`  a station now: production, consumption, grid exchange and
//                 battery level as tiles, the production and consumption
//                 curves of the last 24 hours (sampled by the integration at
//                 each reading), today's energy and the last report of the box
//                 as a status list;
//   - `report`    the energy of a period (today, this month, this year, since
//                 the installation): production, consumption, self-sufficiency,
//                 bought and sold energy as tiles, the battery as a status list;
//   - `battery`   a battery: level gauge, charge or discharge power, stored
//                 energy, temperature, its modes as a status list, and two
//                 buttons with a form to change the mode and the minimum
//                 charge (master or standalone batteries only).
//
// The contents come from the last reading kept by the integration: only the
// month and year reports cost a request (cached). Colors are semantic, never
// hexadecimal. Every text exists in the four languages (the content is cached
// per language). Content budget of a card: 8 components, 1 main one, 6 tiles,
// 2 texts, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { t, all, shortDateTime, formatEnergy, formatPower, formatPercent } from './i18n.js';
import { CONTROL_MODES, MANUAL_MODES } from './model.js';
import { STALE_MINUTES } from './events.js';

const WIDGETS = { OVERVIEW: 'overview', REPORT: 'report', BATTERY: 'battery' };
const WIDGET_ACTIONS = { SET_MODE: 'set_mode', SET_MINIMUM: 'set_minimum' };
const TTL = { overview: 180, report: 900, battery: 180, message: 120 };
const REPORT_PERIODS = ['day', 'month', 'year', 'all'];
// The curves are averaged per slot of this length.
const SLOT_MS = 10 * 60 * 1000;
const CHART_HOURS = 24;
const MIN_SOC = { min: 5, max: 100 };
const MAX_MANUAL_POWER = 10000;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description A value tile: W below 10 kW, kW above (the value holds 12
 * characters at most).
 * @param {string} label - The label.
 * @param {number|null} watts - The power.
 * @param {object} [options] - `{ color, icon }`.
 * @returns {object} The tile.
 */
function powerTile(label, watts, { color = 'neutral', icon } = {}) {
  const big = watts !== null && Math.abs(watts) >= 10000;
  return {
    type: 'value',
    label: clip(label, 24),
    value: watts === null ? '-' : big ? Math.round(watts / 100) / 10 : Math.round(watts),
    ...(watts === null ? {} : { unit: big ? 'kW' : 'W' }),
    color,
    ...(icon ? { icon } : {}),
  };
}

/**
 * @description An energy tile, in kWh (MWh above 10 000 kWh).
 * @param {string} label - The label.
 * @param {number|null} kwh - The energy.
 * @param {object} [options] - `{ color, icon }`.
 * @returns {object} The tile.
 */
function energyTile(label, kwh, { color = 'neutral', icon } = {}) {
  const big = kwh !== null && kwh >= 10000;
  let value = '-';
  if (kwh !== null) {
    value = big
      ? Math.round(kwh / 100) / 10
      : Math.round(kwh * (kwh < 100 ? 10 : 1)) / (kwh < 100 ? 10 : 1);
  }
  return {
    type: 'value',
    label: clip(label, 24),
    value,
    ...(kwh === null ? {} : { unit: big ? 'MWh' : 'kWh' }),
    color,
    ...(icon ? { icon } : {}),
  };
}

/**
 * @description The color of a grid exchange: selling is good news.
 * @param {number|null} watts - Grid power, import > 0.
 * @returns {string} The color.
 */
const gridColor = (watts) => {
  if (watts === null) {
    return 'neutral';
  }
  if (watts < -20) {
    return 'success';
  }
  return watts > 20 ? 'warning' : 'neutral';
};

/**
 * @description The color of a battery level.
 * @param {number|null} level - %.
 * @returns {string} The color.
 */
const levelColor = (level) => {
  if (level === null) {
    return 'neutral';
  }
  if (level < 15) {
    return 'danger';
  }
  return level < 40 ? 'warning' : 'success';
};

/**
 * @description The production and consumption curves of the last hours,
 * averaged per slot.
 * @param {object[]} samples - `[{ t, p, c }]` (ms, W, W).
 * @param {number} now - The instant, in ms.
 * @param {string} language - The language.
 * @returns {object|null} The chart component, or null without data.
 */
function powerChart(samples, now, language) {
  const from = now - CHART_HOURS * 3600 * 1000;
  const slots = new Map();
  for (const sample of samples ?? []) {
    if (sample.t < from || sample.t > now) {
      continue;
    }
    const slot = Math.floor(sample.t / SLOT_MS) * SLOT_MS;
    const entry = slots.get(slot) ?? { p: [], c: [] };
    if (Number.isFinite(sample.p)) {
      entry.p.push(sample.p);
    }
    if (Number.isFinite(sample.c)) {
      entry.c.push(sample.c);
    }
    slots.set(slot, entry);
  }
  if (slots.size < 2) {
    return null;
  }
  const ordered = [...slots.entries()].sort(([a], [b]) => a - b);
  const average = (values) => Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  const series = [
    ['p', 'widget_series_production'],
    ['c', 'widget_series_consumption'],
  ]
    .map(([key, name]) => ({
      name: t(name, language),
      points: ordered
        .filter(([, entry]) => entry[key].length)
        .map(([slot, entry]) => ({ t: new Date(slot).toISOString(), v: average(entry[key]) })),
    }))
    .filter((serie) => serie.points.length);
  return {
    type: 'chart',
    chart_type: 'area',
    unit: 'W',
    series,
  };
}

/**
 * @description The overview widget of a station.
 * @param {object} input - Input.
 * @param {object} input.station - `{ name, info, today, batteries }`.
 * @param {object[]} input.samples - The power samples of the station.
 * @param {number} input.now - The instant, in ms.
 * @param {string} input.language - The language.
 * @param {string} [input.timeZone] - IANA timezone.
 * @returns {object} The content.
 */
function buildOverviewWidget({ station, samples, now, language, timeZone }) {
  const info = station.info ?? { power: {} };
  const grid = info.power.grid ?? null;
  const components = [
    { type: 'text', variant: 'heading', text: clip(station.name, 40) },
    powerTile(t('widget_production', language), info.power.production ?? null, {
      color: 'success',
      icon: 'sun',
    }),
    powerTile(t('widget_consumption', language), info.power.consumption ?? null, {
      icon: 'home',
    }),
    powerTile(
      t(grid !== null && grid < 0 ? 'widget_grid_export' : 'widget_grid_import', language),
      grid === null ? null : Math.abs(grid),
      { color: gridColor(grid), icon: grid !== null && grid < 0 ? 'upload' : 'download' },
    ),
  ];
  if (info.soc !== null && info.soc !== undefined) {
    components.push({
      type: 'value',
      label: clip(t('widget_battery', language), 24),
      value: Math.round(info.soc),
      unit: '%',
      color: levelColor(info.soc),
      icon: 'battery',
    });
  }
  const chart = powerChart(samples, now, language);
  if (chart) {
    components.push(chart);
  }
  const today = station.today ?? {};
  const items = [];
  const push = (label, value, color = 'neutral') => {
    if (value !== null && value !== undefined && value !== '') {
      items.push({ label: clip(label, 40), value: clip(value, 40), color });
    }
  };
  push(
    t('widget_today_production', language),
    formatEnergy(info.production?.day ?? null, language),
    'success',
  );
  push(t('widget_today_consumption', language), formatEnergy(today.consumption ?? null, language));
  push(
    t('widget_today_import', language),
    formatEnergy(today.gridImport ?? null, language),
    'warning',
  );
  push(
    t('widget_today_export', language),
    formatEnergy(today.gridExport ?? null, language),
    'success',
  );
  push(
    t('widget_self_sufficiency', language),
    formatPercent(today.selfSufficiency ?? null, language),
    'info',
  );
  if (info.lastUpdate) {
    const stale = now - info.lastUpdate >= STALE_MINUTES * 60000;
    push(
      t('widget_last_report', language),
      shortDateTime(info.lastUpdate, language, timeZone),
      stale ? 'danger' : 'neutral',
    );
  }
  if (items.length) {
    components.push({ type: 'status', items });
  }
  return { ttl_seconds: TTL.overview, components };
}

/**
 * @description The energy report widget of a station.
 * @param {object} input - Input.
 * @param {object} input.station - `{ name }`.
 * @param {string} input.period - day, month, year or all.
 * @param {object} input.report - From parseReport.
 * @param {number|null} input.production - Production of the period, kWh.
 * @param {string} input.language - The language.
 * @returns {object} The content.
 */
function buildReportWidget({ station, period, report, production, language }) {
  const components = [
    {
      type: 'text',
      variant: 'heading',
      text: clip(`${station.name} · ${t(`period_${period}`, language)}`, 40),
    },
    energyTile(t('widget_production', language), production, { color: 'success', icon: 'sun' }),
    energyTile(t('widget_consumption', language), report.consumption, { icon: 'home' }),
    {
      type: 'value',
      label: clip(t('widget_self_sufficiency', language), 24),
      value: report.selfSufficiency === null ? '-' : Math.round(report.selfSufficiency),
      ...(report.selfSufficiency === null ? {} : { unit: '%' }),
      color: 'info',
      icon: 'award',
    },
    energyTile(t('widget_bought', language), report.gridImport, {
      color: 'warning',
      icon: 'download',
    }),
    energyTile(t('widget_sold', language), report.gridExport, { color: 'success', icon: 'upload' }),
  ];
  const items = [];
  const push = (label, value, color = 'neutral') => {
    if (value) {
      items.push({ label: clip(label, 40), value: clip(value, 40), color });
    }
  };
  push(
    t('widget_self_consumed', language),
    formatEnergy(report.selfConsumption, language),
    'success',
  );
  push(
    t('widget_self_consumption_rate', language),
    formatPercent(report.selfConsumptionRate, language),
    'info',
  );
  push(
    t('widget_battery_charged', language),
    formatEnergy(report.batteryCharge, language),
    'primary',
  );
  push(
    t('widget_battery_discharged', language),
    formatEnergy(report.batteryDischarge, language),
    'primary',
  );
  if (items.length) {
    components.push({ type: 'status', items });
  }
  return { ttl_seconds: TTL.report, components };
}

/**
 * @description The battery widget.
 * @param {object} input - Input.
 * @param {object} input.battery - `{ serial, name, modes, live, settings }`.
 * @param {string} input.language - The language.
 * @returns {object} The content.
 */
function buildBatteryWidget({ battery, language }) {
  const live = battery.live ?? {};
  const settings = battery.settings ?? null;
  const components = [
    { type: 'text', variant: 'heading', text: clip(battery.name ?? battery.serial, 40) },
    {
      type: 'gauge',
      label: clip(t('widget_level', language), 24),
      value: live.soc === null || live.soc === undefined ? 0 : Math.round(live.soc),
      min: 0,
      max: 100,
      unit: '%',
      color: levelColor(live.soc ?? null),
    },
  ];
  if (live.state === 'discharging') {
    components.push(
      powerTile(t('widget_discharge', language), live.dischargePower ?? null, {
        color: 'warning',
        icon: 'battery',
      }),
    );
  } else {
    components.push(
      powerTile(t('widget_charge', language), live.chargePower ?? null, {
        color: live.state === 'charging' ? 'success' : 'neutral',
        icon: 'battery-charging',
      }),
    );
  }
  components.push(
    energyTile(t('widget_stored', language), live.energy ?? null, { icon: 'database' }),
  );
  if (live.temperature !== null && live.temperature !== undefined) {
    components.push({
      type: 'value',
      label: clip(t('widget_temperature', language), 24),
      value: Math.round(live.temperature * 10) / 10,
      unit: '°C',
      color: live.temperature >= 50 || live.temperature <= 0 ? 'warning' : 'neutral',
      icon: 'thermometer',
    });
  }
  const items = [];
  if (live.state) {
    items.push({
      label: t('widget_state', language),
      value: t(`state_${live.state}`, language),
      color:
        live.state === 'charging'
          ? 'success'
          : live.state === 'discharging'
            ? 'warning'
            : 'neutral',
    });
  }
  if (settings?.controlMode) {
    items.push({
      label: t('widget_control_mode', language),
      value: t(`mode_${settings.controlMode}`, language),
      color: 'primary',
    });
  }
  if (settings?.controlMode === 'manual' && settings.manualMode) {
    const watts = settings.manualMode === 'standby' ? null : settings.manualPower;
    items.push({
      label: t('widget_manual_mode', language),
      value: clip(
        [t(`mode_${settings.manualMode}`, language), watts ? formatPower(watts, language) : null]
          .filter(Boolean)
          .join(' · '),
        40,
      ),
      color: 'primary',
    });
  }
  if (settings?.minSoc !== null && settings?.minSoc !== undefined) {
    items.push({
      label: t('widget_minimum_charge', language),
      value: formatPercent(settings.minSoc, language),
      color: 'neutral',
    });
  }
  if (live.modules) {
    items.push({ label: t('widget_modules', language), value: live.modules, color: 'neutral' });
  }
  if (items.length) {
    components.push({ type: 'status', items });
  }
  if (battery.modes && settings) {
    components.push(
      modeButton(battery, settings, language),
      minimumButton(battery, settings, language),
    );
  }
  return { ttl_seconds: TTL.battery, components };
}

/**
 * @description The button that changes the mode of a battery (a form).
 * @param {object} battery - The battery.
 * @param {object} settings - Its settings.
 * @param {string} language - The language.
 * @returns {object} The button.
 */
function modeButton(battery, settings, language) {
  const controlModes = Object.keys(CONTROL_MODES).filter(
    (mode) => mode !== 'intelligent' || settings.hasMeter !== false,
  );
  const maxPower = Math.max(
    50,
    Math.min(
      MAX_MANUAL_POWER,
      Math.round(Math.max(settings.maxCharge ?? 0, settings.maxDischarge ?? 0)) || 2400,
    ),
  );
  return {
    type: 'button',
    label: clip(t('widget_button_mode', language), 24),
    icon: 'sliders',
    style: 'primary',
    action: {
      key: WIDGET_ACTIONS.SET_MODE,
      params: { serial: battery.serial },
      fields: [
        {
          key: 'control_mode',
          type: 'select',
          required: true,
          label: all('field_control_mode'),
          ...(settings.controlMode ? { default: settings.controlMode } : {}),
          options: controlModes.map((mode) => ({
            value: mode,
            label: all(`mode_${mode}`),
          })),
        },
        {
          key: 'manual_mode',
          type: 'select',
          required: false,
          label: all('field_manual_mode'),
          description: all('field_manual_mode_description'),
          ...(settings.manualMode ? { default: settings.manualMode } : {}),
          options: Object.keys(MANUAL_MODES).map((mode) => ({
            value: mode,
            label: all(`mode_${mode}`),
          })),
        },
        {
          key: 'power',
          type: 'number',
          required: false,
          label: all('field_power'),
          description: all('field_power_description'),
          min: 0,
          max: maxPower,
          ...(settings.manualPower !== null && settings.manualPower <= maxPower
            ? { default: Math.round(settings.manualPower) }
            : {}),
        },
      ],
    },
  };
}

/**
 * @description The button that changes the minimum charge of a battery (a form).
 * @param {object} battery - The battery.
 * @param {object} settings - Its settings.
 * @param {string} language - The language.
 * @returns {object} The button.
 */
function minimumButton(battery, settings, language) {
  return {
    type: 'button',
    label: clip(t('widget_button_minimum', language), 24),
    icon: 'battery',
    style: 'secondary',
    action: {
      key: WIDGET_ACTIONS.SET_MINIMUM,
      params: { serial: battery.serial },
      fields: [
        {
          key: 'level',
          type: 'number',
          required: true,
          label: all('field_minimum_charge'),
          description: all('field_minimum_charge_description'),
          min: MIN_SOC.min,
          max: MIN_SOC.max,
          ...(settings.minSoc !== null ? { default: Math.round(settings.minSoc) } : {}),
        },
      ],
    },
  };
}

/**
 * @description Read the settings of a widget.
 * @param {object} [settings] - The settings.
 * @returns {{ device: string|null, period: string }} The device external id
 * chosen (or null) and the period of the report.
 */
const readWidgetSettings = (settings = {}) => ({
  device:
    typeof settings?.station === 'string' && settings.station
      ? settings.station
      : typeof settings?.battery === 'string' && settings.battery
        ? settings.battery
        : null,
  period: REPORT_PERIODS.includes(settings?.period) ? settings.period : 'day',
});

export {
  WIDGETS,
  WIDGET_ACTIONS,
  TTL,
  REPORT_PERIODS,
  MIN_SOC,
  MAX_MANUAL_POWER,
  clip,
  messageContent,
  powerChart,
  buildOverviewWidget,
  buildReportWidget,
  buildBatteryWidget,
  readWidgetSettings,
};
