// The Isypower Cloud client: login, token reuse and renewal, error kinds.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createIsypowerClient, tokenExpiry } from '../src/isypower-api.js';
import { fakeCloud, jwt, ACCOUNT, NOW, STATION_ID } from './helpers/fixtures.js';

const client = (cloud, clock = { now: NOW }, account = ACCOUNT) =>
  createIsypowerClient({ ...account, fetch: cloud, now: () => clock.now, language: 'en' });

test('tokenExpiry reads the exp of a JWT, null otherwise', () => {
  assert.equal(tokenExpiry(jwt(1700000000)), 1700000000 * 1000);
  assert.equal(tokenExpiry('not-a-jwt'), null);
  assert.equal(tokenExpiry(null), null);
});

test('one login, the token in x-tts-access-token, renewed before its expiry', async () => {
  const clock = { now: NOW };
  const cloud = fakeCloud({ now: () => clock.now });
  cloud.state.tokenLifetime = 600;
  const api = client(cloud, clock);
  await api.stations();
  await api.stationInfo(STATION_ID);
  assert.equal(cloud.callsTo('/api/login').length, 1);
  assert.equal(cloud.calls[1].headers['accept-language'], 'en');
  assert.equal(cloud.calls[1].headers['app-platform'], 'izy');
  clock.now += 9.5 * 60 * 1000;
  await api.stations();
  assert.equal(cloud.callsTo('/api/login').length, 2, 'renewed within a minute of its expiry');
  assert.deepEqual(api.requests, { total: 5, logins: 2, errors: 0 });
});

test('a token refused by the API (code 401) is renewed once', async () => {
  const cloud = fakeCloud();
  const api = client(cloud);
  await api.stations();
  cloud.state.expireToken = true;
  const answer = await api.stations();
  assert.equal(answer.code, 200);
  assert.equal(cloud.callsTo('/api/login').length, 2);
});

test('error kinds: auth, unreachable, refused, invalid', async () => {
  const wrong = client(fakeCloud(), undefined, { username: ACCOUNT.username, password: 'nope' });
  await assert.rejects(wrong.stations(), {
    kind: 'auth',
    message: 'Le compte ou le mot de passe est incorrect',
  });
  await assert.rejects(client(fakeCloud(), undefined, {}).stations(), { kind: 'auth' });

  const cloud = fakeCloud();
  const api = client(cloud);
  cloud.state.fail = 'network';
  await assert.rejects(api.stations(), { kind: 'unreachable' });
  cloud.state.fail = { status: 503 };
  await assert.rejects(api.stations(), { kind: 'unreachable', message: 'HTTP 503' });
  cloud.state.fail = null;
  await api.stations();
  cloud.state.fail = { code: 500 };
  await assert.rejects(api.stationInfo(STATION_ID), { kind: 'refused', code: 500 });

  const html = async () => new Response('<html></html>', { status: 200 });
  await assert.rejects(client(html).stations(), { kind: 'invalid' });
});

test('commands: the payloads of the application', async () => {
  const cloud = fakeCloud();
  const api = client(cloud);
  await api.setControlMode('SN/1', 1);
  await api.setManualMode('SN1', 2, 650);
  await api.setMinimumCharge('SN1', 20);
  assert.deepEqual(cloud.writes, [
    { path: '/api/v2/device/yz/battery/mode/SN%2F1', body: { ctr_mode: 1 } },
    { path: '/api/v2/device/yz/battery/manual_mode_value/SN1', body: { mode: 2, power: 650 } },
    { path: '/api/v2/device/yz/battery/min_soc/SN1', body: { value: 20 } },
  ]);
  assert.ok(
    cloud.calls
      .filter((call) => call.method === 'POST')
      .every((call) => call.headers['content-type'] === 'application/json'),
  );
});
