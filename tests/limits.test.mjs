import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveConsultation } from '../lib/limits.mjs';

for (const key of ['sb_secret_TEST_FIXTURE_NOT_A_KEY', 'legacy_TEST_FIXTURE_NOT_A_KEY']) {
  test(`rate limiter authenticates ${key.startsWith('sb_secret_') ? 'modern secret' : 'legacy'} keys`, async () => {
    let headers;
    const allowed = await reserveConsultation({ headers: {} }, {
      env: { SUPABASE_URL: 'https://example.invalid', SUPABASE_KEY: key, RATE_LIMIT_SALT: 'test-only' },
      fetcher: async (_url, init) => {
        headers = init.headers;
        return { ok: true, json: async () => true };
      },
    });
    assert.equal(allowed, true);
    assert.equal(headers.apikey, key);
    assert.equal(headers.Authorization, key.startsWith('sb_secret_') ? undefined : `Bearer ${key}`);
  });
}
