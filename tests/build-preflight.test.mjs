import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('Vercel production build fails before generating pages when credentials are missing', () => {
  const result = spawnSync(process.execPath, ['scripts/build-vercel.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { VERCEL_ENV: 'production' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Production preflight: INVALID_SUPABASE_URL/);
  assert.doesNotMatch(result.stdout, /Built .* static pages/);
  assert.equal(result.stderr, '');
});

test('Vercel invokes the guarded build; regular offline builds remain independent', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(config.buildCommand, 'node scripts/build-vercel.mjs');
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
  assert.equal(config.outputDirectory, 'dist');
});
