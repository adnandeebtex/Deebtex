import { useEffect, useRef, useState } from "react"

// AI assistant panel. It sends your question plus a live data summary to /api/chat.
// Chat history lives only in this page; reloading starts a fresh conversation.

type Msg = { role: "user" | "assistant"; text: string }

// Light formatting for answers: headings, bullets, **bold**. No extra libraries.
function renderInline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

function renderBlocks(text: string) {
  return text.split("\n").map((raw, i) => {
    const line = raw.trimEnd()
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) return <div key={i} style={{ fontWeight: 700, marginTop: 8 }}>{renderInline(heading[1])}</div>
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
    if (bullet) return (
      <div key={i} style={{ display: "flex", gap: 8, paddingInlineStart: 4 }}>
        <span style={{ color: "#534AB7" }}>•</span>
        <span>{renderInline(bullet[1])}</span>
      </div>
    )
    return <div key={i}>{renderInline(line)}</div>
  })
}

function Bubble({ m }: { m: Msg }) {
  const isUser = m.role === "user"
  return (
    <div dir="auto" style={{
      alignSelf: isUser ? "flex-end" : "flex-start",
      maxWidth: isUser ? "80%" : "94%",
      padding: isUser ? "8px 12px" : "12px 14px",
      borderRadius: 12,
      background: isUser ? "#534AB7" : "#F7F6F3",
      color: isUser ? "#fff" : "#222",
      border: isUser ? "none" : "0.5px solid #ececec",
      fontSize: 14, lineHeight: 1.7, wordBreak: "break-word",
    }}>
      {renderBlocks(m.text)}
    </div>
  )
}

const STARTERS = [
  "Which warp group should run next on each machine, and why?",
  "Which late orders should I rescue first, and what's the fastest way to finish them?",
  "Where are we losing the most time?",
]

export default function AssistantView({ getSummary }: { getSummary: () => string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs, busy])

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history = msgs.slice(-8)
    setMsgs(p => [...p, { role: "user", text: question }])
    setInput("")
    setBusy(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, summary: getSummary(), history }),
      })
      const data = await res.json().catch(() => ({}))
      setMsgs(p => [...p, {
        role: "assistant",
        text: res.ok ? (data.answer ?? "No answer.") : `⚠️ ${data.error ?? "Something went wrong."}`,
      }])
    } catch {
      setMsgs(p => [...p, { role: "assistant", text: "⚠️ Could not reach the assistant. Check your connection." }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ maxWidth: 820, width: "100%", height: "100%", minHeight: 0, boxSizing: "border-box", margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>🤖 Operations assistant</div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
          Looks at your live orders, machines, warps and thread stock. Its suggestions are advice; you make the decisions.
        </div>
      </div>

      <div style={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, color: "#666" }}>Try one of these:</div>
            {STARTERS.map(s => (
              <button key={s} onClick={() => ask(s)} disabled={busy}
                style={{ textAlign: "start", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #c4c0f0", background: "#F3F2FD", color: "#534AB7", fontSize: 13, cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) => <Bubble key={i} m={m} />)}

        {busy && <div style={{ fontSize: 13, color: "#888" }}>Thinking…</div>}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input) } }}
          placeholder="Ask about orders, warps, machines, thread…"
          rows={2}
          dir="auto"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: "0.5px solid #d4d4d4", fontSize: 14, resize: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()}
          style={{ padding: "0 18px", borderRadius: 8, border: "none", background: "#534AB7", color: "#fff", fontSize: 14, cursor: "pointer", opacity: busy || !input.trim() ? 0.5 : 1 }}>
          Ask
        </button>
      </div>
    </div>
  )
}
