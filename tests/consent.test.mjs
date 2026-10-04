import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const script = (await readFile(new URL('../assets/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '').replace('export function track', 'function track');
function browser(choice = null) {
  const scripts = [];
  const storage = new Map(choice ? [['kaufgeist_measurement_consent_v2', JSON.stringify(choice)]] : []);
  let reloads = 0;
  const banner = { classList: { add() {}, remove() {} } };
  const context = {
    siteConfig: { googleAdsId: 'AW-TEST', ga4Id: 'G-TEST', adsOutboundConversionLabel: 'test-label', consentVersion: 'test-v1' },
    window: { location: { origin: 'https://kaufgeist.example', pathname: '/', hostname: 'kaufgeist.example', reload() { reloads++; } } },
    document: { body: { dataset: { page: 'home' } }, cookie: '', head: { appendChild(script) { scripts.push(script); } }, createElement() { return {}; }, getElementById() { return banner; } },
    localStorage: { getItem(key) { return storage.get(key); }, setItem(key, value) { storage.set(key, value); } },
    Date, URL, console,
  };
  runInNewContext(script, context);
  return { context, scripts, storage, reloads: () => reloads, events: () => context.window.dataLayer.map(args => Array.from(args)) };
}
test('no scripts or measurement events before consent', () => {
  const b = browser(); b.context.track('consultation_start');
  assert.equal(b.scripts.length, 0);
  assert.equal(b.events().length, 1);
  assert.equal(b.events()[0][0], 'consent');
  assert.equal(b.events()[0][2].ad_storage, 'denied');
});
test('accept then revoke updates consent, persists rejection and stops old page', () => {
  const b = browser(); b.context.window.setConsent(true);
  assert.equal(b.scripts.length, 1);
  b.context.track('amazon_search_click', { position: 1 });
  const conversion = b.events().find(x => x[1] === 'conversion');
  assert.ok(conversion); assert.equal(conversion[2].value, undefined);
  b.context.window.setConsent(false);
  const count = b.events().length; b.context.track('consultation_start');
  assert.equal(b.events().length, count);
  assert.equal(b.reloads(), 1);
  assert.equal(b.events().at(-1)[2].ad_user_data, 'denied');
  assert.equal(JSON.parse(b.storage.get('kaufgeist_measurement_consent_v2')).accepted, false);
});
test('old consent version does not silently authorize new services', () => {
  const b = browser({ accepted: true, at: Date.now(), version: 'old-version' });
  assert.equal(b.scripts.length, 0);
});
test('returning rejection keeps all measurement disabled', () => {
  const b = browser({ accepted: false, at: Date.now(), version: 'test-v1' });
  b.context.track('amazon_search_click'); assert.equal(b.scripts.length, 0);
  assert.equal(b.events().filter(x => x[0] === 'event').length, 0);
});
