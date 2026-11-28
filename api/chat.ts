// Vercel serverless function: sends a question plus a data summary from the app
// to Google Gemini and returns the answer. The API key is read only from the
// GEMINI_API_KEY environment variable on Vercel, so it never reaches the browser.

const SYSTEM = `You are an operations research assistant for Deebtex, an Egyptian textile factory
that weaves fabric on looms (machines) in warps (one warp = one fabric + colour run on one machine).

You receive a DATA SNAPSHOT taken from the factory app right now, then the user's question.
Rules:
- Base every claim on the snapshot. If the snapshot does not contain what is needed, say so.
- Do the arithmetic carefully and show the key numbers you used.
- Give a clear recommendation first, then the reasons, then the risks or trade-offs.
- Keep answers short and practical. The user is the factory owner, so write plainly.
- Suggest options, never act on the factory. The owner makes the final decision.
- Reply in the language of the question (English or Arabic).`

type Turn = { role: "user" | "assistant"; text: string }

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" })
    return
  }

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.status(500).json({ error: "The assistant is not set up yet: GEMINI_API_KEY is missing on the server." })
    return
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body ?? {})
  const question = String(body.question ?? "").slice(0, 2000).trim()
  const summary = String(body.summary ?? "").slice(0, 60000)
  if (!question) {
    res.status(400).json({ error: "Empty question" })
    return
  }

  const history: Turn[] = Array.isArray(body.history)
    ? body.history.slice(-8).map((t: Turn) => ({
        role: t.role === "assistant" ? "assistant" : "user",
        text: String(t.text ?? "").slice(0, 4000),
      }))
    : []

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  const contents = [
    ...history.map(t => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.text }],
    })),
    {
      role: "user",
      parts: [{ text: `DATA SNAPSHOT (taken ${new Date().toISOString()}):\n${summary}\n\nQUESTION:\n${question}` }],
    },
  ]

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
    })
    const data: any = await r.json()
    if (!r.ok) {
      res.status(502).json({ error: data?.error?.message ?? "The AI service returned an error" })
      return
    }
    const answer: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("")
    res.status(200).json({ answer: answer || "The assistant returned no answer. Try asking again." })
  } catch {
    res.status(502).json({ error: "Could not reach the AI service. Try again in a minute." })
  }
}
