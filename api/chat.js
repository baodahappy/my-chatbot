// api/chat.js
export default async function handler(req, res) {
  // 1. Get the message from the frontend
  const { history, message, model } = req.body;

  // 2. Get the API Key from the Environment (Server-side only)
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "API Key not configured on server" });
  }

  // 3. Construct the prompt for Gemini
  // We combine the system prompt/knowledge base (sent from frontend) with the user message
  const fullContext = `
    ${history[0]?.content || ""} 
    User Question: ${message}
  `;
  // Note: For a robust app, you should construct the history array properly here,
  // but for this simple proxy, we are passing the logic through.

  try {
    // 4. Call Google Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullContext }] }]
      })
    });

    const data = await response.json();

    // 5. Send the result back to the Frontend
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}