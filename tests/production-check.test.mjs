import test from 'node:test';
import assert from 'node:assert/strict';
import { checkProduction } from '../scripts/check-production.mjs';

const env = {
  SUPABASE_URL: 'https://uvsvsmyofoiboyiroozm.supabase.co',
  SUPABASE_KEY: 'sb_secret_test_only', OPENAI_API_KEY: 'never-sent-test-only',
  RATE_LIMIT_SALT: 'x'.repeat(32), PER_IP_WINDOW_LIMIT: '10', DAILY_CONSULTATION_LIMIT: '100',
};
const response = (status, body) => ({ status, ok: status === 200, json: async () => body });

test('production check uses only two bounded Supabase requests, reads no rows and no valid reservation', async () => {
  const calls = [];
  const result = await checkProduction({ env, fetcher: async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, env.SUPABASE_URL);
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.headers.apikey, env.SUPABASE_KEY);
    assert.equal(init.headers.Authorization, undefined);
    assert.ok(!JSON.stringify(init).includes(env.OPENAI_API_KEY));
    if (calls.length === 1) {
      assert.equal(init.method, 'GET');
      assert.match(url, /\?select=key&limit=0$/);
      return response(200, []);
    }
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { p_ip_key: null, p_ip_limit: 1, p_daily_limit: 1 });
    return response(400, { code: 'P0001', message: 'Invalid limit configuration' });
  } });
  assert.equal(calls.length, 2);
  assert.equal(result.ok, true);
  assert.equal(result.openaiTested, false);
  assert.equal(result.productionReleaseApproved, false);
});

test('production check rejects unsafe or incomplete configuration before network access', async () => {
  const cases = [
    { SUPABASE_URL: 'https://uhirjurraoyqncmrfavx.supabase.co' },
    { SUPABASE_URL: `${env.SUPABASE_URL}.evil.test` },
    { SUPABASE_KEY: 'sb_publishable_test' }, { SUPABASE_KEY: ' sb_secret_test' },
    { OPENAI_API_KEY: '' }, { RATE_LIMIT_SALT: 'short' },
    { DAILY_CONSULTATION_LIMIT: '10001' }, { PER_IP_WINDOW_LIMIT: '0' },
    { VERCEL_ENV: 'preview' },
  ];
  for (const overrides of cases) {
    const result = await checkProduction({ env: { ...env, ...overrides },
      fetcher: async () => { assert.fail('Network must not be called'); } });
    assert.equal(result.ok, false);
  }
});

test('production check supports matching legacy service-role credentials', async () => {
  const key = `header.${Buffer.from(JSON.stringify({ role: 'service_role', ref: 'uvsvsmyofoiboyiroozm' })).toString('base64url')}.signature`;
  let calls = 0;
  const result = await checkProduction({ env: { ...env, SUPABASE_KEY: key }, fetcher: async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${key}`);
    return ++calls === 1 ? response(200, []) : response(400, { code: 'P0001', message: 'Invalid limit configuration' });
  } });
  assert.equal(result.ok, true);
});

test('production check stops on rejected credentials without leaking upstream data', async () => {
  let calls = 0;
  const result = await checkProduction({ env, fetcher: async () => {
    calls++;
    return response(401, { message: env.SUPABASE_KEY });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: false, code: 'TABLE_HTTP_401', openaiTested: false });
});

test('production check fails closed on unexpected RPC success or network errors', async () => {
  const unexpected = await checkProduction({ env, fetcher: async url =>
    response(200, url.includes('/rpc/') ? true : []) });
  assert.equal(unexpected.ok, false);
  const network = await checkProduction({ env, fetcher: async () => { throw new Error(env.SUPABASE_KEY); } });
  assert.deepEqual(network, { ok: false, code: 'NETWORK_OR_RESPONSE_ERROR', openaiTested: false });
});
