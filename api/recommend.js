export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};

  try {
    // 1. KI ermittelt die besten Suchbegriffe basierend auf dem Chatverlauf
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Analysiere den Nutzerwunsch und antworte im JSON-Format mit einer kurzen Begründung "reply" und einem präzisen Suchbegriff "searchQuery" für Elektronik/Produkte.' },
          ...messages
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiResponse.json();
    const { reply, searchQuery } = JSON.parse(aiData.choices[0].message.content);

    // 2. Live-Produktdaten über RapidAPI (Amazon Real-Time Data) abrufen
    const amazonApiRes = await fetch(`https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(searchQuery)}&country=DE`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
      }
    });

    const amazonData = await amazonApiRes.json();
    const rawProducts = amazonData.data?.products?.slice(0, 3) || [];

    // 3. Produktdaten für das Frontend aufbereiten
    const products = rawProducts.map(p => ({
      name: p.product_title,
      price: p.product_price || 'Preis k.A.',
      rating: p.product_star_rating || '4.5',
      pros: 'Aktuell auf Amazon verfügbar',
      cons: 'Verfügbarkeit prüfen',
      amazonUrl: p.product_url
    }));

    return res.status(200).json({ reply, products });

  } catch (error) {
    return res.status(500).json({ error: 'Fehler bei der Live-Produktsuche: ' + error.message });
  }
}
