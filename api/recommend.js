export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    // SCHRITT 1: ChatGPT kombiniert ALLE Kriterien aus dem gesamten Chatverlauf
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
            content: `Du bist ein Such-Optimierer für Amazon.
Lies die GESAMTE Chat-Historie durch und erstelle einen kombinierten Suchbegriff (2-5 Wörter) für Amazon.

STRIKTE REGEL:
- Behalte ZUVOR genannte Anforderungen bei! Wenn der Nutzer vorher "High End", "hochleistungsvoll" oder ein Oberklasse-Gerät wollte und jetzt "guter Akku" schreibt, erstelle einen Kombi-Suchbegriff wie: "Flaggschiff Smartphone großer Akku High End".
- Verliere das Qualitäts-/Preissegment aus den vorherigen Nachrichten NIEMALS aus dem Blick.

Antworte AUSSCHLIESSLICH mit dem kombinierten Suchbegriff auf Deutsch, ohne Anführungszeichen.` 
          },
          ...messages
        ],
        temperature: 0.1
      })
    });

    const keywordData = await keywordResponse.json();
    const searchQuery = keywordData.choices[0]?.message?.content?.trim() || "Flaggschiff Smartphone";

    // SCHRITT 2: Amazon-Suche über RapidAPI mit dem gebündelten Suchbegriff
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
      return res.status(500).json({ error: 'Keine passenden Produkte auf Amazon gefunden.' });
    }

    // SCHRITT 3: ChatGPT analysiert die passenden Geräte unter Berücksichtigung des gesamten Verlaufs
    const systemPrompt = `Du bist "Kaufgeist", ein kompetenter KI-Kaufberater auf Deutsch.
Sprich den Nutzer direkt an (Du-Form). 

Lies den bisherigen Chatverlauf aufmerksam. Achte darauf, ALLE Wünsche des Nutzers (z.B. sowohl High-End-Leistung als auch lange Akkulaufzeit) in deiner Begründung zu berücksichtigen.

Du hast folgende 3 ECHTE Produkte gefunden:
${JSON.stringify(realProducts)}

AUFGABE FÜR DIE ANTWORT:
1. "reply": Gehe in 3-4 Sätzen darauf ein, wie diese Modelle das Leistungskriterium UND die neue Rückfrage (z.B. Akkulaufzeit) optimal verbinden.
2. "products": Gib für jedes der 3 Produkte detaillierte Infos an:
   - "pros": Hauptvorteile (z.B. Top-Prozessor, starker Akku, Oberklasse-Display).
   - "cons": Ehrlicher Nachteil/Einschränkung (1 kurzer Satz).
   - "targetGroup": Zielgruppen-Empfehlung (z.B. "Perfekt für Power-User, die maximale Akkulaufzeit im High-End-Bereich suchen").

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

    if (parsedData.products) {
      parsedData.products = parsedData.products.slice(0, 3);
    }

    return res.status(200).json(parsedData);

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Live-Analyse: ' + error.message });
  }
}
