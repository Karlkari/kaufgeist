export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Nachrichtenverlauf fehlt' });
  }

  const systemPrompt = `Du bist der "Kaufgeist", ein extrem erfahrener, unabhängiger KI-Kaufberater auf Deutsch.
Deine Aufgabe ist es, für die Suchanfrage des Nutzers exakt 2 bis 3 real existierende, aktuell auf Amazon Deutschland erhältliche Produkte zu empfehlen.

WICHTIG FÜR PREISE UND MODELLNAMEN:
- Verwende ausschließlich exakte, real existierende Modellnamen (z. B. "Lenovo IdeaPad Slim 3 15IAH8" statt ungenauer Produktreihen).
- Gib realistische, tagesaktuelle Marktpreise für den deutschen Markt an.

Antworte IMMER im folgenden JSON-Format (antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Markdown-Backticks):
{
  "reply": "Deine kurze Antwort/Einschätzung auf die Nachricht des Nutzers (max. 3 Sätze).",
  "products": [
    {
      "name": "Exakter Modellname (z. B. Lenovo IdeaPad Slim 3 15IAH8)",
      "price": "ca. XXX €",
      "rating": "4.5",
      "pros": "Hauptvorteil in 1 Satz",
      "cons": "Einschränkung in 1 Satz",
      "amazonQuery": "Lenovo IdeaPad Slim 3 15IAH8 Laptop"
    }
  ]
}`;

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
        temperature: 0.3 // Niedrigere Temperature für präzisere Fakten & Preise
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
