# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for Isypower Cloud (Materfrance,
formerly Izypower): a Node.js service (Node 22+, ESM, no build step) that runs
in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It logs in to `application.izypowercloud.fr`
with the account of the mobile application and reads the stations, the
equipment and the batteries every few minutes. Transport: cloud only.

The API has **no public documentation**: endpoints, headers and payloads come
from the Home Assistant integration izypower_cloud (MIT,
https://github.com/StefanPlizga/izypower_cloud). Never invent an endpoint or a
field: check that project first. The integration was written without an
account; the error answers of the login were checked against the real server.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timer
src/isypower-api.js     HTTP client: login (JWT), x-tts-access-token, error kinds
src/model.js            answers -> plain objects (both wrappings, numbers as strings)
src/device.js           station and battery devices, their states
src/events.js           scene trigger transitions and payloads
src/widgets.js          overview, report and battery widgets (button forms)
src/store.js            /data/isypower.json: `seen`, last indexes, power samples
src/config.js           configuration (account, interval, language)
src/time.js             calendar dates (TZ)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/helpers/fixtures.js            fake Isypower Cloud (reconstructed answers)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`station:<cloud station id>`,
  `battery:<serial number in lower case>`: never a name), feature
  `category` / `type` / `unit` / `min` / `max` / `step`, the keys of
  `config_schema`, `actions`, the widgets and their settings, scene triggers
  (fields, options, variables) and scene actions (fields, outputs), and the
  values of the mode dropdowns (`intelligent`, `manual`, `calendar`,
  `standby`, `charge`, `discharge`). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Energy.** Only `energy-sensor` / `index` feeds the consumption and the
  cost of Gladys: it holds the energy **bought from the grid** (what the bill
  counts), never the total consumption (that would count the solar energy
  twice). Production: `energy-production-sensor` / `index`. Never two
  `energy-sensor` indexes on one device. An index lower than the last one
  published is skipped (`store.indexes`).
- **Signs.** Grid power: import > 0, export < 0 (`grid-sensor` / `power`,
  symmetric bounds). Station battery power from the API: > 0 charging, split
  into `charge-power` and `discharge-power`.
- **Unknown is not zero.** `model.js` returns null for anything missing; a
  null is never published nor turned into an event.
- **`should_poll` stays false**: the integration reads on its own timer
  (3 to 15 min, 3 by default: the boxes report every 3 minutes). The station
  list is read every hour, battery settings every 15 minutes (and after a
  command), firmware updates every six hours.
- **The account.** A refused login (`kind: 'auth'`) stops every reading until
  the configuration changes or the user presses Read now: retries could lock
  the account. Never log the password, the token, the e-mail, the address nor
  the serial numbers (the diagnostic too).
- **Commands.** Only master or standalone batteries (`clusterMode` 1000 /
  1002 or none) accept the modes; the intelligent mode needs the smart meter
  (`hasMeter`). After a command, the settings are read again and published.
- **Events once.** `seen` (in /data) remembers each battery state, equipment
  connection, firmware offered and station reporting state. The first reading
  is a baseline. At most 30 events per reading. A scene action or a widget
  never fires an event.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, button forms, `docs/*.md`, README) exists in English, French,
  German and Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.2.0` (button forms, `text` / `select`
  features). Transport: `["cloud"]`. No permission.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
