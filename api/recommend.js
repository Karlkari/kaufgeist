export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    const lastUserMessage = messages[messages.length - 1]?.content || 'Bestseller';

    // 1. Präzisen Suchbegriff extrahieren
    const keywordResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'Extrahiere aus der Nachricht den prägnantesten deutschen Suchbegriff für Amazon (z.B. "Smartphone", "Kaffeevollautomat", "Gaming Laptop"). Antworte AUSSCHLIESSLICH mit dem Suchbegriff, ohne Satzzeichen.' 
          },
          { role: 'user', content: lastUserMessage }
        ],
        temperature: 0.1
      })
    });

    const keywordData = await keywordResponse.json();
    const searchQuery = keywordData.choices[0]?.message?.content?.trim() || lastUserMessage;

    // 2. Live-Bestseller von Amazon via RapidAPI abfragen
    let realProducts = [];
    if (process.env.RAPIDAPI_KEY) {
      const apiRes = await fetch(
        `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&country=DE`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
          }
        }
      );

      const searchData = await apiRes.json();
      const hits = searchData.data?.products || [];
      
      realProducts = hits.slice(0, 3).map(p => ({
        title: p.product_title,
        price: p.product_price || 'Preis auf Amazon',
        rating: p.product_star_rating || '4.5',
        url: p.product_url
      }));
    }

    if (realProducts.length === 0) {
      return res.status(500).json({ error: 'Keine Live-Produkte auf Amazon gefunden. Bitte RAPIDAPI_KEY prüfen.' });
    }

    // 3. Ausführliche KI-Analyse & Beratung generieren
    const systemPrompt = `Du bist "Kaufgeist", ein extrem kompetenter, sympathischer und ausführlicher KI-Kaufberater auf Deutsch.
Sprich den Nutzer direkt an (Du-Form).

Du hast folgende 3 ECHTE, aktuell auf Amazon Deutschland erhältliche Produkte gefunden:
${JSON.stringify(realProducts)}

AUFGABE FÜR DIE ANTWORT:
1. "reply": Biete eine fundierte, ausführliche Kaufberatung (ca. 4 bis 6 Sätze). Erkläre dem Nutzer genau, worauf es in dieser Produktkategorie ankommt (z. B. wichtigste Merkmale, Preis-Leistungs-Verhältnis) und wie sich die 3 Optionen voneinander unterscheiden.
2. "products": Gib für jedes der 3 Produkte detaillierte Informationen an:
   - "pros": Ausführliche Highlights & Hauptvorteile (2-3 prägnante Sätze oder Aufzählungspunkte).
   - "cons": Ehrlicher Nachteil oder Einschränkung (1-2 Sätze).
   - "targetGroup": Konkrete Empfehlung, für wen dieses Modell am besten geeignet ist (z.B. "Ideal für Einsteiger mit kleinem Budget" oder "Perfekt für Power-User, die maximale Leistung suchen").

WICHTIG: Behalte die übergebenen URLs ("url") und Titel exakt bei!`;

    const responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "kaufberatung_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Ausführliche Kaufberatung (4-6 Sätze)" },
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  price: { type: "string" },
                  rating: { type: "string" },
                  pros: { type: "string" },
                  cons: { type: "string" },
                  targetGroup: { type: "string" },
                  directUrl: { type: "string" }
                },
                required: ["name", "price", "rating", "pros", "cons", "targetGroup", "directUrl"],
                additionalProperties: false
              }
            }
          },
          required: ["reply", "products"],
          additionalProperties: false
        }
      }
    };

    const finalAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }],
        max_tokens: 1800, // Token-Limit erhöht für ausführliche Antworten
        temperature: 0.3,
        response_format: responseSchema
      })
    });

    const finalAiData = await finalAiResponse.json();
    const parsedData = JSON.parse(finalAiData.choices[0].message.content);

    return res.status(200).json(parsedData);

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Live-Analyse: ' + error.message });
  }
}
