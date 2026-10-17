// -----------------------------------------------------------------------------
// What the integration keeps across restarts, in /data/isypower.json (the
// only writable place of the container):
//   - `seen`      what the scene triggers already know: the state of each
//                 battery, the connection of each piece of equipment, the
//                 firmware updates offered, whether each station reports. A
//                 restart never fires the same event twice;
//   - `indexes`   the last lifetime index published per feature: an index
//                 that goes down (a blank answer of the cloud) is never
//                 published, Gladys would count a huge consumption;
//   - `samples`   the production and consumption powers of the last 24 hours
//                 per station, for the curves of the overview widget.
// Never the password nor the token.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/isypower.json';
const EMPTY = () => ({
  seen: { batteries: {}, equipment: {}, upgrades: {}, reporting: {} },
  indexes: {},
  samples: {},
});

/**
 * @description The store.
 * @param {object} [options] - `{ path, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ path = DEFAULT_PATH, logger } = {}) {
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file; an absent or broken file is an empty store.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const raw = JSON.parse(await readFile(path, 'utf8'));
        const base = EMPTY();
        const value = raw && typeof raw === 'object' ? raw : {};
        const objectOr = (candidate, fallback) =>
          candidate && typeof candidate === 'object' && !Array.isArray(candidate)
            ? candidate
            : fallback;
        store.data = {
          seen: { ...base.seen, ...objectOr(value.seen, {}) },
          indexes: objectOr(value.indexes, {}),
          samples: objectOr(value.samples, {}),
        };
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger?.warn(`Unable to read ${path}: ${err.message}`);
        }
        store.data = EMPTY();
      }
    },
    /**
     * @description Write the file (atomically: a temporary file, then a rename).
     * @returns {Promise<void>}
     */
    async save() {
      try {
        await mkdir(dirname(path), { recursive: true });
        const temporary = `${path}.tmp`;
        await writeFile(temporary, JSON.stringify(store.data));
        await rename(temporary, path);
      } catch (err) {
        logger?.warn(`Unable to write ${path}: ${err.message}`);
      }
    },
  };
  return store;
}

export { DEFAULT_PATH, createStore };
