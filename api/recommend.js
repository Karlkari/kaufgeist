import { instructions, responseFormat, normalizeMessages, extractResearch, buildAdvice } from '../lib/advice.mjs';
import { reserveConsultation } from '../lib/limits.mjs';

// Dependency injection keeps regression tests offline and free of API charges.
export function createHandler({ fetcher = fetch, reserve = reserveConsultation, env = process.env } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Nur POST ist erlaubt.' });
    }
    if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'Bitte JSON senden.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'Bitte starte die Beratung auf Kaufgeist.' });
    const messages = normalizeMessages(req.body?.messages);
    if (!messages) return res.status(400).json({ error: 'Der Verlauf ist zu lang oder ungültig. Bitte starte einen neuen Chat.' });
    if (!env.OPENAI_API_KEY) return res.status(503).json({ error: 'Die Beratung ist vorübergehend nicht verfügbar.' });
    try {
      if (!await reserve(req, { env, fetcher })) {
        res.setHeader('Retry-After', '300');
        return res.status(429).json({ error: 'Das aktuelle Beratungslimit ist erreicht. Bitte versuche es später erneut.' });
      }
    } catch {
      console.error('advice_limit_unavailable');
      return res.status(503).json({ error: 'Die Beratung ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.' });
    }
    const deadline = AbortSignal.timeout(45000);
    let model = env.OPENAI_MODEL || 'gpt-6-luna';
    let requiredSearch = false;
    try {
      // At most two bounded calls per reservation, including fallback.
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await fetcher('https://api.openai.com/v1/responses', {
          method: 'POST', signal: deadline,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify({ model, instructions, input: messages,
            reasoning: { effort: 'low' }, tools: [{ type: 'web_search', search_context_size: 'low' }],
            tool_choice: requiredSearch ? 'required' : 'auto', include: ['web_search_call.action.sources'],
            max_output_tokens: 4200, max_tool_calls: 3, text: { format: responseFormat }, store: false }),
        });
        const data = await response.json();
        if (!response.ok || data.error) {
          if (attempt === 0 && data.error?.code === 'model_not_found') {
            model = env.OPENAI_FALLBACK_MODEL || 'gpt-5.6-luna';
            continue;
          }
          throw new Error('Upstream unavailable');
        }
        if (data.status !== 'completed') throw new Error('Incomplete response');
        const research = extractResearch(data);
        const parsed = JSON.parse(research.text);
        if (parsed.products?.length && !research.searched) {
          if (attempt === 0) { requiredSearch = true; continue; }
          throw new Error('Missing research');
        }
        return res.status(200).json(buildAdvice(parsed, research));
      }
      throw new Error('Attempt budget exceeded');
    } catch {
      // Never log prompts, replies, upstream bodies, or secrets.
      console.error(deadline.aborted ? 'advice_timeout' : 'advice_failed');
      return res.status(deadline.aborted ? 504 : 502).json({ error: 'Die Recherche konnte nicht abgeschlossen werden. Bitte versuche es erneut.' });
    }
  };
}

export default createHandler();
