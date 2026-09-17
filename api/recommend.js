export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    // SCHRITT 1: KI entscheidet den Intent und formatiert strukturiert
    const systemPrompt = `Du bist "Kaufgeist", ein hochkompetenter KI-Einkaufsberater auf Deutsch (Du-Form).

FORMATIERUNGS-REGELN FÜR "reply":
- Antworte NIEMALS in einem zusammenhängenden Fließtext-Block!
- Nutze kurze Absätze, Fettdruck (**Begriff**) und übersichtliche Aufzählungspunkte (- Punkt 1), damit der Text perfekt lesbar ist.

ENTTSCHEIDE DEN INTENT DES NUTZERS:
1. Wenn der Nutzer nach konkreten Produktempfehlungen, Angeboten oder Preisen sucht:
   - Wähle 2 bis 3 AKTUELLE, echte Markenprodukte auf Amazon aus.
   - Erstelle für jedes Produkt ein "searchQuery"-Feld mit der exakten Bezeichnung (z. B. "Playstation 5 Slim Digital").

2. Wenn der Nutzer NUR eine Erklärfrage, einen Vergleich oder eine Detailfrage stellt (z. B. "Was sind die Unterschiede?"):
   - Beantworte die Frage übersichtlich und strukturiert im Feld "reply".
   - Lass das Array "products" komplett LEER ([]).`;

    const responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "kaufberatung_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { type: "string", description: "Ausführliche, sauber durch Aufzählungspunkte gegliederte Antwort." },
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

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.2,
        response_format: responseSchema
      })
    });

    const aiData = await aiRes.json();

    if (aiData.error) {
      return res.status(500).json({ error: aiData.error.message || 'OpenAI API Fehler' });
    }

    const parsed = JSON.parse(aiData.choices[0].message.content);

    // Falls keine Produkte gefordert sind (reine Wissensfrage), sofort mit Text antworten
    if (!parsed.products || parsed.products.length === 0) {
      return res.status(200).json({
        reply: parsed.reply,
        products: []
      });
    }

    // SCHRITT 2: Falls Produkte gefordert sind, Live-Daten via RapidAPI holen
    let finalProducts = [];
    if (process.env.RAPIDAPI_KEY) {
      finalProducts = await Promise.all(
        parsed.products.slice(0, 3).map(async (p) => {
          let price = 'Preis auf Amazon';
          let rating = '4.6';
          let directUrl = `https://www.amazon.de/s?k=${encodeURIComponent(p.searchQuery)}`;

          try {
            const apiRes = await fetch(
              `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(p.searchQuery)}&country=DE`,
              {
                headers: {
                  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                  'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
                }
              }
            );
            const searchData = await apiRes.json();
            const hit = searchData.data?.products?.[0];

            if (hit) {
              price = hit.product_price || price;
              rating = hit.product_star_rating || rating;
              directUrl = hit.product_url || directUrl;
            }
          } catch (e) {
            // Fallback auf Such-Link
          }

          return {
            name: p.name,
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

    return res.status(200).json({
      reply: parsed.reply,
      products: finalProducts
    });

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Analyse: ' + error.message });
  }
}
