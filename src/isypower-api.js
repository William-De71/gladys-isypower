// -----------------------------------------------------------------------------
// Client of the Isypower Cloud API (Materfrance), the cloud the Isypower
// boxes report to every three minutes.
//
// There is no public documentation: the endpoints, headers and payloads are
// those of the mobile application, as used by the Home Assistant integration
// izypower_cloud (MIT, https://github.com/StefanPlizga/izypower_cloud).
//
//   - Login: POST /api/login { username, password } → { code, data: { token } },
//     a JWT whose `exp` tells when to log in again.
//   - Every other call carries the token in the `x-tts-access-token` header
//     (not `Authorization`) and `app-platform: izy`.
//   - The HTTP status is always 200: the outcome is the `code` of the body
//     (200 ok, 401 token expired, 500 wrong account or password…), with a
//     `msg` in the language asked by `Accept-Language` (fr or en).
//
// Wrong credentials are never retried by themselves: the account could be
// locked. A new configuration (or a manual refresh) tries again.
// -----------------------------------------------------------------------------

const BASE_URL = 'https://application.izypowercloud.fr/photo_voltaic';
const TIMEOUT_MS = 20 * 1000;
// A token is renewed this long before its expiry.
const TOKEN_MARGIN_MS = 60 * 1000;
// Lifetime assumed when the JWT carries no `exp`.
const DEFAULT_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

/**
 * @description An error of the API, with the kind the app reports on:
 * `auth` (wrong account or password), `unreachable` (network, timeout, 5xx),
 * `invalid` (not JSON, unexpected answer), `refused` (an error code of the API).
 * @param {string} kind - The kind.
 * @param {string} message - The message.
 * @param {object} [extra] - `{ code }`.
 * @returns {Error} The error.
 */
function apiError(kind, message, extra = {}) {
  return Object.assign(new Error(message), { kind, ...extra });
}

/**
 * @description Read the expiry of a JWT.
 * @param {string} token - The token.
 * @returns {number|null} The expiry in ms, or null.
 * @example
 * tokenExpiry('aaa.eyJleHAiOjE3MDAwMDAwMDB9.ccc'); // -> 1700000000000
 */
function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString());
    return Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * @description The Isypower Cloud client.
 * @param {object} options - Options.
 * @param {string} options.username - E-mail of the account.
 * @param {string} options.password - Password of the account.
 * @param {string} [options.language] - Language of the API messages (fr or en).
 * @param {Function} [options.fetch] - HTTP transport (tests).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @returns {object} The client.
 */
function createIsypowerClient({
  username,
  password,
  language = 'fr',
  fetch: fetchFn = globalThis.fetch,
  now = () => Date.now(),
}) {
  let token = null;
  let expiresAt = 0;
  let loggingIn = null;
  // Counters for the diagnostic.
  const requests = { total: 0, logins: 0, errors: 0 };

  const headers = () => ({
    'Accept-Language': language === 'fr' ? 'fr' : 'en',
    'app-platform': 'izy',
    Accept: 'application/json',
  });

  /**
   * @description Send one HTTP request and read its JSON body.
   * @param {string} method - GET or POST.
   * @param {string} path - Path below BASE_URL.
   * @param {object} [options] - `{ body, auth }`.
   * @returns {Promise<object>} The body.
   */
  async function send(method, path, { body, auth = true } = {}) {
    requests.total += 1;
    let response;
    try {
      response = await fetchFn(`${BASE_URL}${path}`, {
        method,
        headers: {
          ...headers(),
          ...(auth ? { 'x-tts-access-token': token } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      requests.errors += 1;
      throw apiError('unreachable', err.name === 'TimeoutError' ? 'timeout' : err.message);
    }
    if (response.status >= 500 || response.status === 429) {
      requests.errors += 1;
      throw apiError('unreachable', `HTTP ${response.status}`);
    }
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      requests.errors += 1;
      throw apiError('invalid', `HTTP ${response.status}, not JSON`);
    }
    if (!json || typeof json !== 'object') {
      requests.errors += 1;
      throw apiError('invalid', 'empty answer');
    }
    return json;
  }

  /**
   * @description Log in, once at a time.
   * @returns {Promise<void>}
   */
  function login() {
    if (!loggingIn) {
      loggingIn = (async () => {
        if (!username || !password) {
          throw apiError('auth', 'no account configured');
        }
        requests.logins += 1;
        const json = await send('POST', '/api/login', {
          body: { username, password },
          auth: false,
        });
        const value = json.data?.token;
        if (json.code !== 200 || typeof value !== 'string' || !value) {
          // 500 with "Le compte ou le mot de passe est incorrect" for a wrong account.
          throw apiError('auth', json.msg || `login refused (code ${json.code})`, {
            code: json.code,
          });
        }
        token = value;
        expiresAt = tokenExpiry(value) ?? now() + DEFAULT_TOKEN_LIFETIME_MS;
      })().finally(() => {
        loggingIn = null;
      });
    }
    return loggingIn;
  }

  /**
   * @description Call the API with a valid token: logs in when needed, and once
   * more when the API answers that the token expired.
   * @param {string} method - GET or POST.
   * @param {string} path - Path below BASE_URL.
   * @param {object} [body] - JSON body of a POST.
   * @returns {Promise<object>} The body, its `code` checked.
   */
  async function call(method, path, body) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!token || now() > expiresAt - TOKEN_MARGIN_MS) {
        await login();
      }
      const json = await send(method, path, { body });
      if (json.code === 401 || json.code === 403) {
        token = null;
        continue;
      }
      if (json.code !== undefined && json.code !== 200) {
        requests.errors += 1;
        throw apiError('refused', json.msg || `code ${json.code}`, { code: json.code });
      }
      return json;
    }
    throw apiError('auth', 'token refused after a new login');
  }

  const get = (path) => call('GET', path);
  const post = (path, body) => call('POST', path, body);
  const sn = (value) => encodeURIComponent(String(value));

  return {
    requests,
    login,
    /** @returns {Promise<object>} The power stations of the account (paged, 100 max). */
    stations: () => get('/api/powerStations/page?page=1&limit=100'),
    /** @param {number} id - Station id. @returns {Promise<object>} Live powers and totals. */
    stationInfo: (id) => get(`/api/v3/powerStations/info/${sn(id)}`),
    /**
     * @param {number} id - Station id.
     * @param {string} timeType - day, month, year or all.
     * @param {string} date - YYYY-MM-DD, YYYY-MM or YYYY.
     * @returns {Promise<object>} The energy report of the period.
     */
    report: (id, timeType, date) =>
      get(
        `/api/report/v2/powerStations/data/${sn(id)}?timeType=${timeType}&dataFlag=energy&searchTime=${sn(date)}`,
      ),
    /** @param {number} id - Station id. @returns {Promise<object>} The equipment of the station. */
    devices: (id) => get(`/api/device/page?powerId=${sn(id)}&deviceType=all&page=1&limit=100`),
    /** @param {number} id - Station id. @returns {Promise<object>} Firmware updates per device. */
    upgrades: (id) => get(`/api/v3/device/upgrade/${sn(id)}`),
    /** @param {string} serial - Battery serial number. @returns {Promise<object>} Live data. */
    battery: (serial) => get(`/izy/v2/battery/${sn(serial)}`),
    /** @param {string} serial - Battery serial number. @returns {Promise<object>} Its settings. */
    batterySettings: (serial) => get(`/api/v2/device/cmd/${sn(serial)}`),
    /**
     * @param {string} serial - Battery serial number.
     * @param {number} ctrMode - 0 intelligent, 1 manual, 2 calendar.
     * @returns {Promise<object>} The answer.
     */
    setControlMode: (serial, ctrMode) =>
      post(`/api/v2/device/yz/battery/mode/${sn(serial)}`, { ctr_mode: ctrMode }),
    /**
     * @param {string} serial - Battery serial number.
     * @param {number} mode - 0 standby, 1 charge, 2 discharge.
     * @param {number} power - Watts (0 in standby).
     * @returns {Promise<object>} The answer.
     */
    setManualMode: (serial, mode, power) =>
      post(`/api/v2/device/yz/battery/manual_mode_value/${sn(serial)}`, { mode, power }),
    /**
     * @param {string} serial - Battery serial number.
     * @param {number} value - Minimum state of charge, % (5 to 100).
     * @returns {Promise<object>} The answer.
     */
    setMinimumCharge: (serial, value) =>
      post(`/api/v2/device/yz/battery/min_soc/${sn(serial)}`, { value }),
  };
}

export { BASE_URL, createIsypowerClient, tokenExpiry, apiError };
