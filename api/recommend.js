export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    // SCHRITT 1: KI agiert als intelligenter E-Commerce-Assistent & versteht den echten Kontext
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
            content: `Du bist ein intelligenter E-Commerce-Suchassistent für Amazon DE.
Analysiere die gesamte Chat-Historie und erstelle den optimalen, präzisen Suchbegriff (2-4 Wörter) für die Live-Produktsuche.

INTELLIGENTE KONTEXT-REGELN:
- Denke mit: Bedenke den realen Nutzungskontext, die Zielgruppe und Qualitätserwartungen (z. B. sucht ein 10-Jähriger echte Videospielkonsolen wie Nintendo Switch, PlayStation oder Xbox, kein Kleinkinderspielzeug).
- Behalte ZUVOR genannte Anforderungen bei! Wenn der Nutzer in vorherigen Nachrichten "High End", "guter Akku" oder ein spezifisches Budget genannt hat, kombiniere diese Anforderungen im Suchbegriff.

Antworte AUSSCHLIESSLICH mit dem am besten passenden Produkt-Suchbegriff auf Deutsch, ohne Satzzeichen oder Anführungszeichen.` 
          },
          ...messages
        ],
        temperature: 0.1
      })
    });

    const keywordData = await keywordResponse.json();
    const searchQuery = keywordData.choices[0]?.message?.content?.trim() || "Bestseller";

    // SCHRITT 2: Live-Bestseller von Amazon via RapidAPI mit dem geschärften Suchbegriff abfragen
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
      
      // Strikte Begrenzung auf die besten 3 Treffer
      realProducts = hits.slice(0, 3).map(p => ({
        title: p.product_title,
        price: p.product_price || 'Preis auf Amazon',
        rating: p.product_star_rating || '4.5',
        url: p.product_url
      }));
    }

    if (realProducts.length === 0) {
      return res.status(500).json({ error: 'Keine passenden Live-Produkte auf Amazon gefunden.' });
    }

    // SCHRITT 3: ChatGPT analysiert die echten Live-Produkte unter Berücksichtigung des gesamten Verlaufs
    const systemPrompt = `Du bist "Kaufgeist", ein extrem kompetenter und sympathischer KI-Kaufberater auf Deutsch.
Sprich den Nutzer direkt an (Du-Form). 

Lies den bisherigen Chatverlauf aufmerksam. Gehe gezielt auf die Wünsche und den Kontext des Nutzers ein.

Du hast folgende MAXIMAL 3 ECHTE Produkte auf Amazon gefunden:
${JSON.stringify(realProducts)}

AUFGABE FÜR DIE ANTWORT:
1. "reply": Biete eine fundierte Kaufberatung (ca. 3 bis 5 Sätze) mit wichtigen Kriterien & Unterschieden der Produkte.
2. "products": Gib für jedes der 3 Produkte detaillierte Infos an:
   - "pros": Hauptvorteile (1-2 kurze Sätze).
   - "cons": Ehrlicher Nachteil oder Einschränkung (1 kurzer Satz).
   - "targetGroup": Zielgruppen-Empfehlung (z.B. "Perfekt für unterwegs und Familien-Spieleabend").

WICHTIG: Behalte die übergebenen URLs ("url") und Titel exakt bei!`;

    const responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "kaufberatung_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { type: "string" },
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
        max_tokens: 1500,
        temperature: 0.2,
        response_format: responseSchema
      })
    });

    const finalAiData = await finalAiResponse.json();
    const parsedData = JSON.parse(finalAiData.choices[0].message.content);

    // Sicherheits-Slice für maximal 3 Karten im Frontend
    if (parsedData.products) {
      parsedData.products = parsedData.products.slice(0, 3);
    }

    return res.status(200).json(parsedData);

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Live-Analyse: ' + error.message });
  }
}
