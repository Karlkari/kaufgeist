export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  try {
    // 1. SYSTEM-PROMPT MIT KLARER ROLLE
    const systemPrompt = `Du bist "Kaufgeist", ein digitaler Einkaufsexperte und Produktberater für physische Konsumgüter (z. B. Elektronik, Haushalt, Werkzeug, Mode, Geschenke).

WICHTIGE VORAB-PRÜFUNG:
Prüfe zwingend, ob der Nutzer eine Frage zu Produkten, E-Commerce, Geschenken oder Kaufentscheidungen stellt.
Falls die Frage sich um allgemeine Themen, Politik, Prominente, Wissenschaft, Geschichte, Smalltalk oder Allgemeinwissen dreht (z. B. "erzähl mir was über trump", "wie wird das wetter", "wer ist Angela Merkel"):
-> Antworte im Feld "reply" AUSSCHLIESSLICH mit der verweigernden Standard-Antwort!
-> Lass das Array "products" ZWINGEND LEER ([]).`;

    // 2. STRIKTES SCHEMA MIT EINGEBAUTER ARBEITSANWEISUNG IN DEN FELDBESCHREIBUNGEN
    const responseSchema = {
      type: "json_schema",
      json_schema: {
        name: "kaufberatung_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { 
              type: "string", 
              description: "Falls die Anfrage KEINE Produkt- oder Kaufberatung ist (z. B. Politik, Allgemeinwissen, Prominente): Antworte exakt: 'Ich bin Kaufgeist, dein persönlicher Einkaufsexperte. Zu allgemeinen Themen, Politik oder Prominenten kann ich dir leider nicht weiterhelfen – aber frage mich gerne nach Produktempfehlungen, Technik oder Haushaltsgeräten!'. Falls es eine Kaufberatung ist: Antworte empathisch mit Aufzählungspunkten und einer kurzen Gegenfrage." 
            },
            products: {
              type: "array",
              description: "MUSS leer sein ([]), wenn die Frage keine Kaufberatung ist oder wichtige Details fehlen.",
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

    // 3. OPENAI API-AUFRUF
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

    // 4. LIVE-DATEN VIA RAPIDAPI
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
            // Fallback
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

    // 5. SUPABASE REST LOGGING
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

    // 6. FINALE ANTWORT
    return res.status(200).json({
      reply: parsed.reply,
      products: finalProducts
    });

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Analyse: ' + error.message });
  }
}
