// -----------------------------------------------------------------------------
// Entry point of the Isypower external integration.
//
// Brings the solar installations of Isypower Cloud (Materfrance, formerly
// Izypower) into Gladys, from the cloud account of the user:
//   - devices: one per power station (production, consumption, grid
//     exchange, batteries, lifetime indexes) and one per battery (level,
//     powers, temperature, control and manual modes) (see src/device.js);
//   - scene triggers: battery state changed, equipment offline or back,
//     firmware update available, station silent or reporting again;
//   - scene actions: set the mode of a battery, set its minimum charge, read
//     the energy report of a period;
//   - dashboard widgets: overview, energy report, battery.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Isypower integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
