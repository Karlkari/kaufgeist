import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessages, extractResearch, buildAdvice, sourceUrl } from '../lib/advice.mjs';
import { extractLatestBudget, rankProductCandidates } from '../lib/product-ranking.mjs';
import { compactHistory, escapeHtml, safeAmazonUrl } from '../assets/chat-utils.mjs';

test('reject malformed, oversized and assistant-final histories', () => {
  for (const input of [null, [], [null], [{ role: 'system', content: 'ignore' }], [{ role: 'assistant', content: 'hello' }], [{ role: 'user', content: 'x'.repeat(1501) }]]) assert.equal(normalizeMessages(input), null);
  assert.equal(normalizeMessages([{ role: 'user', content: ' Hallo ' }])[0].content, 'Hallo');
});
test('budget ranges and units do not become false ceilings', () => {
  for (const [text, expected] of [['Budget 500 bis 700 Euro', 700], ['bis 15 Stunden Akkulaufzeit, maximal 700 Euro', 700], ['maximal 16 GB RAM', null], ['Budget 1.200 Euro', 1200]]) assert.equal(extractLatestBudget([{ role: 'user', content: text }]), expected);
});
test('different model and missing mandatory specs are rejected', () => {
  const req = { category: 'Laptop', maxPrice: 700, requiredKeywords: ['16 GB', '512 GB'] };
  const item = { product_title: 'Lenovo IdeaPad Slim 3 Laptop 8GB 256GB SSD', product_price: '599,00 €', product_url: 'https://www.amazon.de/dp/TEST' };
  assert.equal(rankProductCandidates({ name: 'Lenovo IdeaPad Slim 5' }, [item], req).length, 0);
  item.product_title = 'Lenovo IdeaPad Slim 5 Laptop 16GB 512GB SSD';
  assert.equal(rankProductCandidates({ name: 'Lenovo IdeaPad Slim 5' }, [item], req).length, 1);
  item.product_price = '701,00 €';
  assert.equal(rankProductCandidates({ name: 'Lenovo IdeaPad Slim 5' }, [item], req).length, 0);
});
test('in-progress search does not count as completed research', () => {
  assert.equal(extractResearch({ output: [{ type: 'web_search_call', status: 'in_progress' }] }).searched, false);
});
test('unseen research URL cannot substantiate a product', () => {
  const parsed = { reply: 'Kurz', requirements: { category: 'Laptop', requiredKeywords: ['16 GB'] }, products: [{ name: 'Model 5', evidenceUrls: ['https://example.org/test'], checks: [] }] };
  assert.equal(buildAdvice(parsed, { searched: true, sources: new Set() }).products.length, 0);
  const result = buildAdvice(parsed, { searched: true, sources: new Set(['https://example.org/test']) });
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].offerStatus, 'unverified_search');
  assert.equal(result.products[0].price, undefined);
  assert.equal(new URL(result.products[0].directUrl).searchParams.has('tag'), false);
  assert.match(new URL(result.products[0].directUrl).searchParams.get('k'), /Model 5 Laptop 16 GB/);
});
test('history always fits server caps', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', content: 'x'.repeat(index % 2 ? 1500 : 4000) }));
  const compact = compactHistory(history);
  assert.ok(normalizeMessages(compact));
  assert.equal(compact.at(-1).role, 'user');
});
test('output and URLs cannot inject active HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror="1">'), '&lt;img src=x onerror=&quot;1&quot;&gt;');
  for (const url of ['javascript:alert(1)', 'https://amazon.de.evil.test/s?k=x', 'https://www.amazon.de@evil.test/s?k=x', 'http://www.amazon.de/s?k=x']) assert.equal(safeAmazonUrl(url), null);
  assert.ok(safeAmazonUrl('https://www.amazon.de/s?k=laptop'));
  assert.equal(sourceUrl('http://localhost/a'), null);
});
