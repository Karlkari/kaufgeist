import { createHmac } from 'node:crypto';

export function boundedInteger(value, fallback, max) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

export async function reserveConsultation(req, { env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const { SUPABASE_URL, SUPABASE_KEY, RATE_LIMIT_SALT } = env;
  // Fail closed: no unbounded API costs when shared limits are unavailable.
  if (!SUPABASE_URL || !SUPABASE_KEY || !RATE_LIMIT_SALT) throw new Error('Shared limits not configured');
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const day = now.toISOString().slice(0, 10);
  const ipKey = createHmac('sha256', RATE_LIMIT_SALT).update(`${day}:${ip}`).digest('hex');
  const response = await fetcher(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/reserve_consultation`, {
    method: 'POST', signal: AbortSignal.timeout(3000),
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ p_ip_key: ipKey,
      p_ip_limit: boundedInteger(env.PER_IP_WINDOW_LIMIT, 10, 50),
      p_daily_limit: boundedInteger(env.DAILY_CONSULTATION_LIMIT, 100, 10000) }),
  });
  if (!response.ok) throw new Error('Shared limits unavailable');
  const allowed = await response.json();
  if (typeof allowed !== 'boolean') throw new Error('Unexpected limit response');
  return allowed;
}
