# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- One device per Isypower Cloud power station: solar production, house consumption, signed grid exchange, and, with a battery, its level and its charging and discharging powers.
- Lifetime energy indexes for the energy tracking of Gladys: solar production, energy bought from the grid (consumption and cost), energy sold to the grid, energy stored in and drawn from the batteries. An index never goes down.
- One device per battery: charge level, stored energy, charging and discharging powers, temperature, backup outlet power, and, for a master or standalone battery, its control mode (intelligent, manual, calendar) and manual mode (standby, charge, discharge) as dropdowns.
- Scene triggers: battery starts charging, discharging or stops; equipment offline or back online; firmware update available; station silent for 20 minutes or reporting again.
- Scene actions: set the mode of a battery (with the manual power), set its minimum charge, read the energy report of a period (today, this month, this year, since installation).
- Dashboard widgets: solar installation now with the curves of the last 24 hours, energy report of a period, home battery with buttons to change its mode and minimum charge.
- Configuration actions: read now, and a diagnostic written to the Logs tab without the password, the token nor the serial numbers.
- Cloud transport: the account of the Isypower Cloud application, read every 3 to 15 minutes; a refused login stops the readings until the configuration changes, so that the account is never locked.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
