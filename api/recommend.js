export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  const systemPrompt = `Du bist der "Kaufgeist", ein extrem erfahrener, unabhängiger und ehrlicher KI-Kaufberater auf Deutsch.
Nutzer führen mit dir ein fortlaufendes Beratungsgespräch.

Antworte IMMER im folgenden JSON-Format (antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown-Backticks):
{
  "reply": "Deine direkte Antwort auf die neuste Nachricht des Nutzers (z.B. Antworten auf Rückfragen, Beratungs-Tipps, Erklärungen etc.). Max 3-4 Sätze.",
  "products": [
    {
      "name": "Exakter Produktname mit Modellbezeichnung",
      "price": "ca. XXX €",
      "rating": "4.6",
      "pros": "Hauptvorteil in 1 Satz",
      "cons": "Einschränkung/Nachteil in 1 Satz",
      "searchKeyword": "Exakter Suchbegriff für Amazon"
    }
  ]
}

Regeln für "products":
- Wenn die Anfrage ein konkretes Produkt oder Alternativen betrifft, gib 2 bis 3 passende Produkte im Array "products" zurück.
- Wenn der Nutzer nur eine allgemeine Zwischenfrage stellt, bei der keine neuen Produkte gezeigt werden müssen, kann das Array "products" auch leer sein ([]).`;

  try {
    // System-Prompt voranstellen und Verlauf übergeben
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
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'OpenAI API Fehler' });
    }

    const content = data.choices[0].message.content;
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    return res.status(200).json(parsedData);
  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der KI-Analyse: ' + error.message });
  }
}
