const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15;
const requestLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
}

function isRateLimited(ip) {
  const now = Date.now();
  const recent = (requestLog.get(ip) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) return null;

  const normalized = messages.map((message) => {
    const role = message?.role;
    const content = typeof message?.content === 'string' ? message.content.trim() : '';
    if (!['user', 'assistant'].includes(role) || !content) return null;
    const maxLength = role === 'user' ? 1500 : 4000;
    if (content.length > maxLength) return null;
    return { role, content };
  });

  if (normalized.some((message) => !message)) return null;
  if (normalized.reduce((sum, message) => sum + message.content.length, 0) > 12000) return null;
  return normalized;
}

function productMatchScore(recommendedName, candidateTitle) {
  const ignored = new Set(['der', 'die', 'das', 'mit', 'und', 'für', 'von', 'pro', 'plus']);
  const tokens = String(recommendedName || '').toLowerCase().split(/[^a-z0-9äöüß]+/).filter((token) => token.length > 2 && !ignored.has(token));
  const title = String(candidateTitle || '').toLowerCase();
  return tokens.reduce((score, token) => score + (title.includes(token) ? 1 : 0), 0);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type muss application/json sein' });
  }

  if (isRateLimited(getClientIp(req))) {
    res.setHeader('Retry-After', '300');
    return res.status(429).json({ error: 'Zu viele Anfragen. Bitte warte einige Minuten und versuche es erneut.' });
  }

  const messages = normalizeMessages(req.body?.messages);

  if (!messages) {
    return res.status(400).json({ error: 'Der Nachrichtenverlauf ist ungültig oder zu lang.' });
  }

  try {
    // 1. SYSTEM-PROMPT MIT FOKUS AUF SHOPPING & THEMEN-ABGRENZUNG
    const systemPrompt = `Du bist "Kaufgeist", ein empathischer, bedarfsorientierter und transparenter KI-Einkaufsberater auf Deutsch (Du-Form).

FOKUS & THEMEN-ABGRENZUNG (SEHR WICHTIG):
- Du bist AUSSCHLIESSLICH ein Einkaufs- und Produktberater!
- Wenn der Nutzer allgemeine, politische, historische, wissenschaftliche oder Off-Topic-Fragen stellt (z. B. "Donald Trump", "Wie wird das Wetter?", "Erkläre Quantenphysik", Hausaufgaben):
  -> LEHNE freundlich aber bestimmt ab!
  -> Antworte sinngemäß: "Ich bin Kaufgeist, dein persönlicher Einkaufsexperte. Zu diesem Thema kann ich dir leider nicht weiterhelfen – aber frage mich gerne nach Produktempfehlungen, Technik, Haushaltsgeräten oder Geschenkideen!"
  -> Belasse das Array "products" in diesem Fall komplett LEER ([]).

BERATUNGS- UND VERHALTENS-REGELN:
- Handle wie ein echter, menschlicher Experte im Fachgeschäft – nicht wie eine leblose Suchmaschine.
- Wenn wichtige Angaben fehlen (z. B. Budget, genauer Einsatzzweck, Präferenzen), frage im "reply"-Feld zuerst gezielt nach, statt blind Produkte aufzulisten! (Lasse "products" in dem Fall leer: []).
- Erkläre bei Produktempfehlungen immer den konkreten Nutzen ("Das lohnt sich für dich, wenn...") statt nur technische Daten herunterzubeten.
- Behaupte niemals, ein Produkt sei objektiv das beste oder ein angezeigtes Angebot sei der günstigste Marktpreis.
- Erfinde keine Preise, Bewertungen, Testergebnisse oder Verfügbarkeiten. Angebotsdaten werden separat über eine externe Schnittstelle ergänzt.
- Weise bei einer Produktauswahl knapp darauf hin, dass derzeit passende Angebote bei Amazon gesucht werden und kein vollständiger Händlervergleich stattfindet.

FORMATIERUNGS-REGELN FÜR "reply":
- Antworte NIEMALS in einem zusammenhängenden Fließtext-Block!
- Nutze kurze Absätze, Fettdruck (**Begriff**) und übersichtliche Aufzählungspunkte (- Punkt 1), damit der Text perfekt lesbar ist.
- Beende deine Antwort im "reply"-Feld IMMER mit einer klaren, interaktiven Rückfrage, um das Gespräch dynamisch zu halten.

ENTSCHEIDE DEN INTENT DES NUTZERS:
1. Wenn der Nutzer nach Produktempfehlungen sucht und alle Infos da sind:
   - Wähle 2 bis 3 konkrete, etablierte Markenprodukte aus, die zum beschriebenen Bedarf passen.
   - WICHTIG FÜR "searchQuery": Füge IMMER die genaue Produktkategorie mit an (z. B. "PlayStation 5 Slim Konsole" oder "Acer Aspire 5 Laptop"), damit die Suchmaschine kein Zubehör oder Schutzhüllen findet!

2. Wenn der Nutzer Gegenfragen hat, ungenaue Angaben macht oder eine reine Erklärfrage/einen Vergleich zu Produkten stellt:
   - Beantworte die Frage im Feld "reply" und stelle die passenden Gegenfragen für eine engere Auswahl.
   - Lass das Array "products" in diesem Fall komplett LEER ([]).`;

    const responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "kaufberatung_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Empathische, beratende Antwort mit Aufzählungspunkten und Abschlussfrage." },
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  searchQuery: { type: "string" },
                  pros: { type: "string" },
                  cons: { type: "string" },
                  targetGroup: { type: "string" }
                },
                required: ["name", "searchQuery", "pros", "cons", "targetGroup"],
                additionalProperties: false
              }
            }
          },
          required: ["reply", "products"],
          additionalProperties: false
        }
      }
    };

    // 2. OPENAI API-AUFRUF (Primär: GPT-5.6 Luna mit automatischem Fallback)
    const primaryModel = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    const fallbackModel = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o';

    let aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: primaryModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: responseSchema
      }),
      signal: AbortSignal.timeout(25000)
    });

    let aiData = await aiRes.json();

    // Fallback: Falls 'gpt-5.6-luna' nicht auflösbar ist, greift gpt-4o ohne Serverfehler
    if (aiData.error && (aiData.error.code === 'model_not_found' || aiData.error.type === 'invalid_request_error' || aiData.error.status === 404)) {
      console.warn(`Modell ${primaryModel} nicht erreichbar. Schalte auf ${fallbackModel} um...`);
      
      aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: fallbackModel,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          response_format: responseSchema
        }),
        signal: AbortSignal.timeout(25000)
      });

      aiData = await aiRes.json();
    }

    if (aiData.error) {
      console.error('OpenAI Error Details:', aiData.error);
      return res.status(500).json({ error: aiData.error.message || 'OpenAI API Fehler' });
    }

    const parsed = JSON.parse(aiData.choices[0].message.content);

    // 3. LIVE-DATEN VIA RAPIDAPI
    let finalProducts = [];
    if (parsed.products && parsed.products.length > 0 && process.env.RAPIDAPI_KEY) {
      finalProducts = await Promise.all(
        parsed.products.slice(0, 3).map(async (p) => {
          let price = 'Beim Händler prüfen';
          let rating = null;
          let directUrl = `https://www.amazon.de/s?k=${encodeURIComponent(p.searchQuery)}`;
          let displayName = p.name;

          try {
            const apiRes = await fetch(
              `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(p.searchQuery)}&country=DE`,
              {
                headers: {
                  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                  'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
                },
                signal: AbortSignal.timeout(10000)
              }
            );
            const searchData = await apiRes.json();
            const productsList = searchData.data?.products || [];

            const rankedProducts = productsList
              .map((item) => ({ item, score: productMatchScore(p.name, item.product_title) }))
              .filter(({ item }) => {
                const rawPrice = parseFloat((item.product_price || '').replace(/[^0-9,.]/g, '').replace(',', '.'));
                return !isNaN(rawPrice) && rawPrice > 0 && item.product_url;
              })
              .sort((a, b) => b.score - a.score);

            const recommendedTokenCount = String(p.name || '').split(/\s+/).filter(Boolean).length;
            const minimumScore = recommendedTokenCount <= 2 ? 1 : 2;
            const hit = rankedProducts[0]?.score >= minimumScore ? rankedProducts[0].item : null;

            if (hit) {
              price = hit.product_price || price;
              rating = hit.product_star_rating || rating;
              directUrl = hit.product_url || directUrl;
              displayName = hit.product_title || displayName;
            }
          } catch (e) {
            console.error('RapidAPI Fetch Error:', e);
          }

          return {
            name: displayName,
            price: price,
            rating: rating,
            pros: p.pros,
            cons: p.cons,
            targetGroup: p.targetGroup,
            directUrl: directUrl
          };
        })
      );
    }

    // 4. SUPABASE REST LOGGING
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      try {
        const cleanUrl = process.env.SUPABASE_URL.trim().replace(/\/+$/, '');
        const endpoint = `${cleanUrl}/rest/v1/chat_logs`;

        const dbRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            user_query: messages[messages.length - 1]?.content || '',
            ai_reply: parsed.reply,
            recommended_products: finalProducts
          })
        });

        if (!dbRes.ok) {
          const errorText = await dbRes.text();
          console.error('Supabase Status Fehler:', dbRes.status, errorText);
        } else {
          console.log('Erfolgreich in Supabase protokolliert!');
        }
      } catch (dbErr) {
        console.error('Supabase Network Fehler:', dbErr);
      }
    }

    // 5. FINALE ANTWORT
    return res.status(200).json({
      reply: parsed.reply,
      products: finalProducts
    });

  } catch (error) {
    console.error('Server Handler Error:', error);
    return res.status(500).json({ error: 'Die Beratung ist gerade nicht verfügbar. Bitte versuche es später erneut.' });
  }
}
