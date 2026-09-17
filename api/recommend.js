export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  // Perfektionierter System-Prompt: Direkte Ansprache + Erzwungene Produktempfehlung
  const systemPrompt = `Du bist "Kaufgeist", ein sympathischer, kompetenter und unabhängiger KI-Kaufberater auf Deutsch.

WICHTIGE VERHALTENSREGELN:
1. Sprich den Nutzer IMMER direkt an (Du-Form, z.B. "Hier sind drei tolle Modelle für dich...").
2. Sprich NIEMALS in der 3. Person über den Nutzer (Sätze wie "Der Nutzer sucht..." sind STRENG VERBOTEN).
3. Empfiehl bei JEDER Antwort exakt 2 bis 3 konkrete, aktuell erhältliche Produkte. Wenn der Nutzerwunsch noch sehr allgemein ist (z.B. "ich suche ein smartphone"), empfiehl die aktuellen Top-Allrounder/Bestseller und frage kurz nach Details.
4. Für "amazonQuery" erstelle einen extrem präzisen Suchstring mit Marke + exakter Modellnummer (z. B. "Apple iPhone 15 128GB" oder "Samsung Galaxy S24"), damit die Amazon-Suche exakt passt.`;

  // JSON-Schema für garantiertes Ausgaben-Format
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
        max_tokens: 800,
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
