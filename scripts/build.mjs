import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { legalPages, landingPages } from './pages.mjs';
import { siteConfig } from '../assets/site-config.mjs';
import { escapeHtml } from '../assets/chat-utils.mjs';

const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const out = new URL('../dist/', import.meta.url);
await mkdir(out, { recursive: true });
await cp(new URL('../assets/', import.meta.url), new URL('assets/', out), { recursive: true });
const ga4Id = process.env.PUBLIC_GA4_ID || siteConfig.ga4Id;
const label = process.env.PUBLIC_GOOGLE_ADS_CONVERSION_LABEL || siteConfig.adsOutboundConversionLabel;
if (ga4Id && !/^G-[A-Z0-9]+$/.test(ga4Id)) throw new Error('Invalid PUBLIC_GA4_ID');
if (ga4Id && process.env.PUBLIC_GA4_ENHANCED_MEASUREMENT_DISABLED !== '1') throw new Error('Disable GA4 enhanced measurement in the data stream, then set PUBLIC_GA4_ENHANCED_MEASUREMENT_DISABLED=1. Auto outbound/form events can expose query content.');
if (label && !/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('Invalid Ads conversion label');
await writeFile(new URL('assets/site-config.mjs', out), `export const siteConfig = ${JSON.stringify({ ...siteConfig, ga4Id, adsOutboundConversionLabel: label })};\n`);
await writeFile(new URL('index.html', out), template);
function metadata(html, title, description, path) {
  return html.replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)} | Kaufgeist</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escapeHtml(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escapeHtml(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escapeHtml(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1https://www.kaufgeist.de/${path}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1https://www.kaufgeist.de/${path}`);
}
const urls = ['/'];
for (const [slug, page] of Object.entries(legalPages)) {
  let html = template.replace(/<main id="start">[\s\S]*?<\/main>/, `<main id="start"><section class="section legal">${page.html}<p><a href="/">Zur Kaufberatung</a></p></section></main>`);
  html = html.replace('data-page="home"', 'data-page="information"').replaceAll('href="#', 'href="/#');
  await writeFile(new URL(`${slug}.html`, out), metadata(html, page.title, page.description, slug));
  urls.push(`/${slug}`);
}
await mkdir(new URL('beratung/', out), { recursive: true });
for (const [slug, page] of Object.entries(landingPages)) {
  let html = template.replace('data-page="home"', `data-page="${slug}"`)
    .replace(/(<h1 id="hero-title">)[\s\S]*?<\/h1>/, `$1${page.headline}</h1>`)
    .replace(/(<p class="hero-lead">)[\s\S]*?<\/p>/, `$1${page.lead}</p>`)
    .replace(/(id="heroInput"[^>]*placeholder=")[^"]*/, `$1${escapeHtml(page.placeholder)}`)
    .replace(/<div id="quickTags"[\s\S]*?<\/div>/, `<div id="quickTags" class="quick-tags"><span>Beispiele:</span>${page.quick.map(([label, query]) => `<button class="tag-btn" onclick="quickSearch('${escapeHtml(query)}')">${label}</button>`).join('')}</div>`)
    .replace(/(<div class="example-question">)[\s\S]*?<\/div>/, `$1<span class="product-badge">Beispiel zur Orientierung</span><h3>${page.question}</h3><p>Diese Kriterien helfen vor der Modellauswahl.</p></div>`)
    .replace(/(<div class="example-answer">)[\s\S]*?<\/div>/, `$1<h3>Worauf es ankommt</h3><ul>${page.guide}</ul><p>Kein aktuelles Angebot. Preis und konkrete Ausstattung beim Händler prüfen.</p></div>`);
  await writeFile(new URL(`beratung/${slug}.html`, out), metadata(html, page.title, page.lead, `beratung/${slug}`));
  urls.push(`/beratung/${slug}`);
}
await writeFile(new URL('sitemap.xml', out), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(path => `<url><loc>https://www.kaufgeist.de${path}</loc></url>`).join('')}</urlset>\n`);
await cp(new URL('../robots.txt', import.meta.url), new URL('robots.txt', out));
console.log(`Built ${urls.length} static pages. Analytics events ${ga4Id ? 'configured' : 'await PUBLIC_GA4_ID'}; Ads micro-conversion ${label ? 'configured' : 'await label'}.`);
