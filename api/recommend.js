export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  const systemPrompt = `Du bist "Kaufgeist", ein unabhängiger KI-Kaufberater auf Deutsch.
Deine Aufgabe ist es, für die Anfrage des Nutzers exakt 2 bis 3 real existierende Produkte zu empfehlen.
Verwende exakte Modellnamen und realistische Richtpreise für den deutschen Markt.`;

  // JSON-Schema für garantiertes Datenformat ohne Markdown-Fehler
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
            description: "Kurze Einschätzung/Antwort auf Deutsch (max. 3 Sätze)." 
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
                amazonQuery: { type: "string" }
              },
              required: ["name", "price", "rating", "pros", "cons", "amazonQuery"],
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: fullConversation,
        max_tokens: 700,
        temperature: 0.3,
        response_format: responseSchema
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'OpenAI API Fehler' });
    }

    const parsedData = JSON.parse(data.choices[0].message.content);
    return res.status(200).json(parsedData);
  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der KI-Analyse: ' + error.message });
  }
}
