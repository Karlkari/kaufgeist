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

    // SCHRITT 1: ChatGPT extrahiert nur die Produktkategorie als Suchbegriff
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

    // SCHRITT 2: Live-Bestseller von Amazon via RapidAPI abfragen
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
      
      // Nimmt die obersten 3 echten Amazon-Treffer
      realProducts = hits.slice(0, 3).map(p => ({
        title: p.product_title,
        price: p.product_price || 'Preis auf Amazon',
        rating: p.product_star_rating || '4.5',
        url: p.product_url
      }));
    }

    // Falls RapidAPI keine Daten liefert oder Key fehlt (Fallback)
    if (realProducts.length === 0) {
      return res.status(500).json({ error: 'Keine Live-Produkte auf Amazon gefunden. Bitte RAPIDAPI_KEY prüfen.' });
    }

    // SCHRITT 3: ChatGPT bewertet die echten Live-Produkte für den Nutzer
    const systemPrompt = `Du bist "Kaufgeist", ein unabhängiger KI-Kaufberater auf Deutsch.
Sprich den Nutzer direkt an (Du-Form).
Du hast folgende 3 ECHTE, aktuell auf Amazon Deutschland erhältliche Produkte gefunden:
${JSON.stringify(realProducts)}

Aufgabe:
Formuliere eine kurze Begrüßung/Einschätzung (max. 2 Sätze) und erstelle für jedes der 3 Produkte einen prägnanten Vorteil ("pros") und einen Einschränkungspunkt ("cons") in jeweils 1 kurzen Satz.
Behalte die übergebenen URLs und Titel exakt bei!`;

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
                  directUrl: { type: "string" }
                },
                required: ["name", "price", "rating", "pros", "cons", "directUrl"],
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
        temperature: 0.2,
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
