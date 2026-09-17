export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  // Strikter System-Prompt für tagesaktuelle Modelle
  const systemPrompt = `Du bist "Kaufgeist", ein unabhängiger KI-Kaufberater auf Deutsch.
Sprich den Nutzer direkt an (Du-Form). Empfehle exakt 2 bis 3 AKTUELLE, derzeit im Handel erhältliche Produkte.

STRIKTE REGELN FÜR DIE PRODUKTAUSWAHL:
- Beziehe dich ausschließlich auf Produktgenerationen und Modelle, die aktuell auf dem deutschen Markt erhältlich sind (keine veralteten Vorgänger wie z. B. iPhone 11/12/13/14, alte Galaxy-S-Serien oder veraltete Laptop-Prozessoren).
- Wähle immer die neuesten Bestseller oder deren direkte Nachfolger.
- Erstelle für jedes Produkt ein "exactQuery"-Feld mit Marke + exakter aktueller Modellbezeichnung (z. B. "Apple iPhone 16 128GB" oder "DeLonghi Magnifica S ECAM 22.110.B"), damit die Live-Produktsuche das exakte Produkt auf Amazon findet.`;

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
            description: "Direkte Ansprache an den Nutzer (max. 3 Sätze)." 
          },
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
                exactQuery: { type: "string" }
              },
              required: ["name", "price", "rating", "pros", "cons", "exactQuery"],
              additionalProperties: false
            }
          }
        },
        required: ["reply", "products"],
        additionalProperties: false
      }
    }
  };

  try {
    const fullConversation = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // 1. ChatGPT-Abfrage mit niedriger Temperatur für faktengetreue/aktuelle Modelle
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: fullConversation,
        max_tokens: 800,
        temperature: 0.1, // Sehr niedriger Wert verhindert veraltete/erfundene Daten
        response_format: responseSchema
      })
    });

    const aiData = await aiResponse.json();
    
    if (aiData.error) {
      return res.status(500).json({ error: aiData.error.message || 'OpenAI API Fehler' });
    }

    const parsedData = JSON.parse(aiData.choices[0].message.content);

    // 2. Echtzeit-Ermittlung der Amazon-Direktlinks via RapidAPI
    const productsWithDirectLinks = await Promise.all(
      parsedData.products.map(async (product) => {
        try {
          if (!process.env.RAPIDAPI_KEY) {
            // Fallback auf Such-Link, falls der RAPIDAPI_KEY in Vercel noch nicht gesetzt ist
            return {
              ...product,
              directUrl: `https://www.amazon.de/s?k=${encodeURIComponent(product.exactQuery)}`
            };
          }

          const apiRes = await fetch(
            `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(product.exactQuery)}&country=DE`,
            {
              method: 'GET',
              headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
              }
            }
          );

          const searchData = await apiRes.json();
          const firstHit = searchData.data?.products?.[0];

          return {
            ...product,
            price: firstHit?.product_price || product.price,
            directUrl: firstHit?.product_url || `https://www.amazon.de/s?k=${encodeURIComponent(product.exactQuery)}`
          };
        } catch (e) {
          return {
            ...product,
            directUrl: `https://www.amazon.de/s?k=${encodeURIComponent(product.exactQuery)}`
          };
        }
      })
    );

    return res.status(200).json({
      reply: parsedData.reply,
      products: productsWithDirectLinks
    });

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der KI-Analyse: ' + error.message });
  }
}
