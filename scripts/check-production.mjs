import { pathToFileURL } from 'node:url';

const productionOrigin = 'https://uvsvsmyofoiboyiroozm.supabase.co';
const failure = code => ({ ok: false, code, openaiTested: false });

// Deliberately independent of the advice handler: never calls OpenAI or reserves a consultation.
export async function checkProduction({ env = process.env, fetcher = fetch } = {}) {
  for (const name of ['SUPABASE_URL', 'SUPABASE_KEY', 'RATE_LIMIT_SALT', 'OPENAI_API_KEY']) {
    const value = env[name];
    if (typeof value !== 'string' || !value || value !== value.trim() || /[\r\n]/.test(value)) {
      return failure(`INVALID_${name}`);
    }
  }
  if (env.SUPABASE_URL.replace(/\/$/, '') !== productionOrigin) return failure('WRONG_DATABASE');
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') return failure('WRONG_ENVIRONMENT');
  if (env.RATE_LIMIT_SALT.length < 32) return failure('WEAK_RATE_LIMIT_SALT');
  for (const [name, max] of [['PER_IP_WINDOW_LIMIT', 50], ['DAILY_CONSULTATION_LIMIT', 10000]]) {
    const value = env[name];
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) {
      return failure(`INVALID_${name}`);
    }
  }
  const key = env.SUPABASE_KEY;
  const modern = /^sb_secret_[A-Za-z0-9_-]+$/.test(key);
  if (!modern) {
    // Claims are only a local format guard, NOT authentication. Supabase verifies the signature.
    try {
      if (key.split('.').length !== 3) return failure('WRONG_KEY_TYPE');
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (claims.role !== 'service_role' || claims.ref !== 'uvsvsmyofoiboyiroozm') {
        return failure('WRONG_KEY_TYPE_OR_PROJECT');
      }
    } catch { return failure('WRONG_KEY_TYPE'); }
  }
  const headers = { apikey: key, Accept: 'application/json', 'Content-Type': 'application/json' };
  if (!modern) headers.Authorization = `Bearer ${key}`;
  const request = (path, init) => fetcher(`${productionOrigin}${path}`, {
    ...init, headers, redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  try {
    // Check table access without retrieving any rows or IP-derived keys.
    const table = await request('/rest/v1/kaufgeist_rate_limits?select=key&limit=0', { method: 'GET' });
    if (!table.ok) return failure(`TABLE_HTTP_${table.status}`);
    const rows = await table.json();
    if (!Array.isArray(rows) || rows.length !== 0) return failure('UNEXPECTED_TABLE_RESPONSE');

    // The installed function rejects NULL before its first write. An exception also rolls back
    // its transaction. Never send a valid IP key here: that would consume live quota.
    const rpc = await request('/rest/v1/rpc/reserve_consultation', {
      method: 'POST', body: JSON.stringify({ p_ip_key: null, p_ip_limit: 1, p_daily_limit: 1 }),
    });
    const error = await rpc.json();
    if (rpc.status !== 400 || error?.code !== 'P0001' || error.message !== 'Invalid limit configuration') {
      return failure(`UNEXPECTED_RPC_HTTP_${rpc.status}`);
    }
    return { ok: true, code: 'DATABASE_ACCESS_VERIFIED', openaiTested: false,
      parallelLimitsTested: false, productionReleaseApproved: false };
  } catch {
    // Never print exception messages, request headers, response bodies or credentials.
    return failure('NETWORK_OR_RESPONSE_ERROR');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--production') {
    console.error('Usage: node scripts/check-production.mjs --production (requires existing server environment)');
    process.exitCode = 2;
  } else {
    const result = await checkProduction();
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  }
}
