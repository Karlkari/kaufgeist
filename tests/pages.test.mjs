import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../scripts/build.mjs';

test('all static pages have correct canonicals, consent and legal links', async () => {
  for (const path of ['index', 'impressum', 'datenschutz', 'transparenz', 'beratung/office-laptop', 'beratung/kaffeevollautomat']) {
    const html = await readFile(new URL(`../dist/${path}.html`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`rel="canonical" href="https://www.kaufgeist.de/${path === 'index' ? '' : path}"`));
    assert.match(html, /href="\/datenschutz"/); assert.match(html, /src="\/assets\/app.mjs"/);
    assert.doesNotMatch(html, /id="datenschutzModal"|Als Amazon-Partner verdiene/);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
  }
});
test('home stays general and landing pages are distinct', async () => {
  const home = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const laptop = await readFile(new URL('../dist/beratung/office-laptop.html', import.meta.url), 'utf8');
  const coffee = await readFile(new URL('../dist/beratung/kaffeevollautomat.html', import.meta.url), 'utf8');
  assert.match(home, /Welches Produkt passt wirklich zu dir/);
  assert.match(laptop, /Welcher Laptop passt/); assert.match(coffee, /Welcher Kaffeevollautomat passt/);
  assert.doesNotMatch(laptop, /placeholder="Z. B. Laptop bis 700 € für Office und Videos"/);
});
