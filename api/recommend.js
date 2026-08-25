export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};

  if (!query) {
    return res.status(400).json({ error: 'Suchanfrage fehlt' });
  }

  const systemPrompt = `Du bist der "Kaufgeist", ein extrem erfahrener, unabhängiger und ehrlicher KI-Kaufberater auf Deutsch.
Deine Aufgabe ist es, für die Suchanfrage des Nutzers genau 2 bis 3 konkrete, real existierende Produktmodelle zu empfehlen.

Antworte im folgenden JSON-Format (antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown-Backticks):
{
  "analysis": "Eine kurze, professionelle Einschätzung (max. 3 Sätze), worauf man bei dieser Suche/Budget achten muss.",
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
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
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
