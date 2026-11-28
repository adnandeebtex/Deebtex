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

  // Comma-separated list in GEMINI_MODELS on Vercel overrides this default order.
  const models = (process.env.GEMINI_MODELS || "gemini-3.8-flash,gemini-2.5-flash-lite,gemini-2.5-flash")
    .split(",").map(m => m.trim()).filter(Boolean)
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

  // Try each model in order. Move to the next one if it is missing, busy, or returns no real answer.
  const failures: string[] = []
  for (const model of models) {
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
      const data: any = await r.json().catch(() => ({}))
      if (!r.ok) {
        failures.push(`${model}: ${data?.error?.message ?? r.status}`)
        continue
      }
      const answer: string = (data?.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("")
        .trim()
      if (!answer || /high demand|no longer available/i.test(answer)) {
        failures.push(`${model}: busy or unavailable`)
        continue
      }
      res.status(200).json({ answer, model })
      return
    } catch {
      failures.push(`${model}: could not be reached`)
    }
  }
  res.status(503).json({
    error: "All AI models are busy or unavailable right now. Wait a few minutes and try again.",
    details: failures,
  })
}
