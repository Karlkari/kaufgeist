import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../api/recommend.js';
import { reserveConsultation } from '../lib/limits.mjs';
const env = { OPENAI_API_KEY: 'TEST_NOT_A_REAL_KEY' };
const request = () => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { messages: [{ role: 'user', content: 'Laptop fürs Büro' }] } });
function response() { return { headers: {}, code: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } }; }
const parsed = { reply: 'Wie hoch ist dein Budget?', requirements: {}, products: [] };
const ai = (value = parsed, searched = false) => ({ status: 'completed', output: [...(searched ? [{ type: 'web_search_call', status: 'completed', action: { sources: [{ url: 'https://example.org/test' }] } }] : []), { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
test('validation before any paid call', async () => {
  let calls = 0;
  const handler = createHandler({ env, reserve: async () => { calls++; return true; }, fetcher: async () => { calls++; } });
  for (const [req, code] of [[{ ...request(), method: 'GET' }, 405], [{ ...request(), body: {} }, 400], [{ ...request(), headers: { 'content-type': 'text/plain' } }, 415]]) { const res = response(); await handler(req, res); assert.equal(res.code, code); }
  assert.equal(calls, 0);
});
test('shared limit denial makes zero AI requests', async () => {
  let calls = 0;
  const res = response();
  await createHandler({ env, reserve: async () => false, fetcher: async () => { calls++; } })(request(), res);
  assert.equal(res.code, 429); assert.equal(calls, 0);
});
test('shared limit outage fails closed', async () => {
  const res = response();
  await createHandler({ env, reserve: async () => { throw new Error('database down'); } })(request(), res);
  assert.equal(res.code, 503);
  assert.doesNotMatch(JSON.stringify(res.data), /database/);
});
test('successful clarification bounded and does not persist chat', async () => {
  const calls = [];
  const res = response();
  await createHandler({ env, reserve: async () => true, fetcher: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ai() }; } })(request(), res);
  assert.equal(res.code, 200); assert.equal(calls.length, 1);
  assert.equal(calls[0].body.store, false); assert.equal(calls[0].body.max_tool_calls, 3);
  assert.equal(calls[0].body.max_output_tokens, 4200);
});
test('requires completed research; at most one additional attempt', async () => {
  const product = { ...parsed, products: [{ name: 'Model 5', evidenceUrls: ['https://example.org/test'], checks: [] }] };
  const calls = [];
  const res = response();
  await createHandler({ env, reserve: async () => true, fetcher: async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ai(product, calls.length === 2) }; } })(request(), res);
  assert.equal(calls.length, 2); assert.equal(calls[1].tool_choice, 'required');
  assert.equal(res.code, 200); assert.equal(res.data.products.length, 1);
});
test('no completed research after retry fails safely', async () => {
  let calls = 0;
  const res = response();
  await createHandler({ env, reserve: async () => true, fetcher: async () => { calls++; return { ok: true, json: async () => ai({ ...parsed, products: [{ name: 'Model' }] }) }; } })(request(), res);
  assert.equal(calls, 2); assert.equal(res.code, 502);
});
test('only model_not_found permits model fallback', async () => {
  let calls = 0; const res = response();
  await createHandler({ env, reserve: async () => true, fetcher: async () => { calls++; return { ok: false, json: async () => ({ error: { type: 'invalid_request_error' } }) }; } })(request(), res);
  assert.equal(calls, 1); assert.equal(res.code, 502);
});
test('rate limiter hashes IP and sends no chat content', async () => {
  const req = { ...request(), headers: { 'x-forwarded-for': '192.0.2.1' } };
  const bodies = [];
  const options = { env: { SUPABASE_URL: 'https://db.example.org', SUPABASE_KEY: 'test', RATE_LIMIT_SALT: 'test_salt' }, fetcher: async (url, init) => { bodies.push(init.body); return { ok: true, json: async () => true }; } };
  await reserveConsultation(req, { ...options, now: new Date('2026-10-03') });
  await reserveConsultation(req, { ...options, now: new Date('2026-10-04') });
  assert.doesNotMatch(bodies[0], /192\.0\.2\.1|Laptop/);
  assert.notEqual(JSON.parse(bodies[0]).p_ip_key, JSON.parse(bodies[1]).p_ip_key);
});
