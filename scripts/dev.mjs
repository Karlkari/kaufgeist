import './build.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import handler from '../api/recommend.js';
const root = resolve('dist');
const demo = process.env.KAUFGEIST_DEMO === '1';
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/recommend') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 20000) { res.writeHead(413); res.end(); return; } }
    try { req.body = JSON.parse(body); } catch { res.writeHead(400); res.end('{}'); return; }
    res.status = code => { res.statusCode = code; return res; };
    res.json = object => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(object)); };
    if (demo) {
      await new Promise(resolve => setTimeout(resolve, 700));
      return res.json({ reply: 'VORSCHAU MIT TESTDATEN – keine echte Produktberatung. Hier erscheinen eine kurze Einordnung und die wichtigsten Kompromisse.', requirements: { maxPrice: 700, requiredKeywords: ['16 GB RAM', '512 GB SSD'] }, products: [0, 1, 2].map(index => ({ name: `Beispiel-Modell ${index + 1}`, targetGroup: 'Für Office und Videokonferenzen.', pros: 'Kurze, nachvollziehbare Begründung für diesen Einsatzzweck.', cons: 'Eine klar benannte Einschränkung statt eines pauschalen Testsieger-Versprechens.', checks: ['Preis bis 700 €', '16 GB RAM / 512 GB SSD', 'Windows und Zustand kontrollieren'], uncertainty: 'Konkrete Variante und aktueller Preis noch offen.', sources: ['https://www.example.org/test'], offerStatus: 'unverified_search', directUrl: `https://www.amazon.de/s?k=Beispiel-Modell%20${index + 1}` })) });
    }
    return handler(req, res);
  }
  let relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\//, '');
  if (!extname(relative)) relative += '.html';
  const path = resolve(root, relative);
  if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(path); res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404); res.end('Nicht gefunden'); }
}).listen(Number(process.env.PORT) || 4175, '127.0.0.1', () => console.log(`Preview http://127.0.0.1:${process.env.PORT || 4175} (${demo ? 'DEMO: no external API calls' : 'real backend, requires configuration'})`));
