// -----------------------------------------------------------------------------
// Scene triggers: what HAPPENED between two readings of the cloud.
//
//   - `battery_state_changed`: a battery starts charging, discharging or goes
//     on standby;
//   - `equipment_connection_changed`: a micro-inverter, a battery, a meter or
//     a charging station goes offline, or comes back;
//   - `firmware_update_available`: Isypower offers a new firmware for a piece
//     of equipment;
//   - `station_reporting_changed`: the box of a station stops reporting to the
//     cloud (no data for STALE_MINUTES), or reports again.
//
// One event per transition: `seen` (kept in /data) remembers the last known
// state of each thing, and the first reading is a baseline (no event at the
// start of the integration). An unknown value (null) changes nothing. A scene
// action or a widget never fires an event.
// -----------------------------------------------------------------------------

import { stationIds, batteryIds } from './device.js';
import { t } from './i18n.js';

const TRIGGERS = {
  BATTERY_STATE: 'battery_state_changed',
  CONNECTION: 'equipment_connection_changed',
  FIRMWARE: 'firmware_update_available',
  REPORTING: 'station_reporting_changed',
};
// The boxes report every three minutes: past this, the station is silent.
const STALE_MINUTES = 20;
// At most this many events per reading (a broken answer must not flood the scenes).
const MAX_EVENTS = 30;

const round = (value) => (value === null || value === undefined ? null : Math.round(value));
// Names come from the account: bounded (the core takes 1000 characters per value).
const name = (value) => String(value ?? '').slice(0, 200);

/**
 * @description Compare the readings with what was seen, and list the events.
 * @param {object} options - Options.
 * @param {object} options.gladys - The GladysIntegration (external ids).
 * @param {object[]} options.stations - The stations read: `{ id, name, info,
 * equipment, batteries, upgrades }` (`equipment` / `upgrades` null when not
 * read this time).
 * @param {object} options.seen - What was seen: `{ batteries, equipment,
 * upgrades, reporting }`.
 * @param {number} options.now - The instant, in ms.
 * @param {string} options.language - Language of the type names.
 * @returns {{ events: object[], seen: object }} The events and the new memory.
 */
function detectEvents({ gladys, stations, seen = {}, now, language = 'en' }) {
  const events = [];
  const next = {
    batteries: { ...(seen.batteries ?? {}) },
    equipment: { ...(seen.equipment ?? {}) },
    upgrades: { ...(seen.upgrades ?? {}) },
    reporting: { ...(seen.reporting ?? {}) },
  };
  for (const station of stations) {
    const station_device = stationIds(gladys, station.id).device;
    const base = { station: station_device, station_name: name(station.name) };

    // The box reporting to the cloud.
    const lastUpdate = station.info?.lastUpdate ?? null;
    if (lastUpdate !== null) {
      const minutes = Math.max(0, Math.round((now - lastUpdate) / 60000));
      const state = minutes >= STALE_MINUTES ? 'stale' : 'reporting';
      const previous = seen.reporting?.[station.id];
      if (previous && previous !== state) {
        events.push({
          key: TRIGGERS.REPORTING,
          data: {
            ...base,
            state,
            last_update: new Date(lastUpdate).toISOString(),
            minutes_since_update: minutes,
          },
        });
      }
      next.reporting[station.id] = state;
    }

    // The batteries.
    for (const battery of station.batteries ?? []) {
      const state = battery.live?.state ?? null;
      if (state === null) {
        continue;
      }
      const previous = seen.batteries?.[battery.serial];
      if (previous && previous !== state) {
        events.push({
          key: TRIGGERS.BATTERY_STATE,
          data: {
            ...base,
            battery: batteryIds(gladys, battery.serial).device,
            battery_name: name(battery.name ?? battery.serial),
            state,
            previous_state: previous,
            level: round(battery.live?.soc),
            power: round(
              state === 'charging'
                ? battery.live?.chargePower
                : state === 'discharging'
                  ? battery.live?.dischargePower
                  : 0,
            ),
          },
        });
      }
      next.batteries[battery.serial] = state;
    }

    // The equipment going offline or online.
    for (const item of station.equipment ?? []) {
      if (item.online === null) {
        continue;
      }
      const state = item.online ? 'online' : 'offline';
      const previous = seen.equipment?.[item.serial];
      if (previous && previous !== state) {
        events.push({
          key: TRIGGERS.CONNECTION,
          data: {
            ...base,
            state,
            equipment_name: name(item.name ?? item.serial),
            equipment_type: item.type ?? 'other',
            equipment_type_name: name(item.typeName ?? t('equipment_other', language)),
            serial_number: item.serial,
          },
        });
      }
      next.equipment[item.serial] = state;
    }

    // The firmware updates (only when the list was read this time).
    if (Array.isArray(station.upgrades)) {
      const known = seen.upgrades?.[station.id];
      const waiting = new Set(station.upgrades);
      if (Array.isArray(known)) {
        for (const serial of waiting) {
          if (!known.includes(serial)) {
            const item = (station.equipment ?? []).find((e) => e.serial === serial);
            events.push({
              key: TRIGGERS.FIRMWARE,
              data: {
                ...base,
                equipment_name: name(item?.name ?? serial),
                equipment_type: item?.type ?? 'other',
                serial_number: serial,
              },
            });
          }
        }
      }
      next.upgrades[station.id] = [...waiting];
    }
  }
  return { events: events.slice(0, MAX_EVENTS), seen: next };
}

export { TRIGGERS, STALE_MINUTES, MAX_EVENTS, detectEvents };
