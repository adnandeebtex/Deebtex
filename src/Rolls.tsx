// ============================================================
//  DEEBTEX — Rolls.tsx
//  Packs (barcode stickers) + shipment scanning for projects that
//  run outside the normal order system (e.g. hotel orders).
//  A PACK is what gets one sticker: normally one roll, or a
//  "mixed pack" of several small rolls wound together.
//  Tables: roll_projects, packs, rolls, shipments
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

// ─── TYPES ───────────────────────────────────────────────────
type Spec = { design: string; code: string; color: string }
type Line = Spec & { meters: number }
type Project = { id: number; name: string; customer: string; targets: Line[]; notes: string; closed: boolean }
type Pack = {
  id: number; projectId: number; packNo: number | null; barcode: string | null
  printed: boolean; voided: boolean; shipmentId: number | null; createdAt?: string
}
type Roll = Spec & { id: number; projectId: number; packId: number; batch: string; meters: number; createdAt?: string }
type Shipment = {
  id: number; projectId: number; number: number; date: string
  truck: string; driver: string; notes: string
  status: "open" | "closed"; plan: Line[]; closedAt?: string | null
}
type Tab = "packs" | "shipments" | "scan"
type TextileRef = { code: string; name: string; color: string }   // from the app's textiles database
type FamilyRef  = { base_code: string; name: string; name_en?: string }

// 1007/02/03 → base "1007", code "1007/02", color "03"; design = English name of base 1007
function specFromTextile(t: TextileRef, families: FamilyRef[]): Spec & { base: string; needsEn: boolean } {
  const parts = t.code.split("/").map(x => x.trim()).filter(Boolean)
  const base = parts[0] ?? t.code
  const en = families.find(f => f.base_code === base)?.name_en?.trim() || ""
  const code  = parts.length > 1 ? parts.slice(0, -1).join("/") : t.code
  const color = parts.length > 1 ? parts[parts.length - 1] : t.color
  return { design: en, code, color, base, needsEn: !en }
}

// html5-qrcode (loaded from CDN on first use, like the Excel reader)
type H5Scanner = {
  start: (cam: unknown, cfg: unknown, ok: (text: string) => void, err: () => void) => Promise<void>
  stop: () => Promise<void>
  clear: () => void
}
type H5Global = { Html5Qrcode: new (id: string, cfg: unknown) => H5Scanner; Html5QrcodeSupportedFormats: Record<string, number> }

// ─── SMALL HELPERS ───────────────────────────────────────────
let _seq = 0
function newId() { _seq = (_seq + 1) % 1000; return Date.now() * 1000 + _seq }
const norm  = (s: string) => String(s ?? "").trim().toLowerCase()
const keyOf = (s: Spec) => `${norm(s.design)}|${norm(s.code)}|${norm(s.color)}`
const specLabel = (s: Spec) => `${s.design}${s.code ? ` · ${s.code}` : ""}${s.color ? ` · color ${s.color}` : ""}`
const today = () => new Date().toISOString().slice(0, 10)
const fmtM  = (n: number) => `${Math.round(n * 100) / 100}`
const sumM  = (rs: Roll[]) => rs.reduce((a, r) => a + r.meters, 0)
// list update that can NEVER create two items with the same id
function putRows<T extends { id: number }>(list: T[], rows: T[], removeIds: number[] = []): T[] {
  const rm = new Set(removeIds)
  const m = new Map<number, T>()
  for (const x of list) if (!rm.has(x.id)) m.set(x.id, x)
  for (const r of rows) m.set(r.id, r)
  return [...m.values()]
}
const uniq = <T extends { id: number }>(list: T[]) => putRows([], list)
const esc   = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
function parseLines(v: unknown): Line[] {
  try {
    const a = typeof v === "string" ? JSON.parse(v) : v
    return Array.isArray(a) ? a.map(x => ({ design: String(x.design ?? ""), code: String(x.code ?? ""), color: String(x.color ?? ""), meters: Number(x.meters) || 0 })).filter(x => x.design) : []
  } catch { return [] }
}
const sanProject = (r: Record<string, unknown>): Project => ({ id: Number(r.id), name: String(r.name ?? ""), customer: String(r.customer ?? ""),
  targets: parseLines(r.targets), notes: String(r.notes ?? ""), closed: r.closed === true })
const sanPack = (r: Record<string, unknown>): Pack => ({ id: Number(r.id), projectId: Number(r.projectId),
  packNo: r.packNo != null ? Number(r.packNo) : null, barcode: r.barcode ? String(r.barcode) : null,
  printed: r.printed === true, voided: r.voided === true, shipmentId: r.shipmentId != null ? Number(r.shipmentId) : null,
  createdAt: r.createdAt ? String(r.createdAt) : undefined })
const sanRoll = (r: Record<string, unknown>): Roll => ({ id: Number(r.id), projectId: Number(r.projectId), packId: Number(r.packId),
  design: String(r.design ?? ""), code: String(r.code ?? ""), color: String(r.color ?? ""), batch: String(r.batch ?? ""),
  meters: Number(r.meters) || 0, createdAt: r.createdAt ? String(r.createdAt) : undefined })
const sanShipment = (r: Record<string, unknown>): Shipment => ({ id: Number(r.id), projectId: Number(r.projectId), number: Number(r.number) || 0,
  date: String(r.date ?? ""), truck: String(r.truck ?? ""), driver: String(r.driver ?? ""), notes: String(r.notes ?? ""),
  status: r.status === "closed" ? "closed" : "open", plan: parseLines(r.plan), closedAt: r.closedAt ? String(r.closedAt) : null })

// ─── CODE 128 BARCODE → SVG (numbers use set C = thicker bars) ─
const C128 = ["212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
"221312","231212","112232","122132","122231","113222","123122","123221","223211","221132","221231","213212",
"223112","312131","311222","321122","321221","312212","322112","322211","212123","212321","232121","111323",
"131123","131321","112313","132113","132311","211313","231113","231311","112133","112331","132131","113123",
"113321","133121","313121","211331","231131","213113","213311","213131","311123","311321","331121","312113",
"312311","332111","314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
"112412","122114","122411","142112","142211","241211","221114","413111","241112","134111","111242","121142",
"121241","114212","124112","124211","411212","421112","421211","212141","214121","412121","111143","111341",
"131141","114113","114311","411113","411311","113141","114131","311141","411131","211412","211214","211232",
"2331112"]
function code128Svg(text: string): string {
  const vals = /^\d+$/.test(text) && text.length % 2 === 0
    ? [105, ...text.match(/\d\d/g)!.map(Number)]
    : [104, ...[...text].map(ch => ch.charCodeAt(0) - 32).filter(v => v >= 0 && v < 96)]
  let sum = vals[0]
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i
  vals.push(sum % 103, 106)
  const quiet = 10
  let x = quiet, bars = ""
  for (const v of vals) {
    const w = C128[v]
    for (let i = 0; i < w.length; i++) {
      const n = Number(w[i])
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${n}" height="100"/>`
      x += n
    }
  }
  const total = x + quiet
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 100" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:100%;display:block"><rect width="${total}" height="100" fill="#fff"/><g fill="#000">${bars}</g></svg>`
}

// ─── PRINT HELPERS ───────────────────────────────────────────
function printPage(title: string, body: string, css: string) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,'Segoe UI',Tahoma,sans-serif;color:#000}
.bar{position:fixed;top:0;left:0;right:0;background:#534AB7;color:#fff;padding:10px 20px;display:flex;gap:14px;align-items:center;z-index:9;font:600 14px Arial}
.bar button{background:#fff;color:#534AB7;border:none;padding:6px 18px;border-radius:6px;font-weight:700;cursor:pointer}
.bar span.hint{font-weight:400;font-size:12px;opacity:.85}
.wrap{padding-top:56px}
@media print{.bar{display:none}.wrap{padding-top:0}}
${css}
</style></head><body>
<div class="bar"><span>${esc(title)}</span><button onclick="window.print()">🖨 Print / Save as PDF</button><span class="hint">In the print window choose "Save as PDF" to get a file</span></div>
<div class="wrap">${body}</div></body></html>`
}
// window must be opened directly in the click (otherwise the browser blocks the pop-up)
function openBlank(): Window | null {
  const w = window.open("", "_blank")
  if (!w) { alert("Please allow pop-ups for this site to print."); return null }
  w.document.write("<p style='font:14px Arial;padding:20px;color:#888'>Preparing…</p>")
  return w
}
function writeTo(w: Window, html: string) { w.document.open(); w.document.write(html); w.document.close(); w.focus() }

const AR_PACK = "رقم الطرد", AR_DESIGN = "الرسمة"
function stickerHtml(p: Pack, rs: Roll[], proj: Project) {
  const mixed = rs.length > 1
  const head = `<img class="logo" src="${LOGO}"/>
<div class="pack"><div class="k">PACK NO. · ${AR_PACK}</div><div class="n">${p.packNo ?? ""}</div>${mixed ? `<div class="mx">MIXED PACK · ${rs.length} PIECES · طرد مجمع</div>` : ""}</div>`
  let mid: string
  if (!mixed) {
    const r = rs[0]
    mid = `<div class="f"><div class="k">DESIGN · ${AR_DESIGN}</div><div class="big" dir="auto">${esc(r.design)}</div></div>
<div class="grid">
 <div><div class="k">CODE · الكود</div><div class="v" dir="auto">${esc(r.code || "—")}</div></div>
 <div><div class="k">COLOR · اللون</div><div class="v" dir="auto">${esc(r.color || "—")}</div></div>
 <div><div class="k">BATCH · التشغيلة</div><div class="v" dir="auto">${esc(r.batch || "—")}</div></div>
 <div><div class="k">METERS · الأمتار</div><div class="m">${fmtM(r.meters)}<small> m</small></div></div>
</div>`
  } else {
    const f = Math.min(1, 6 / rs.length)      // shrink text when many pieces
    mid = `<table class="it" style="font-size:${(2.15 * f).toFixed(2)}mm"><tr><th>DESIGN</th><th>CODE</th><th>COL</th><th>BATCH</th><th class="r">M</th></tr>
${rs.map(r => `<tr><td dir="auto">${esc(r.design)}</td><td>${esc(r.code)}</td><td>${esc(r.color)}</td><td>${esc(r.batch)}</td><td class="r">${fmtM(r.meters)}</td></tr>`).join("")}
<tr class="tot"><td colspan="4">TOTAL · الإجمالي</td><td class="r">${fmtM(sumM(rs))}&nbsp;m</td></tr></table>`
  }
  return `<div class="lbl">${head}${mid}
<div class="f"><div class="k">CUSTOMER · العميل</div><div class="cu" dir="auto">${esc(proj.customer || proj.name)}</div></div>
<div class="sp"></div>
<div class="bc">${code128Svg(p.barcode ?? "")}</div><div class="code">${esc(p.barcode ?? "")}</div>
<div class="made">MADE IN EGYPT · صنع في مصر</div>
<div class="web">www.deebtex.com</div></div>`
}
function stickerCss(w: number, h: number) {
  const u = Math.min(w / 50, h / 100)     // designed at 50 × 100 mm, scales to other sizes
  const mm = (n: number) => `${(n * u).toFixed(2)}mm`
  return `
@page{size:${w}mm ${h}mm;margin:0}
body{background:#e9e9ef}
.wrap{display:flex;flex-wrap:wrap;gap:8mm;justify-content:center;padding:66px 8mm 8mm}
.lbl{width:${w}mm;height:${h}mm;background:#fff;padding:${mm(3)} ${mm(3)} ${mm(2.2)};display:flex;flex-direction:column;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.15)}
@media print{body{background:#fff}.wrap{display:block;padding:0}.lbl{box-shadow:none;page-break-after:always;break-after:page}}
.k{font-size:${mm(1.75)};font-weight:700;letter-spacing:.15mm;text-transform:uppercase}
.logo{display:block;width:${mm(34)};margin:0 auto ${mm(2)}}
.pack{border:${mm(.55)} solid #000;border-radius:${mm(1.4)};text-align:center;padding:${mm(1)} 0 ${mm(1.2)}}
.pack .n{font-size:${mm(11)};font-weight:900;line-height:1}
.pack .mx{font-size:${mm(1.9)};font-weight:700;margin-top:${mm(.5)}}
.f{margin-top:${mm(1.8)}}
.big{font-size:${mm(5.4)};font-weight:800;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v{font-size:${mm(3.6)};font-weight:800;line-height:1.15;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:${mm(1.6)} ${mm(2)};margin-top:${mm(1.8)};padding-top:${mm(1.6)};border-top:${mm(.3)} solid #000}
.m{font-size:${mm(7)};font-weight:900;line-height:1}.m small{font-size:${mm(3)}}
.cu{font-size:${mm(2.7)};font-weight:700;line-height:1.2}
.sp{flex:1}
.bc{height:${mm(11)};margin-top:${mm(1.5)}}
.code{text-align:center;font:700 ${mm(2.3)} 'Courier New',monospace;letter-spacing:${mm(.6)};margin-top:${mm(.4)}}
.made{margin-top:${mm(1.2)};background:#000;color:#fff;text-align:center;font-size:${mm(2.15)};font-weight:700;letter-spacing:.2mm;padding:${mm(.8)} 0;border-radius:${mm(.6)};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.web{text-align:center;font-size:${mm(2.5)};font-weight:700;margin-top:${mm(.9)};letter-spacing:.15mm}
table.it{width:100%;border-collapse:collapse;margin-top:${mm(1.8)};table-layout:auto}
.it th{font-size:${mm(1.55)};text-align:left;border-bottom:${mm(.35)} solid #000;padding:${mm(.5)} ${mm(.3)};font-weight:800}
.it td{padding:.6em .25em;border-bottom:${mm(.15)} solid #999;font-weight:600;white-space:nowrap;max-width:${mm(16)};overflow:hidden;text-overflow:ellipsis}
.it .r{text-align:right}
.it tr.tot td{max-width:none;border-top:${mm(.45)} solid #000;border-bottom:none;font-weight:900;font-size:1.3em;padding-top:.5em}
`
}

// ─── COMPONENT ───────────────────────────────────────────────
export default function RollsView({ db, textiles = [], families = [], saveEnglishName }: {
  db: SupabaseClient; textiles?: TextileRef[]; families?: FamilyRef[]
  saveEnglishName?: (base: string, arabicName: string, nameEn: string) => Promise<boolean>
}) {
  const [projects,  setProjects]  = useState<Project[]>([])
  const [packs,     setPacks]     = useState<Pack[]>([])
  const [rolls,     setRolls]     = useState<Roll[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading,   setLoading]   = useState(true)
  const [err,       setErr]       = useState("")
  const [pid,       setPid]       = useState<number | null>(() => {
    try { const v = localStorage.getItem("dtx_roll_project"); return v ? Number(v) : null } catch { return null }
  })
  const [tab, setTab] = useState<Tab>(() => (window.innerWidth < 768 ? "scan" : "packs"))

  // forms
  const [projForm, setProjForm] = useState<Project | null>(null)
  const [shipForm, setShipForm] = useState<Shipment | null>(null)
  const [editRoll, setEditRoll] = useState<Roll | null>(null)
  const [mixPick,  setMixPick]  = useState<Set<number> | null>(null)   // "Create pack" picker
  const [spec,     setSpec]     = useState<Spec & { batch: string }>({ design: "", code: "", color: "", batch: "" })
  const [rMeters,  setRMeters]  = useState("")
  const [rBulk,    setRBulk]    = useState("")
  const [sel,      setSel]      = useState<Set<number>>(new Set())
  const [filter,   setFilter]   = useState("")
  const [texQ,     setTexQ]     = useState("")
  const [enAsk,    setEnAsk]    = useState<{ base: string; arabic: string; value: string } | null>(null)
  const [lblW, setLblW] = useState(() => { try { return Number(localStorage.getItem("dtx_pack_lbl_w")) || 50 } catch { return 50 } })
  const [lblH, setLblH] = useState(() => { try { return Number(localStorage.getItem("dtx_pack_lbl_h")) || 100 } catch { return 100 } })

  // scanning
  const [scanShipId, setScanShipId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string; t: number } | null>(null)
  const [manual,   setManual]   = useState("")
  const [camOn,    setCamOn]    = useState(false)
  const [camErr,   setCamErr]   = useState("")
  const [undoStack, setUndoStack] = useState<number[]>([])
  const scannerRef = useRef<H5Scanner | null>(null)
  const lastScan   = useRef<{ code: string; t: number }>({ code: "", t: 0 })
  const live       = useRef<{ packs: Pack[]; rolls: Roll[]; shipments: Shipment[]; scanShipId: number | null }>({ packs, rolls, shipments, scanShipId })

  useEffect(() => { try { if (pid) localStorage.setItem("dtx_roll_project", String(pid)) } catch { /* ignore */ } }, [pid])
  useEffect(() => { try { localStorage.setItem("dtx_pack_lbl_w", String(lblW)); localStorage.setItem("dtx_pack_lbl_h", String(lblH)) } catch { /* ignore */ } }, [lblW, lblH])

  // ── LOAD + REALTIME ──
  useEffect(() => {
    async function loadAll<T>(table: string, san: (r: Record<string, unknown>) => T): Promise<T[]> {
      const out: T[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select("*").order("id").range(from, from + 999)
        if (error) { setErr(`Couldn't load ${table}: ${error.message}`); break }
        if (!data?.length) break
        out.push(...(data as Record<string, unknown>[]).map(san))
        if (data.length < 1000) break
      }
      return out
    }
    ;(async () => {
      const [p, k, r, s] = await Promise.all([loadAll("roll_projects", sanProject), loadAll("packs", sanPack),
        loadAll("rolls", sanRoll), loadAll("shipments", sanShipment)])
      setProjects(uniq(p)); setPacks(uniq(k)); setRolls(uniq(r)); setShipments(uniq(s)); setLoading(false)
    })()
    function merge<T extends { id: number }>(set: React.Dispatch<React.SetStateAction<T[]>>, san: (r: Record<string, unknown>) => T) {
      return (payload: { eventType: string; new: unknown; old: unknown }) => {
        if (payload.eventType === "DELETE") {
          const id = Number((payload.old as Record<string, unknown>).id)
          set(p => putRows(p, [], [id])); return
        }
        const row = san(payload.new as Record<string, unknown>)
        set(p => putRows(p, [row]))
      }
    }
    const ch = db.channel("deebtex-packs")
      .on("postgres_changes", { event: "*", schema: "public", table: "roll_projects" }, merge(setProjects, sanProject))
      .on("postgres_changes", { event: "*", schema: "public", table: "packs" },         merge(setPacks, sanPack))
      .on("postgres_changes", { event: "*", schema: "public", table: "rolls" },         merge(setRolls, sanRoll))
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" },     merge(setShipments, sanShipment))
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [db])
  useEffect(() => () => { stopCam() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── ONE ACTION AT A TIME (a second click while saving is ignored) ──
  const busy = useRef(false)
  const [working, setWorking] = useState(false)
  function once<A extends unknown[]>(fn: (...a: A) => Promise<unknown>) {
    return async (...a: A) => {
      if (busy.current) return
      busy.current = true; setWorking(true)
      try { await fn(...a) } finally { busy.current = false; setWorking(false) }
    }
  }

  // ── DB WRITES (errors are shown, never silent) ──
  async function run(p: PromiseLike<{ error: { message: string } | null }>, what: string): Promise<boolean> {
    const { error } = await p
    if (error) { setErr(`${what} failed: ${error.message} — check your internet and try again.`); return false }
    return true
  }
  const save = (table: string, row: object) => run(db.from(table).upsert(row as Record<string, unknown>, { onConflict: "id" }), `Saving ${table}`)

  // ── DERIVED ──
  const project = projects.find(p => p.id === pid) ?? null
  const pPacks  = useMemo(() => packs.filter(k => k.projectId === pid), [packs, pid])
  const pRolls  = useMemo(() => rolls.filter(r => r.projectId === pid), [rolls, pid])
  const pShips  = useMemo(() => shipments.filter(s => s.projectId === pid).sort((a, b) => a.number - b.number), [shipments, pid])
  const byPack  = useMemo(() => {
    const m = new Map<number, Roll[]>()
    for (const r of rolls) { if (!m.has(r.packId)) m.set(r.packId, []); m.get(r.packId)!.push(r) }
    for (const list of m.values()) list.sort((a, b) => a.id - b.id)
    return m
  }, [rolls])
  const rollsOf = (k: Pack) => byPack.get(k.id) ?? []
  const packOrder = (a: Pack, b: Pack) =>
    (a.packNo ?? 1e9) - (b.packNo ?? 1e9) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.id - b.id
  const sortedPacks = [...pPacks].sort(packOrder)

  // order lines (from the project + anything added that isn't in it)
  const specs = useMemo(() => {
    const m = new Map<string, Spec>()
    for (const t of project?.targets ?? []) m.set(keyOf(t), { design: t.design, code: t.code, color: t.color })
    for (const r of pRolls) if (!m.has(keyOf(r))) m.set(keyOf(r), { design: r.design, code: r.code, color: r.color })
    return [...m.values()]
  }, [project, pRolls])
  const packOf = useMemo(() => new Map(packs.map(k => [k.id, k])), [packs])
  const prog = specs.map(s => {
    const ordered = project?.targets.find(t => keyOf(t) === keyOf(s))?.meters ?? 0
    const rs = pRolls.filter(r => keyOf(r) === keyOf(s) && !packOf.get(r.packId)?.voided)
    return { ...s, ordered, made: sumM(rs), shipped: sumM(rs.filter(r => packOf.get(r.packId)?.shipmentId != null)) }
  })

  // ── PROJECTS ──
  const blankLine = (): Line => ({ design: "", code: "", color: "", meters: 0 })
  const saveProject = once(async function saveProject() {
    if (!projForm || !projForm.name.trim()) return
    const row: Project = { ...projForm, id: projForm.id || newId(),
      targets: projForm.targets.filter(t => t.design.trim()).map(t => ({ design: t.design.trim(), code: t.code.trim(), color: t.color.trim(), meters: Number(t.meters) || 0 })) }
    if (await save("roll_projects", row)) {
      setProjects(p => putRows(p, [row]))
      setPid(row.id); setProjForm(null); setEnAsk(null)
    }
  })
  const deleteProject = once(async function deleteProject(p: Project) {
    const nK = packs.filter(k => k.projectId === p.id).length
    const nS = shipments.filter(s => s.projectId === p.id).length
    if (nK || nS) { alert(`"${p.name}" has ${nK} packs and ${nS} shipments.\nDelete those first — a project with packs can't be deleted.`); return }
    if (!window.confirm(`Delete project "${p.name}"?\n\nThis cannot be undone.`)) return
    if (await run(db.from("roll_projects").delete().eq("id", p.id), "Delete")) { setProjects(x => x.filter(y => y.id !== p.id)); setPid(null) }
  })

  // ── ADD ROLLS (each roll starts as its own pack) ──
  const addRolls = once(async function addRolls(metersList: number[]) {
    if (!project) return
    if (!spec.design.trim()) { setErr("Pick or type the design first."); return }
    const good = metersList.filter(m => m > 0)
    if (!good.length) return
    const now = Date.now()
    const newPacks: Pack[] = [], newRolls: Roll[] = []
    good.forEach((m, i) => {
      const k: Pack = { id: newId(), projectId: project.id, packNo: null, barcode: null, printed: false, voided: false, shipmentId: null,
        createdAt: new Date(now + i).toISOString() }
      newPacks.push(k)
      newRolls.push({ id: newId(), projectId: project.id, packId: k.id, design: spec.design.trim(), code: spec.code.trim(),
        color: spec.color.trim(), batch: spec.batch.trim(), meters: m })
    })
    if (!await run(db.from("packs").insert(newPacks), "Adding packs")) return
    if (!await run(db.from("rolls").insert(newRolls), "Adding rolls")) { await db.from("packs").delete().in("id", newPacks.map(k => k.id)); return }
    setPacks(p => putRows(p, newPacks))
    setRolls(p => putRows(p, newRolls))
    setRMeters(""); setRBulk(""); setErr("")
  })

  // ── MIXED PACKS ──
  const canMix = (k: Pack) => !k.printed && k.packNo == null && !k.voided && k.shipmentId == null && rollsOf(k).length === 1
  const createMixed = once(async function createMixed(ids: number[]) {
    if (!project || ids.length < 2) return
    if (ids.some(id => { const k = packs.find(x => x.id === id); return !k || !canMix(k) })) { setMixPick(null); return }
    const k: Pack = { id: newId(), projectId: project.id, packNo: null, barcode: null, printed: false, voided: false, shipmentId: null,
      createdAt: new Date().toISOString() }
    if (!await run(db.from("packs").insert(k), "Creating pack")) return
    if (!await run(db.from("rolls").update({ packId: k.id }).in("packId", ids), "Moving rolls")) return
    await run(db.from("packs").delete().in("id", ids), "Cleaning up")
    setPacks(p => putRows(p, [k], ids))
    setRolls(p => p.map(r => ids.includes(r.packId) ? { ...r, packId: k.id } : r))
    setMixPick(null)
  })
  const unpack = once(async function unpack(k: Pack) {
    if (k.printed || k.packNo != null) { alert(`Pack ${k.packNo} already has a printed sticker.\nCancel it instead (⛔), then pack the rolls again.`); return }
    if (!window.confirm("Split this mixed pack back into separate rolls?")) return
    if (!packs.some(x => x.id === k.id)) return
    const rs = rollsOf(k)
    if (rs.length < 2) return
    const singles: Pack[] = rs.map((_, i) => ({ id: newId(), projectId: k.projectId, packNo: null, barcode: null, printed: false, voided: false,
      shipmentId: null, createdAt: new Date(Date.now() + i).toISOString() }))
    if (!await run(db.from("packs").insert(singles), "Unpacking")) return
    for (let i = 0; i < rs.length; i++) await run(db.from("rolls").update({ packId: singles[i].id }).eq("id", rs[i].id), "Unpacking")
    await run(db.from("packs").delete().eq("id", k.id), "Unpacking")
    setPacks(p => putRows(p, singles, [k.id]))
    setRolls(p => p.map(r => { const i = rs.findIndex(x => x.id === r.id); return i >= 0 ? { ...r, packId: singles[i].id } : r }))
  })

  // ── EDIT / CANCEL / DELETE ──
  const saveEditRoll = once(async function saveEditRoll() {
    if (!editRoll) return
    const row = { ...editRoll, design: editRoll.design.trim(), code: editRoll.code.trim(), color: editRoll.color.trim(), batch: editRoll.batch.trim() }
    if (!await save("rolls", row)) return
    setRolls(p => p.map(x => x.id === row.id ? row : x))
    const k = packOf.get(row.packId)
    if (k?.printed) {   // sticker is now out of date → reprint (same number & barcode)
      await run(db.from("packs").update({ printed: false }).eq("id", k.id), "Saving")
      setPacks(p => p.map(x => x.id === k.id ? { ...x, printed: false } : x))
    }
    setEditRoll(null)
  })
  const toggleVoid = once(async function toggleVoid(k: Pack) {
    if (k.shipmentId != null) { alert("This pack is already loaded in a shipment. Remove it from the shipment first."); return }
    if (!k.voided && !window.confirm(`Cancel pack ${k.packNo ?? "(not printed)"} — ${fmtM(sumM(rollsOf(k)))}m?\n\nIts sticker will be refused when scanned. You can bring it back later.`)) return
    if (await run(db.from("packs").update({ voided: !k.voided }).eq("id", k.id), "Saving")) setPacks(p => p.map(x => x.id === k.id ? { ...x, voided: !k.voided } : x))
  })
  const deletePack = once(async function deletePack(k: Pack) {
    if (k.shipmentId != null) { alert("This pack is loaded in a shipment — remove it from the shipment first."); return }
    const rs = rollsOf(k)
    const warn = k.packNo != null ? `\n\n⚠️ A sticker was already printed for pack ${k.packNo}. If it's stuck on a roll, use "Cancel" (⛔) instead, so it gets refused when scanned.` : ""
    if (!window.confirm(`Delete ${rs.length > 1 ? `mixed pack (${rs.length} rolls)` : `roll ${rs[0] ? specLabel(rs[0]) : ""}`} · ${fmtM(sumM(rs))}m?${warn}\n\nThis cannot be undone.`)) return
    if (!await run(db.from("rolls").delete().eq("packId", k.id), "Delete")) return
    if (!await run(db.from("packs").delete().eq("id", k.id), "Delete")) return
    setRolls(p => p.filter(r => r.packId !== k.id)); setPacks(p => p.filter(x => x.id !== k.id))
    setSel(s => { const n = new Set(s); n.delete(k.id); return n })
  })

  // ── PRINT (pack numbers + barcodes are given here, in order) ──
  const printPacks = once(async function printPacks(list: Pack[]) {
    if (!project) return
    const todo = list.filter(k => !k.voided && rollsOf(k).length).sort(packOrder)
    if (!todo.length) return
    const w = openBlank(); if (!w) return
    let nextNo = pPacks.reduce((m, k) => Math.max(m, k.packNo ?? 0), 0) + 1
    let nextBc = packs.reduce((m, k) => Math.max(m, Number(k.barcode) || 0), 0) + 1
    const ready: Pack[] = []
    for (const k of todo) {
      const upd: Pack = k.packNo != null && k.barcode ? { ...k, printed: true }
        : { ...k, packNo: nextNo++, barcode: String(nextBc++).padStart(8, "0"), printed: true }
      if (!await run(db.from("packs").update({ packNo: upd.packNo, barcode: upd.barcode, printed: true }).eq("id", k.id), "Numbering packs")) { w.close(); return }
      ready.push(upd)
    }
    setPacks(p => p.map(x => ready.find(r => r.id === x.id) ?? x))
    writeTo(w, printPage(`Stickers — ${project.name} (${ready.length})`,
      ready.map(k => stickerHtml(k, rollsOf(k), project)).join(""), stickerCss(lblW, lblH)))
  })

  // ── SHIPMENTS ──
  function newShipmentDraft(): Shipment {
    const plan = prog.map(x => ({ design: x.design, code: x.code, color: x.color, meters: Math.max(0, x.ordered - x.shipped) })).filter(x => x.meters > 0)
    return { id: 0, projectId: pid ?? 0, number: pShips.reduce((m, s) => Math.max(m, s.number), 0) + 1,
      date: today(), truck: "", driver: "", notes: "", status: "open", plan }
  }
  const saveShipment = once(async function saveShipment() {
    if (!shipForm || !pid) return
    const row: Shipment = { ...shipForm, id: shipForm.id || newId(), projectId: pid,
      plan: shipForm.plan.filter(l => l.design.trim()).map(l => ({ design: l.design.trim(), code: l.code.trim(), color: l.color.trim(), meters: Number(l.meters) || 0 })) }
    if (await save("shipments", row)) {
      setShipments(p => putRows(p, [row]))
      if (!shipForm.id) { setScanShipId(row.id); setTab("scan") }
      setShipForm(null)
    }
  })
  const deleteShipment = once(async function deleteShipment(s: Shipment) {
    const n = packs.filter(k => k.shipmentId === s.id).length
    if (n) { alert(`Shipment ${s.number} has ${n} packs loaded. Remove them first (or keep the shipment).`); return }
    if (!window.confirm(`Delete empty shipment ${s.number} (${s.date})?\n\nThis cannot be undone.`)) return
    if (await run(db.from("shipments").delete().eq("id", s.id), "Delete")) setShipments(p => p.filter(x => x.id !== s.id))
  })
  function shipStats(s: Shipment) {
    const sp = packs.filter(k => k.shipmentId === s.id).sort(packOrder)
    const rs = sp.flatMap(k => rollsOf(k))
    const m = new Map<string, Spec>()
    for (const l of s.plan) m.set(keyOf(l), l)
    for (const r of rs) if (!m.has(keyOf(r))) m.set(keyOf(r), r)
    const lines = [...m.values()].map(x => {
      const rr = rs.filter(r => keyOf(r) === keyOf(x))
      return { design: x.design, code: x.code, color: x.color,
        plan: s.plan.find(l => keyOf(l) === keyOf(x))?.meters ?? 0,
        loaded: sumM(rr), packs: new Set(rr.map(r => r.packId)).size }
    })
    return { packs: sp, rolls: rs, lines, meters: sumM(rs) }
  }
  const setShipStatus = once(async function setShipStatus(s: Shipment, status: "open" | "closed") {
    if (status === "closed") {
      const st = shipStats(s)
      const short = st.lines.filter(l => l.plan > 0 && l.loaded < l.plan)
      const msg = short.length
        ? `⚠️ Less than planned is loaded:\n${short.map(l => `• ${specLabel(l)}: ${fmtM(l.loaded)} / ${fmtM(l.plan)}m`).join("\n")}\n\nClose shipment ${s.number} anyway?`
        : `Close shipment ${s.number}? (${st.packs.length} packs · ${fmtM(st.meters)}m)`
      if (!window.confirm(msg)) return
    }
    const row = { ...s, status, closedAt: status === "closed" ? new Date().toISOString() : null }
    if (await save("shipments", row)) setShipments(p => p.map(x => x.id === s.id ? row : x))
  })

  // ── SCANNING ──
  function beep(ok: boolean) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC(); const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = ok ? 1250 : 220; o.type = ok ? "sine" : "square"
      g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination); o.start()
      o.stop(ctx.currentTime + (ok ? 0.12 : 0.45))
    } catch { /* no audio */ }
    try { navigator.vibrate?.(ok ? 80 : [200, 80, 200]) } catch { /* ignore */ }
  }
  function say(ok: boolean, msg: string) { setFeedback({ ok, msg, t: Date.now() }); beep(ok) }
  function packText(k: Pack, rs: Roll[]) {
    return rs.length > 1 ? `Pack ${k.packNo} · mixed ${rs.length} pieces · ${fmtM(sumM(rs))}m` : `Pack ${k.packNo} · ${rs[0] ? specLabel(rs[0]) : ""} · ${fmtM(sumM(rs))}m`
  }

  async function processCode(raw: string) {
    const code = raw.trim().replace(/\s+/g, "")
    if (!code) return
    const now = Date.now()
    if (code === lastScan.current.code && now - lastScan.current.t < 2500) return   // camera sees the same sticker many times
    lastScan.current = { code, t: now }
    const { packs: K, rolls: R, shipments: SH, scanShipId: sid } = live.current
    const ship = SH.find(s => s.id === sid)
    if (!ship) return say(false, "Pick or create a shipment first")
    if (ship.status === "closed") return say(false, `Shipment ${ship.number} is closed — reopen it to add packs`)
    const k = K.find(x => x.barcode === code)
    if (!k) return say(false, `Unknown sticker: ${code}`)
    const rs = R.filter(r => r.packId === k.id)
    if (k.projectId !== ship.projectId) {
      const other = projects.find(p => p.id === k.projectId)
      return say(false, `This pack belongs to another project${other ? ` (${other.name})` : ""} — don't load it`)
    }
    if (k.voided) return say(false, `Pack ${k.packNo} was CANCELLED — don't load it`)
    if (k.shipmentId === ship.id) return say(false, `Already scanned: pack ${k.packNo}`)
    if (k.shipmentId != null) return say(false, `Pack ${k.packNo} was already shipped in shipment ${SH.find(s => s.id === k.shipmentId)?.number ?? "?"}`)
    setPacks(p => p.map(x => x.id === k.id ? { ...x, shipmentId: ship.id } : x))
    const { error } = await db.from("packs").update({ shipmentId: ship.id }).eq("id", k.id)
    if (error) {
      setPacks(p => p.map(x => x.id === k.id ? k : x))
      return say(false, `Not saved — check internet. (${error.message})`)
    }
    setUndoStack(u => [...u, k.id])
    say(true, `✓ ${packText(k, rs)}`)
  }
  async function unload(k: Pack) {
    setPacks(p => p.map(x => x.id === k.id ? { ...x, shipmentId: null } : x))
    const { error } = await db.from("packs").update({ shipmentId: null }).eq("id", k.id)
    if (error) { setPacks(p => p.map(x => x.id === k.id ? k : x)); setErr(`Couldn't remove: ${error.message}`); return }
    setUndoStack(u => u.filter(id => id !== k.id))
    lastScan.current = { code: "", t: 0 }
  }
  const undoLast = once(async function undoLast() {
    const id = undoStack[undoStack.length - 1]
    const k = packs.find(x => x.id === id)
    if (k && k.shipmentId != null) { await unload(k); say(true, `↩ Removed pack ${k.packNo} from the truck`) }
    else setUndoStack(u => u.slice(0, -1))
  })
  async function loadLib(): Promise<H5Global> {
    const w = window as unknown as H5Global
    if (!w.Html5Qrcode) {
      await new Promise<void>((res, rej) => {
        const s = document.createElement("script")
        s.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't load the camera scanner — check internet"))
        document.head.appendChild(s)
      })
    }
    return window as unknown as H5Global
  }
  async function startCam() {
    setCamErr("")
    try {
      const lib = await loadLib()
      const F = lib.Html5QrcodeSupportedFormats
      const sc = new lib.Html5Qrcode("dtx-reader", { formatsToSupport: [F.CODE_128], verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true } })
      scannerRef.current = sc
      await sc.start({ facingMode: "environment" },
        { fps: 12, qrbox: (vw: number, vh: number) => ({ width: Math.floor(vw * 0.9), height: Math.floor(Math.min(vh * 0.45, vw * 0.35)) }) },
        (text: string) => { processCode(text) }, () => { /* no code in frame */ })
      setCamOn(true)
    } catch (e) {
      scannerRef.current = null
      const m = e instanceof Error ? e.message : String(e)
      setCamErr(/permission|notallowed/i.test(m)
        ? "Camera permission was refused. Allow camera access for this site in the browser settings, then try again."
        : `Camera couldn't start: ${m}`)
    }
  }
  async function stopCam() {
    const sc = scannerRef.current
    scannerRef.current = null; setCamOn(false)
    if (sc) { try { await sc.stop(); sc.clear() } catch { /* already stopped */ } }
  }

  // ── PACKING LIST ──
  function exportPackingList(s: Shipment) {
    const w = openBlank(); if (!w || !project) return
    const st = shipStats(s)
    const body = st.packs.map(k => {
      const rs = rollsOf(k), mixed = rs.length > 1
      const rows = rs.map((r, i) => `<tr class="${i === 0 ? "first" : ""}">${i === 0
        ? `<td rowspan="${rs.length + (mixed ? 1 : 0)}" class="pn">${k.packNo ?? "—"}${mixed ? "<div class=mxt>mixed</div>" : ""}</td>` : ""}
<td dir="auto">${esc(r.design)}</td><td>${esc(r.code)}</td><td>${esc(r.color)}</td><td class="num">${fmtM(r.meters)}</td></tr>`).join("")
      return rows + (mixed ? `<tr class="ptot"><td colspan="3">Pack ${k.packNo} total · إجمالي الطرد</td><td class="num">${fmtM(sumM(rs))}</td></tr>` : "")
    }).join("")
    const summary = st.lines.filter(l => l.loaded > 0).map(l => `<tr><td dir="auto">${esc(l.design)}</td><td>${esc(l.code)}</td><td>${esc(l.color)}</td><td class="num">${fmtM(l.loaded)} m</td><td class="num">${l.packs}</td></tr>`).join("")
    writeTo(w, printPage(`Packing List — Shipment ${s.number}`, `<div class="page">
<div class="hd"><img class="lg" src="${LOGO}"/><div class="tt"><div class="en">PACKING LIST</div><div class="ar">قائمة التعبئة</div></div></div>
<div class="meta">
<div><div class="k">SHIPMENT NO. · رقم الشحنة</div><div class="v">${s.number}</div></div>
<div><div class="k">DATE · التاريخ</div><div class="v">${esc(s.date)}</div></div>
<div><div class="k">CUSTOMER · العميل</div><div class="v" dir="auto">${esc(project.customer || "—")}</div></div>
<div><div class="k">TRUCK NO. · رقم السيارة</div><div class="v" dir="auto">${esc(s.truck || "—")}</div></div>
<div><div class="k">DRIVER · السائق</div><div class="v" dir="auto">${esc(s.driver || "—")}</div></div>
</div>
<h2>PACKS · الطرود</h2>
<table><tr><th style="text-align:center">PACK NO. · ${AR_PACK}</th><th>DESIGN · ${AR_DESIGN}</th><th>CODE · الكود</th><th>COLOR · اللون</th><th class="num">METERS · الأمتار</th></tr>
${body || `<tr><td colspan="5" style="text-align:center;color:#888;padding:20px">No packs scanned yet</td></tr>`}</table>
<div class="sum"><h2>SUMMARY · الملخص</h2>
<table><tr><th>DESIGN · ${AR_DESIGN}</th><th>CODE · الكود</th><th>COLOR · اللون</th><th class="num">TOTAL METERS · إجمالي الأمتار</th><th class="num">PACKS · عدد الطرود</th></tr>
${summary}
<tr class="gt"><td colspan="3">GRAND TOTAL · الإجمالي الكلي</td><td class="num">${fmtM(st.meters)} m</td><td class="num">${st.packs.length} packs</td></tr></table></div>
<div class="sig"><div><div class="ln"></div>Packed by · تم التعبئة بواسطة</div><div><div class="ln"></div>Driver · السائق</div><div><div class="ln"></div>Checked by · تمت المراجعة بواسطة</div></div>
<div class="foot"><span>Deebtex · Alexandria, Egypt · www.deebtex.com</span><span>MADE IN EGYPT · صنع في مصر</span></div>
</div>`, `
@page{size:A4;margin:10mm}
body{background:#e9e9ef}
.page{width:210mm;min-height:297mm;background:#fff;margin:10px auto;padding:14mm 13mm;font-size:12px;box-shadow:0 2px 12px rgba(0,0,0,.15)}
@media print{body{background:#fff}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}
.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #000;padding-bottom:10px;margin-bottom:14px}
.lg{height:30px}.tt{text-align:right}.tt .en{font-size:22px;font-weight:900;letter-spacing:1.5px}.tt .ar{font-size:18px;font-weight:700}
.meta{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #000;margin-bottom:18px}
.meta>div{padding:7px 9px;border-right:1px solid #000}.meta>div:last-child{border-right:none}
.meta .k{font-size:9px;font-weight:700;color:#444;letter-spacing:.3px}.meta .v{font-size:13px;font-weight:700;margin-top:3px}
h2{font-size:12px;letter-spacing:1px;margin:0 0 6px}
table{width:100%;border-collapse:collapse}
tr{page-break-inside:avoid}
th{background:#000;color:#fff;padding:7px 9px;font-size:10.5px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
td{padding:6px 9px;border-bottom:1px solid #ddd}
tr.first td{border-top:1px solid #999}
td.pn{font-size:15px;font-weight:900;text-align:center;border-right:1px solid #ddd;vertical-align:middle;width:16%}
.mxt{font-size:9px;font-weight:700;color:#666;letter-spacing:.5px}
tr.ptot td{background:#f3f3f3;font-weight:700;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.num,th.num{text-align:right}
.sum{margin-top:22px;page-break-inside:avoid}
.sum tr.gt td{border-top:2.5px solid #000;font-weight:900;font-size:13px}
.sig{display:flex;justify-content:space-between;gap:24px;margin-top:44px;page-break-inside:avoid}
.sig div{flex:1;text-align:center;font-size:11px}.sig .ln{border-bottom:1px solid #000;height:38px;margin-bottom:6px}
.foot{margin-top:26px;border-top:1px solid #bbb;padding-top:8px;font-size:10.5px;display:flex;justify-content:space-between;font-weight:700}
`))
  }

  // ─── RENDER ────────────────────────────────────────────────
  if (loading) return <div style={st.pad}><div style={st.empty}>Loading…</div></div>

  const scanShip = pShips.find(s => s.id === scanShipId) ?? pShips.filter(s => s.status === "open").slice(-1)[0] ?? null
  live.current = { packs, rolls, shipments, scanShipId: scanShip?.id ?? null }

  const f = norm(filter)
  const shownPacks = sortedPacks.filter(k => !f || String(k.packNo) === f || (k.barcode ?? "").includes(f) ||
    rollsOf(k).some(r => norm(r.design).includes(f) || norm(r.code).includes(f) || norm(r.batch).includes(f)))
  const toPrint = pPacks.filter(k => !k.printed && !k.voided && rollsOf(k).length)
  const mixable = sortedPacks.filter(canMix)
  const specField = (k: keyof Spec | "batch", label: string, ph: string, flex = 1) => (
    <label style={{ flex, minWidth: 90 }}><div style={st.lbl}>{label}</div>
      <input style={st.input} value={spec[k]} placeholder={ph} dir="auto" onChange={e => setSpec({ ...spec, [k]: e.target.value })} /></label>
  )
  const lineInputs = (l: Line, set: (l: Line) => void, del: () => void) => (
    <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
      <input style={{ ...st.input, flex: 2 }} value={l.design} placeholder="Design" dir="auto" onChange={e => set({ ...l, design: e.target.value })} />
      <input style={{ ...st.input, flex: 1 }} value={l.code} placeholder="Code" onChange={e => set({ ...l, code: e.target.value })} />
      <input style={{ ...st.input, flex: 1 }} value={l.color} placeholder="Color" onChange={e => set({ ...l, color: e.target.value })} />
      <input style={{ ...st.input, flex: 1.2 }} type="number" min="0" value={l.meters || ""} placeholder="meters" onChange={e => set({ ...l, meters: Number(e.target.value) })} />
      <button style={{ ...st.icon, color: "#E24B4A" }} onClick={del}>✕</button>
    </div>
  )

  return (
    <div style={st.pad} className="dtx-viewpad">
      {working && <div style={{ position: "fixed", top: 70, right: 20, zIndex: 200, background: "#534AB7", color: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 14px rgba(0,0,0,.2)" }}>Saving…</div>}
      {err && (
        <div style={{ ...st.banner, background: "#FEEBEB", color: "#A32D2D", borderColor: "#fca5a5" }}>
          ⚠️ {err} <button style={{ ...st.btn, marginLeft: 10, padding: "2px 10px" }} onClick={() => setErr("")}>OK</button>
        </div>
      )}

      {/* PROJECT BAR */}
      <div style={{ ...st.card, padding: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#888" }}>Project</span>
        <select style={{ ...st.input, width: "auto", minWidth: 200, fontWeight: 600 }} value={pid ?? ""}
          onChange={e => { setPid(Number(e.target.value) || null); setSel(new Set()); setScanShipId(null) }}>
          <option value="">— pick a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.customer ? ` · ${p.customer}` : ""}</option>)}
        </select>
        {project && <button style={st.btn} onClick={() => setProjForm({ ...project, targets: project.targets.length ? project.targets.map(t => ({ ...t })) : [blankLine()] })}>✏️ Edit</button>}
        <button style={st.btnP} onClick={() => setProjForm({ id: 0, name: "", customer: "", targets: [blankLine()], notes: "", closed: false })}>+ New project</button>
        {project && <button style={{ ...st.btn, color: "#E24B4A", marginLeft: "auto" }} onClick={() => deleteProject(project)}>🗑</button>}
      </div>

      {!project && (
        <div style={{ ...st.card, padding: 32, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🏷</div>
          <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>Pick or create a project</div>
          <div style={{ fontSize: 13 }}>A project is one big order (e.g. a hotel). Add the ordered meters for each design, then print a sticker for every pack.</div>
        </div>
      )}

      {project && <>
        {/* ORDER PROGRESS */}
        <div style={st.card}>
          <div style={st.head}><b>{project.name}</b><span style={st.sub}>{project.customer}</span>
            <span style={{ ...st.sub, marginLeft: "auto" }}>{pPacks.filter(k => !k.voided).length} packs · {pShips.length} shipments</span></div>
          <div style={{ padding: "10px 16px 14px" }}>
            {prog.length === 0 && <div style={st.empty}>Edit the project to add the ordered meters per design.</div>}
            {prog.map(x => {
              const max = Math.max(x.ordered, x.made, 1)
              return (
                <div key={keyOf(x)} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 8, flexWrap: "wrap" }}>
                    <span dir="auto" style={{ fontWeight: 600 }}>{specLabel(x)}</span>
                    <span style={{ color: "#666" }}>made <b>{fmtM(x.made)}</b> · shipped <b style={{ color: "#166534" }}>{fmtM(x.shipped)}</b>
                      {x.ordered ? <> / {fmtM(x.ordered)}m ordered</> : " m"}{x.ordered > 0 && x.shipped >= x.ordered && " ✅"}</span>
                  </div>
                  <div style={{ height: 7, background: "#eee", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, x.made / max * 100)}%`, background: "#C9C5F2" }} />
                    <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, x.shipped / max * 100)}%`, background: "#639922" }} />
                  </div>
                </div>
              )
            })}
            {prog.length > 0 && <div style={{ fontSize: 11, color: "#999" }}><span style={{ color: "#8f88e0" }}>■</span> made &nbsp; <span style={{ color: "#639922" }}>■</span> shipped</div>}
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([["packs", "🏷 Packs & stickers"], ["shipments", "🚚 Shipments"], ["scan", "📷 Scan"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); if (k !== "scan") stopCam() }}
              style={{ ...st.btn, flex: 1, padding: "9px 6px", fontWeight: 600, ...(tab === k ? { background: "#7F77DD", color: "#fff", border: "none" } : {}) }}>{l}</button>
          ))}
        </div>

        {/* ── PACKS TAB ── */}
        {tab === "packs" && <>
          <div style={st.card}>
            <div style={st.head}><b>Add rolls</b><span style={st.sub}>each roll becomes its own pack — combine small ones with "Create pack"</span></div>
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              {(project.targets.length > 0) && (
                <label><div style={st.lbl}>From the order</div>
                  <select style={st.input} value={project.targets.findIndex(t => keyOf(t) === keyOf(spec))}
                    onChange={e => { const t = project.targets[Number(e.target.value)]; if (t) setSpec({ ...spec, design: t.design, code: t.code, color: t.color }) }}>
                    <option value={-1}>— pick a design from the order —</option>
                    {project.targets.map((t, i) => <option key={i} value={i}>{specLabel(t)} · {fmtM(t.meters)}m ordered</option>)}
                  </select></label>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {specField("design", "Design · الرسمة", "Layaly", 2)}
                {specField("code", "Code", "1007")}
                {specField("color", "Color", "3")}
                {specField("batch", "Batch", "B-2410")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ width: 130 }}><div style={st.lbl}>Meters</div>
                  <input style={st.input} type="number" min="0" step="0.1" value={rMeters} onChange={e => setRMeters(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addRolls([Number(rMeters)]) }} placeholder="100" /></label>
                <button style={{ ...st.btnP, opacity: working ? 0.5 : 1 }} disabled={working} onClick={() => addRolls([Number(rMeters)])}>+ Add roll</button>
                <span style={{ fontSize: 12, color: "#aaa", padding: "0 4px 9px" }}>or several:</span>
                <label style={{ flex: 1, minWidth: 180 }}><div style={st.lbl}>Meters separated by commas</div>
                  <input style={st.input} value={rBulk} onChange={e => setRBulk(e.target.value)} placeholder="100, 98, 102.5" /></label>
                <button style={{ ...st.btn, opacity: working ? 0.5 : 1 }} disabled={working} onClick={() => addRolls(rBulk.split(/[,\s،]+/).map(Number))}>
                  + Add {rBulk.split(/[,\s،]+/).map(Number).filter(n => n > 0).length || ""} rolls</button>
              </div>
            </div>
          </div>

          <div style={st.card}>
            <div style={{ ...st.head, flexWrap: "wrap" }}>
              <b>Packs</b><span style={st.sub}>{pPacks.length}</span>
              <input style={{ ...st.input, width: 140, padding: "5px 9px", fontSize: 12 }} placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} dir="auto" />
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#999" }}>Sticker
                  <input type="number" style={st.tiny} value={lblW} onChange={e => setLblW(Number(e.target.value) || 50)} />×
                  <input type="number" style={st.tiny} value={lblH} onChange={e => setLblH(Number(e.target.value) || 100)} />mm</span>
                <button style={{ ...st.btn, opacity: mixable.length >= 2 ? 1 : 0.5 }} disabled={mixable.length < 2} onClick={() => setMixPick(new Set())}>📦 Create pack</button>
                {sel.size > 0 && <button style={st.btn} onClick={() => printPacks(pPacks.filter(k => sel.has(k.id)))}>🖨 Print selected ({sel.size})</button>}
                <button style={{ ...st.btnP, opacity: toPrint.length && !working ? 1 : 0.5 }} disabled={!toPrint.length || working} onClick={() => printPacks(toPrint)}>
                  🖨 Print new stickers ({toPrint.length})</button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={st.table}>
                <thead><tr>
                  <th style={st.th}><input type="checkbox" checked={shownPacks.length > 0 && shownPacks.every(k => sel.has(k.id))}
                    onChange={e => setSel(e.target.checked ? new Set(shownPacks.map(k => k.id)) : new Set())} /></th>
                  {["Pack", "Design", "Code", "Color", "Batch", "Meters", "Status", ""].map(h => <th key={h} style={st.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownPacks.length === 0 && <tr><td colSpan={9} style={{ ...st.td, color: "#aaa", textAlign: "center", padding: 20 }}>No packs yet.</td></tr>}
                  {shownPacks.map(k => {
                    const rs = rollsOf(k), mixed = rs.length > 1
                    const sh = k.shipmentId != null ? shipments.find(s => s.id === k.shipmentId) : null
                    const bt = { ...st.td, borderBottom: "0.5px solid #e8e8e8" }
                    return rs.map((r, i) => (
                      <tr key={r.id} style={{ opacity: k.voided ? 0.5 : 1, background: mixed ? "#FCFBFF" : undefined }}>
                        {i === 0 && <>
                          <td style={bt} rowSpan={rs.length}><input type="checkbox" checked={sel.has(k.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(k.id); else n.delete(k.id); return n })} /></td>
                          <td style={{ ...bt, fontWeight: 800, fontSize: 15 }} rowSpan={rs.length}>
                            {k.packNo ?? <span style={{ color: "#bbb", fontWeight: 400, fontSize: 12 }}>—</span>}
                            {mixed && <div style={{ fontSize: 10, color: "#7F77DD", fontWeight: 700 }}>MIXED · {fmtM(sumM(rs))}m</div>}
                          </td>
                        </>}
                        <td style={st.td} dir="auto">{r.design}</td>
                        <td style={st.td}>{r.code}</td>
                        <td style={st.td}>{r.color}</td>
                        <td style={{ ...st.td, color: "#888" }}>{r.batch}</td>
                        <td style={{ ...st.td, fontWeight: 600, color: "#534AB7", whiteSpace: "nowrap" }}>{fmtM(r.meters)}m
                          <button style={{ ...st.icon, fontSize: 12 }} title="Edit roll" onClick={() => setEditRoll({ ...r })}>✏️</button></td>
                        {i === 0 && <>
                          <td style={bt} rowSpan={rs.length}>
                            {k.voided ? <span style={{ ...st.tag, background: "#FEEBEB", color: "#A32D2D" }}>cancelled</span>
                              : sh ? <span style={{ ...st.tag, background: "#EDFBEE", color: "#166534" }}>🚚 shipment {sh.number}</span>
                              : <span style={{ ...st.tag, background: "#F3F2FD", color: "#534AB7" }}>in store</span>}
                            {!k.printed && !k.voided && <span style={st.tag}>{k.packNo ? "reprint" : "not printed"}</span>}
                          </td>
                          <td style={{ ...bt, whiteSpace: "nowrap", textAlign: "right" }} rowSpan={rs.length}>
                            <button style={st.icon} title="Print sticker" onClick={() => printPacks([k])}>🖨</button>
                            {mixed && k.packNo == null && <button style={st.icon} title="Split back into rolls" onClick={() => unpack(k)}>✂️</button>}
                            <button style={st.icon} title={k.voided ? "Bring back" : "Cancel pack"} onClick={() => toggleVoid(k)}>{k.voided ? "↩" : "⛔"}</button>
                            <button style={{ ...st.icon, color: "#E24B4A" }} title="Delete" onClick={() => deletePack(k)}>🗑</button>
                          </td>
                        </>}
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>}

        {/* ── SHIPMENTS TAB ── */}
        {tab === "shipments" && (
          <div style={st.card}>
            <div style={st.head}><b>Shipments</b><span style={st.sub}>{pShips.length}</span>
              <button style={{ ...st.btnP, marginLeft: "auto" }} onClick={() => setShipForm(newShipmentDraft())}>+ New shipment</button></div>
            <div style={{ padding: "4px 16px 12px" }}>
              {pShips.length === 0 && <div style={{ ...st.empty, padding: "20px 0" }}>No shipments yet. Create one when the truck arrives, then scan the packs.</div>}
              {[...pShips].reverse().map(s => {
                const ss = shipStats(s)
                return (
                  <div key={s.id} style={{ padding: "12px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14 }}>Shipment {s.number}</b>
                      <span style={{ ...st.tag, ...(s.status === "open" ? { background: "#FEF3C7", color: "#92400E" } : { background: "#EDFBEE", color: "#166534" }) }}>
                        {s.status === "open" ? "loading" : "closed"}</span>
                      <span style={st.sub}>{s.date}{s.truck ? ` · 🚚 ${s.truck}` : ""}{s.driver ? ` · ${s.driver}` : ""}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 600 }}>{ss.packs.length} packs · {fmtM(ss.meters)}m</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                      {ss.lines.map(l => <span key={keyOf(l)} style={{ marginRight: 12 }} dir="auto">{specLabel(l)}: {fmtM(l.loaded)}{l.plan ? `/${fmtM(l.plan)}` : ""}m</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {s.status === "open"
                        ? <><button style={st.btnP} onClick={() => { setScanShipId(s.id); setTab("scan") }}>📷 Scan packs</button>
                            <button style={st.btn} onClick={() => setShipStatus(s, "closed")}>✓ Close shipment</button></>
                        : <button style={st.btn} onClick={() => setShipStatus(s, "open")}>↩ Reopen</button>}
                      <button style={st.btn} onClick={() => exportPackingList(s)}>📄 Packing list</button>
                      <button style={st.btn} onClick={() => setShipForm({ ...s, plan: s.plan.map(l => ({ ...l })) })}>✏️</button>
                      <button style={{ ...st.btn, color: "#E24B4A" }} onClick={() => deleteShipment(s)}>🗑</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── SCAN TAB ── */}
        {tab === "scan" && (() => {
          const ss = scanShip ? shipStats(scanShip) : null
          const fresh = feedback && Date.now() - feedback.t < 6000
          return <>
            <div style={{ ...st.card, padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#888" }}>Loading into</span>
              <select style={{ ...st.input, width: "auto", flex: 1, minWidth: 170, fontWeight: 600 }} value={scanShip?.id ?? ""}
                onChange={e => setScanShipId(Number(e.target.value) || null)}>
                <option value="">— pick shipment —</option>
                {pShips.map(s => <option key={s.id} value={s.id}>Shipment {s.number} · {s.date}{s.truck ? ` · ${s.truck}` : ""}{s.status === "closed" ? " (closed)" : ""}</option>)}
              </select>
              <button style={st.btn} onClick={() => setShipForm(newShipmentDraft())}>+ New</button>
            </div>

            {scanShip && ss && <>
              <div style={{ ...st.card, padding: 12 }}>
                <div id="dtx-reader" style={{ width: "100%", maxWidth: 520, margin: "0 auto", borderRadius: 10, overflow: "hidden", background: camOn ? "#000" : "transparent" }} />
                <div style={{ display: "flex", gap: 8, marginTop: camOn ? 10 : 0, flexWrap: "wrap" }}>
                  {!camOn
                    ? <button style={{ ...st.btnP, flex: 1, padding: 14, fontSize: 15, opacity: scanShip.status === "closed" ? 0.5 : 1 }} onClick={startCam} disabled={scanShip.status === "closed"}>📷 Start camera</button>
                    : <button style={{ ...st.btn, flex: 1, padding: 12 }} onClick={stopCam}>■ Stop camera</button>}
                  <button style={{ ...st.btn, padding: 12, opacity: undoStack.length ? 1 : 0.4 }} disabled={!undoStack.length} onClick={undoLast}>↩ Undo last</button>
                </div>
                {camErr && <div style={{ color: "#A32D2D", fontSize: 12, marginTop: 8 }}>{camErr}</div>}
                <input style={{ ...st.input, fontFamily: "monospace", marginTop: 10 }} placeholder="Or type / scan the barcode number + Enter" value={manual} inputMode="numeric"
                  onChange={e => setManual(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { lastScan.current = { code: "", t: 0 }; processCode(manual); setManual("") } }} />
                {scanShip.status === "closed" && <div style={{ fontSize: 12, color: "#92400E", marginTop: 8 }}>This shipment is closed. Reopen it from the Shipments tab to add packs.</div>}
              </div>

              {fresh && (
                <div style={{ ...st.banner, fontSize: 15, fontWeight: 700, padding: "14px 16px",
                  ...(feedback!.ok ? { background: "#EDFBEE", color: "#166534", borderColor: "#86EFAC" } : { background: "#FEEBEB", color: "#A32D2D", borderColor: "#fca5a5" }) }} dir="auto">
                  {feedback!.ok ? "" : "⛔ "}{feedback!.msg}
                </div>
              )}

              <div style={st.card}>
                <div style={st.head}><b>Shipment {scanShip.number}</b>
                  <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 800, color: "#534AB7" }}>{ss.packs.length} packs · {fmtM(ss.meters)}m</span></div>
                <div style={{ padding: "10px 16px" }}>
                  {ss.lines.length === 0 && <div style={st.empty}>Scan the first pack…</div>}
                  {ss.lines.map(l => {
                    const o = prog.find(x => keyOf(x) === keyOf(l))
                    const pct = l.plan ? Math.min(100, l.loaded / l.plan * 100) : 100
                    const done = l.plan > 0 && l.loaded >= l.plan
                    return (
                      <div key={keyOf(l)} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 8, flexWrap: "wrap" }}>
                          <span dir="auto" style={{ fontWeight: 700 }}>{specLabel(l)}</span>
                          <span><b style={{ fontSize: 16 }}>{fmtM(l.loaded)}</b>{l.plan ? ` / ${fmtM(l.plan)}m` : "m"} loaded {done ? "✅" : ""} <span style={{ color: "#999" }}>({l.packs} packs)</span></span>
                        </div>
                        <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden", margin: "4px 0 2px" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: done ? "#639922" : "#7F77DD" }} />
                        </div>
                        {o && o.ordered > 0 && <div style={{ fontSize: 11, color: "#999" }}>Whole order: {fmtM(o.shipped)} / {fmtM(o.ordered)}m shipped</div>}
                      </div>
                    )
                  })}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {scanShip.status === "open" && <button style={st.btnP} onClick={async () => { await stopCam(); await setShipStatus(scanShip, "closed") }}>✓ Close shipment</button>}
                    <button style={st.btn} onClick={() => exportPackingList(scanShip)}>📄 Packing list</button>
                  </div>
                </div>
              </div>

              <div style={st.card}>
                <div style={st.head}><b>Loaded packs</b><span style={st.sub}>latest first</span></div>
                <div style={{ padding: "4px 16px 10px" }}>
                  {[...ss.packs].sort((a, b) => undoStack.indexOf(b.id) - undoStack.indexOf(a.id) || (b.packNo ?? 0) - (a.packNo ?? 0)).map(k => {
                    const rs = rollsOf(k)
                    return (
                      <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #f3f3f3", fontSize: 13 }}>
                        <b style={{ width: 54 }}>Pack {k.packNo}</b>
                        <span style={{ flex: 1 }} dir="auto">{rs.length > 1 ? `Mixed · ${rs.map(r => r.design).join(", ")}` : rs[0] ? specLabel(rs[0]) : ""}</span>
                        <span style={{ fontWeight: 600 }}>{fmtM(sumM(rs))}m</span>
                        {scanShip.status === "open" && (
                          <button style={{ ...st.icon, color: "#E24B4A" }} title="Remove from truck"
                            onClick={() => { if (window.confirm(`Remove pack ${k.packNo} from shipment ${scanShip.number}?`)) unload(k) }}>✕</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>}
            {!scanShip && <div style={{ ...st.card, padding: 24, textAlign: "center", color: "#888", fontSize: 13 }}>Create a shipment when the truck arrives, then start scanning.</div>}
          </>
        })()}
      </>}

      {/* ── CREATE MIXED PACK ── */}
      {mixPick && (
        <Overlay title="📦 Create mixed pack" onClose={() => setMixPick(null)}>
          <div style={{ fontSize: 12, color: "#777" }}>Tick the rolls wound together into one big roll. Only rolls without a printed sticker are shown.</div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: "0.5px solid #eee", borderRadius: 8 }}>
            {mixable.map(k => { const r = rollsOf(k)[0]; return (
              <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "0.5px solid #f3f3f3", cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={mixPick.has(k.id)} onChange={e => { const n = new Set(mixPick); if (e.target.checked) n.add(k.id); else n.delete(k.id); setMixPick(n) }} />
                <span style={{ flex: 1 }} dir="auto">{specLabel(r)}{r.batch ? <span style={{ color: "#aaa" }}> · {r.batch}</span> : null}</span>
                <b>{fmtM(r.meters)}m</b>
              </label>
            ) })}
          </div>
          {(() => { const picked = mixable.filter(k => mixPick.has(k.id)); const m = picked.reduce((a, k) => a + sumM(rollsOf(k)), 0); return (
            <button style={{ ...st.btnP, padding: 11, opacity: picked.length >= 2 && !working ? 1 : 0.5 }} disabled={picked.length < 2 || working} onClick={() => createMixed(picked.map(k => k.id))}>
              {working ? "Saving…" : picked.length >= 2 ? `Create pack · ${picked.length} rolls · ${fmtM(m)}m` : "Pick at least 2 rolls"}</button>
          ) })()}
        </Overlay>
      )}

      {/* ── PROJECT FORM ── */}
      {projForm && (
        <Overlay title={projForm.id ? "Edit project" : "New project"} onClose={() => { setProjForm(null); setEnAsk(null) }}>
          <label><div style={st.lbl}>Project name</div>
            <input style={st.input} value={projForm.name} onChange={e => setProjForm({ ...projForm, name: e.target.value })} placeholder="e.g. Flamingo hotel order" dir="auto" autoFocus /></label>
          <label><div style={st.lbl}>Customer (printed on stickers)</div>
            <input style={st.input} value={projForm.customer} onChange={e => setProjForm({ ...projForm, customer: e.target.value })} placeholder="e.g. PrideInn Flamingo Beach Resort" dir="auto" /></label>
          <div><div style={st.lbl}>Ordered meters — design · code · color · meters</div>
            {textiles.length > 0 && (() => {
              const q = norm(texQ)
              const hits = q ? textiles.filter(t => norm(t.code).includes(q) || norm(t.name).includes(q) || norm(t.color).includes(q)).slice(0, 12) : []
              return (
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input style={{ ...st.input, background: "#F8F7FF", borderColor: "#c4c0f0" }} value={texQ} onChange={e => setTexQ(e.target.value)} dir="auto"
                    placeholder={`🔍 Add from your textiles (${textiles.length}) — type a code or name`} />
                  {q && (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, background: "#fff", border: "0.5px solid #ddd", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,.12)", maxHeight: 260, overflowY: "auto" }}>
                      {hits.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: "#aaa" }}>No textile matches — type the line by hand below</div>}
                      {hits.map(t => { const sp = specFromTextile(t, families); return (
                        <div key={t.code} style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "0.5px solid #f3f3f3", fontSize: 13 }}
                          onMouseDown={e => { e.preventDefault()
                            // design stays empty until it has an English name → the box below asks for it once
                            const line = { design: sp.design || t.name, code: sp.code, color: sp.color, meters: 0 }
                            const empty = projForm.targets.findIndex(x => !x.design.trim())
                            const targets = empty >= 0 ? projForm.targets.map((x, j) => j === empty ? line : x) : [...projForm.targets, line]
                            setProjForm({ ...projForm, targets }); setTexQ("")
                            if (sp.needsEn) setEnAsk({ base: sp.base, arabic: t.name, value: "" }) }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#F3F2FD")} onMouseLeave={e => (e.currentTarget.style.background = "")}>
                          <b dir="auto">{t.code}</b>{t.name ? <span dir="auto"> — {t.name}</span> : null}{t.color ? <span style={{ color: "#999" }} dir="auto"> · {t.color}</span> : null}
                          <div style={{ fontSize: 11, color: sp.needsEn ? "#B45309" : "#7F77DD" }}>
                            → {sp.needsEn ? `no English name yet · code ${sp.code} · color ${sp.color}` : specLabel(sp)}</div>
                        </div>
                      ) })}
                    </div>
                  )}
                </div>
              )
            })()}
            {enAsk && (
              <div style={{ background: "#FFF7ED", border: "0.5px solid #FDBA74", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#9A3412", marginBottom: 6 }}>
                  <b dir="auto">{enAsk.arabic || enAsk.base}</b> ({enAsk.base}) has no English name yet. Type it once — it's saved to your textiles for next time.
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={st.input} autoFocus placeholder="English name, e.g. Layaly" value={enAsk.value}
                    onChange={e => setEnAsk({ ...enAsk, value: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") (e.currentTarget.nextSibling as HTMLButtonElement)?.click() }} />
                  <button style={{ ...st.btnP, opacity: enAsk.value.trim() && !working ? 1 : 0.5 }} disabled={!enAsk.value.trim() || working}
                    onClick={async () => {
                      const en = enAsk.value.trim(); if (!en) return
                      const ok = saveEnglishName ? await saveEnglishName(enAsk.base, enAsk.arabic, en) : false
                      if (!ok) { setErr("Couldn't save the English name — check your internet and try again."); return }
                      // replace the Arabic name in this project's lines for that design
                      setProjForm(f => f && ({ ...f, targets: f.targets.map(x =>
                        x.code.split("/")[0] === enAsk.base && (x.design === enAsk.arabic || !x.design.trim()) ? { ...x, design: en } : x) }))
                      setEnAsk(null)
                    }}>Save</button>
                  <button style={st.btn} onClick={() => setEnAsk(null)}>Later</button>
                </div>
              </div>
            )}
            {projForm.targets.map((t, i) => <div key={i}>{lineInputs(t,
              l => setProjForm({ ...projForm, targets: projForm.targets.map((x, j) => j === i ? l : x) }),
              () => setProjForm({ ...projForm, targets: projForm.targets.filter((_, j) => j !== i) }))}</div>)}
            <button style={st.btn} onClick={() => setProjForm({ ...projForm, targets: [...projForm.targets, blankLine()] })}>+ Add design</button>
          </div>
          <label><div style={st.lbl}>Notes (optional)</div>
            <input style={st.input} value={projForm.notes} onChange={e => setProjForm({ ...projForm, notes: e.target.value })} dir="auto" /></label>
          <button style={{ ...st.btnP, padding: 11, opacity: working ? 0.5 : 1 }} disabled={working} onClick={saveProject}>{projForm.id ? "Save changes" : "Create project"}</button>
        </Overlay>
      )}

      {/* ── SHIPMENT FORM ── */}
      {shipForm && (
        <Overlay title={shipForm.id ? `Edit shipment ${shipForm.number}` : `New shipment ${shipForm.number}`} onClose={() => setShipForm(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label><div style={st.lbl}>Date</div><input style={st.input} type="date" value={shipForm.date} onChange={e => setShipForm({ ...shipForm, date: e.target.value })} /></label>
            <label><div style={st.lbl}>Truck no. · رقم السيارة</div><input style={st.input} value={shipForm.truck} onChange={e => setShipForm({ ...shipForm, truck: e.target.value })} dir="auto" /></label>
            <label style={{ gridColumn: "1 / -1" }}><div style={st.lbl}>Driver · السائق</div><input style={st.input} value={shipForm.driver} onChange={e => setShipForm({ ...shipForm, driver: e.target.value })} dir="auto" /></label>
          </div>
          <div><div style={st.lbl}>Planned for this truck (meters) — the scan screen shows "loaded / planned"</div>
            {shipForm.plan.map((l, i) => <div key={i}>{lineInputs(l,
              x => setShipForm({ ...shipForm, plan: shipForm.plan.map((y, j) => j === i ? x : y) }),
              () => setShipForm({ ...shipForm, plan: shipForm.plan.filter((_, j) => j !== i) }))}</div>)}
            <button style={st.btn} onClick={() => setShipForm({ ...shipForm, plan: [...shipForm.plan, blankLine()] })}>+ Add design</button>
          </div>
          <label><div style={st.lbl}>Notes (optional)</div><input style={st.input} value={shipForm.notes} onChange={e => setShipForm({ ...shipForm, notes: e.target.value })} dir="auto" /></label>
          <button style={{ ...st.btnP, padding: 11, opacity: working ? 0.5 : 1 }} disabled={working} onClick={saveShipment}>{shipForm.id ? "Save changes" : "Create & start scanning"}</button>
        </Overlay>
      )}

      {/* ── EDIT ROLL ── */}
      {editRoll && (
        <Overlay title="Edit roll" onClose={() => setEditRoll(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            {(["design", "code", "color"] as const).map(k => (
              <label key={k}><div style={st.lbl}>{k === "design" ? "Design · الرسمة" : k[0].toUpperCase() + k.slice(1)}</div>
                <input style={st.input} value={editRoll[k]} dir="auto" onChange={e => setEditRoll({ ...editRoll, [k]: e.target.value })} /></label>
            ))}
            <label><div style={st.lbl}>Batch</div><input style={st.input} value={editRoll.batch} onChange={e => setEditRoll({ ...editRoll, batch: e.target.value })} /></label>
            <label><div style={st.lbl}>Meters</div><input style={st.input} type="number" min="0" step="0.1" value={editRoll.meters || ""} onChange={e => setEditRoll({ ...editRoll, meters: Number(e.target.value) })} /></label>
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>If the sticker was already printed, the pack keeps its number and barcode and is marked "reprint" so you print the corrected sticker.</div>
          <button style={{ ...st.btnP, padding: 11, opacity: working ? 0.5 : 1 }} disabled={working} onClick={saveEditRoll}>Save</button>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 560, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: 20, display: "grid", gap: 12 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center" }}><b style={{ fontSize: 16, flex: 1 }}>{title}</b>
          <button style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#999" }} onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────
const st: Record<string, CSSProperties> = {
  pad:    { flex: 1, padding: 20, overflowY: "auto" },
  card:   { background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, marginBottom: 12 },
  head:   { display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "0.5px solid #f0f0f0", fontSize: 14 },
  sub:    { fontSize: 12, color: "#999" },
  empty:  { fontSize: 13, color: "#aaa" },
  banner: { border: "0.5px solid", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13 },
  input:  { width: "100%", padding: "8px 10px", border: "0.5px solid #d5d5d5", borderRadius: 8, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" },
  tiny:   { width: 44, padding: "3px 4px", margin: "0 3px", border: "0.5px solid #d5d5d5", borderRadius: 5, fontSize: 11 },
  lbl:    { fontSize: 12, fontWeight: 500, color: "#555", marginBottom: 4 },
  btn:    { padding: "7px 12px", borderRadius: 8, border: "0.5px solid #d5d5d5", background: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit", color: "#333" },
  btnP:   { padding: "7px 14px", borderRadius: 8, border: "none", background: "#7F77DD", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  icon:   { background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 5px" },
  table:  { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:     { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "#888", fontWeight: 500, borderBottom: "0.5px solid #eee", background: "#fafafa" },
  td:     { padding: "7px 10px", borderBottom: "0.5px solid #f5f5f5", verticalAlign: "middle" },
  tag:    { display: "inline-block", fontSize: 10, fontWeight: 600, borderRadius: 4, padding: "1px 6px", marginLeft: 6, background: "#f3f3f3", color: "#999" },
}

// Deebtex logo (black, for printing) — embedded so stickers print without extra files
const LOGO = "data:image/png;base64,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"
