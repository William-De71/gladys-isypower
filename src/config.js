// -----------------------------------------------------------------------------
// Configuration of the Isypower integration.
//
// Fields of the config_schema:
//   - `username`   e-mail of the Isypower Cloud account (the one of the app);
//   - `password`   its password (`secret`: never logged, never shown back);
//   - `interval`   minutes between two readings: the boxes report to the cloud
//                  every three minutes, reading more often brings nothing and
//                  risks the account (3 by default, up to 15);
//   - `language`   language of the texts Gladys does not ask for in a
//                  language (feature names, mode labels, scene summaries,
//                  messages of the API): `auto` follows the language of the
//                  last widget request.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language` language of the last widget request, kept for the
//                     texts after a restart.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const INTERVALS = [3, 5, 10, 15];
const DEFAULT_INTERVAL = 3;

const readString = (raw) => (typeof raw === 'string' ? raw.trim() : '');

/**
 * @description Read the reading interval.
 * @param {unknown} raw - The raw value ("5", 5).
 * @returns {number} Minutes, one of INTERVALS.
 */
function readInterval(raw) {
  const value = Number(raw);
  return INTERVALS.includes(value) ? value : DEFAULT_INTERVAL;
}

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ username, password, interval, language }`.
 * @example
 * normalizeConfig({ username: ' me@example.com ', password: 'x', interval: '5' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  return {
    username: readString(config.username),
    // A password is taken as typed: spaces may belong to it.
    password: typeof config.password === 'string' ? config.password : '',
    interval: readInterval(config.interval),
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

/**
 * @description Whether the account is filled in.
 * @param {object} config - From normalizeConfig.
 * @returns {boolean} True when it is.
 */
const hasAccount = (config) => Boolean(config.username && config.password);

/**
 * @description Read the stored language of the last request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 * @example
 * readLanguage({ last_language: 'fr' }, 'en'); // -> 'fr'
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : fallback;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  INTERVALS,
  DEFAULT_INTERVAL,
  normalizeConfig,
  hasAccount,
  readLanguage,
  readInterval,
};
