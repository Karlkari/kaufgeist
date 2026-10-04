import { checkProduction } from './check-production.mjs';

// Production credentials stay inside Vercel's build environment. No AI call, no public endpoint.
if (process.env.VERCEL_ENV === 'production') {
  const result = await checkProduction();
  console.log(`Production preflight: ${result.code}`);
  if (!result.ok) process.exit(1);
}

await import('./build.mjs');
