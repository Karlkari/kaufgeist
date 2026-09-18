export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    // 1. SYSTEM-PROMPT FÜR INTERAKTIVE BERATUNG UND PRÄZISE SUCHEN
    const systemPrompt = `Du bist "Kaufgeist", ein empathischer, unabhängiger und hochkompetenter KI-Einkaufsberater auf Deutsch (Du-Form).

BERATUNGS- UND VERHALTENS-REGELN:
- Handle wie ein echter, menschlicher Experte im Fachgeschäft – nicht wie eine leblose Suchmaschine.
- Wenn wichtige Angaben fehlen (z. B. Budget, genauer Einsatzzweck, Präferenzen), frage im "reply"-Feld zuerst gezielt nach, statt blind Produkte aufzulisten! (Lasse "products" in dem Fall leer: []).
- Erkläre bei Produktempfehlungen immer den konkreten Nutzen ("Das lohnt sich für dich, wenn...") statt nur technische Daten herunterzubeten.

FORMATIERUNGS-REGELN FÜR "reply":
- Antworte NIEMALS in einem zusammenhängenden Fließtext-Block!
- Nutze kurze Absätze, Fettdruck (**Begriff**) und übersichtliche Aufzählungspunkte (- Punkt 1), damit der Text perfekt lesbar ist.
- Beende deine Antwort im "reply"-Feld IMMER mit einer klaren, interaktiven Rückfrage, um das Gespräch dynamisch zu halten.

ENTSCHEIDE DEN INTENT DES NUTZERS:
1. Wenn der Nutzer nach Produktempfehlungen sucht und alle Infos da sind:
   - Wähle 2 bis 3 AKTUELLE, echte Markenprodukte auf Amazon aus.
   - WICHTIG FÜR "searchQuery": Füge IMMER die genaue Produktkategorie mit an (z. B. "PlayStation 5 Slim Konsole" oder "Acer Aspire 5 Laptop"), damit die Suchmaschine kein Zubehör oder Schutzhüllen findet!

2. Wenn der Nutzer Gegenfragen hat, ungenaue Angaben macht oder eine reine Erklärfrage/einen Vergleich stellt:
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

    // 2. OPENAI API-AUFRUF (gpt-5.6-luna)
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5.6-luna',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: responseSchema
      })
    });

    const aiData = await aiRes.json();

    if (aiData.error) {
      return res.status(500).json({ error: aiData.error.message || 'OpenAI API Fehler' });
    }

    const parsed = JSON.parse(aiData.choices[0].message.content);

    // 3. LIVE-DATEN HOLEN (Falls Produkte vom Modell vorgeschlagen wurden)
    let finalProducts = [];
    if (parsed.products && parsed.products.length > 0 && process.env.RAPIDAPI_KEY) {
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
            const productsList = searchData.data?.products || [];

            // FILTER GEGEN FALSCHE PREISE / ZUBEHÖR (> 80€)
            const hit = productsList.find(item => {
              const rawPrice = parseFloat((item.product_price || '').replace(/[^0-9,.]/g, '').replace(',', '.'));
              return !isNaN(rawPrice) && rawPrice > 80;
            }) || productsList[0];

            if (hit) {
              price = hit.product_price || price;
              rating = hit.product_star_rating || rating;
              directUrl = hit.product_url || directUrl;
            }
          } catch (e) {
            // Fallback auf den Suchlink
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

    // 4. SPEICHERN IN SUPABASE VIA REST API
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      try {
        const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
        const dbRes = await fetch(`${baseUrl}/rest/v1/chat_logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Profile': 'public',
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
          console.error('Supabase HTTP Fehler:', dbRes.status, errorText);
        } else {
          console.log('Erfolgreich in Supabase protokolliert!');
        }
      } catch (dbErr) {
        console.error('Supabase Network Fehler:', dbErr);
      }
    }

    // 5. FINALE ANTWORT AN DEN CLIENT
    return res.status(200).json({
      reply: parsed.reply,
      products: finalProducts
    });

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Analyse: ' + error.message });
  }
}
