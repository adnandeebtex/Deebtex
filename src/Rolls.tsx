// ============================================================
//  DEEBTEX — Rolls.tsx
//  Roll stickers (barcodes) + shipment scanning for projects that
//  run outside the normal order system (e.g. hotel orders).
//  Tables: roll_projects, rolls, shipments
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

// ─── TYPES ───────────────────────────────────────────────────
type TargetLine = { textile: string; meters: number }
type Project = {
  id: number; name: string; customer: string
  targets: TargetLine[]; notes: string; closed: boolean; createdAt?: string
}
type Roll = {
  id: number; code: string; projectId: number; rollNo: number
  textile: string; meters: number; voided: boolean
  shipmentId: number | null; printed: boolean; createdAt?: string
}
type Shipment = {
  id: number; projectId: number; number: number; date: string
  truck: string; driver: string; notes: string
  status: "open" | "closed"; plan: TargetLine[]
  createdAt?: string; closedAt?: string | null
}
type Tab = "rolls" | "shipments" | "scan"

// html5-qrcode (loaded from CDN on first use, like the Excel reader)
type H5Scanner = {
  start: (cam: unknown, cfg: unknown, ok: (text: string) => void, err: () => void) => Promise<void>
  stop: () => Promise<void>
  clear: () => void
}
type H5Global = {
  Html5Qrcode: new (id: string, cfg: unknown) => H5Scanner
  Html5QrcodeSupportedFormats: Record<string, number>
}

// ─── SMALL HELPERS ───────────────────────────────────────────
let _seq = 0
function newId() { _seq = (_seq + 1) % 1000; return Date.now() * 1000 + _seq }
const norm  = (s: string) => s.trim().toLowerCase()
const today = () => new Date().toISOString().slice(0, 10)
const fmtM  = (n: number) => `${Math.round(n * 100) / 100}`
const esc   = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))
function parseLines(v: unknown): TargetLine[] {
  try {
    const a = typeof v === "string" ? JSON.parse(v) : v
    return Array.isArray(a) ? a.map(x => ({ textile: String(x.textile ?? ""), meters: Number(x.meters) || 0 })).filter(x => x.textile) : []
  } catch { return [] }
}
function sanProject(r: Record<string, unknown>): Project {
  return { id: Number(r.id), name: String(r.name ?? ""), customer: String(r.customer ?? ""),
    targets: parseLines(r.targets), notes: String(r.notes ?? ""), closed: r.closed === true,
    createdAt: r.createdAt ? String(r.createdAt) : undefined }
}
function sanRoll(r: Record<string, unknown>): Roll {
  return { id: Number(r.id), code: String(r.code ?? ""), projectId: Number(r.projectId),
    rollNo: Number(r.rollNo) || 0, textile: String(r.textile ?? ""), meters: Number(r.meters) || 0,
    voided: r.voided === true, shipmentId: r.shipmentId != null ? Number(r.shipmentId) : null,
    printed: r.printed === true, createdAt: r.createdAt ? String(r.createdAt) : undefined }
}
function sanShipment(r: Record<string, unknown>): Shipment {
  return { id: Number(r.id), projectId: Number(r.projectId), number: Number(r.number) || 0,
    date: String(r.date ?? ""), truck: String(r.truck ?? ""), driver: String(r.driver ?? ""),
    notes: String(r.notes ?? ""), status: r.status === "closed" ? "closed" : "open",
    plan: parseLines(r.plan), createdAt: r.createdAt ? String(r.createdAt) : undefined,
    closedAt: r.closedAt ? String(r.closedAt) : null }
}

// ─── CODE 128 (B) BARCODE → SVG ──────────────────────────────
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
  const vals = [104]
  for (const ch of text) { const c = ch.charCodeAt(0); if (c >= 32 && c <= 127) vals.push(c - 32) }
  let sum = 104
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
function openPrint(title: string, body: string, css: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${esc(title)}</title>
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
  const w = window.open("", "_blank")
  if (!w) { alert("Please allow pop-ups for this site to print."); return }
  w.document.write(html); w.document.close(); w.focus()
}

function stickerHtml(r: Roll, p: Project) {
  return `<div class="lbl">
  <div class="top">
    <img class="logo" src="${LOGO}" alt="Deebtex"/>
    <div class="roll"><div class="k">ROLL NO. · رقم الرول</div><div class="rn">${r.rollNo}</div></div>
  </div>
  <div class="mid">
    <div class="k">TEXTILE · القماش</div>
    <div class="tex" dir="auto">${esc(r.textile)}</div>
    <div class="row">
      <div class="cell"><div class="k">METERS · الأمتار</div><div class="m">${fmtM(r.meters)}<small> m</small></div></div>
      <div class="cell grow"><div class="k">CUSTOMER · العميل</div><div class="cu" dir="auto">${esc(p.customer || p.name)}</div></div>
    </div>
  </div>
  <div class="bc">${code128Svg(r.code)}</div>
  <div class="code">${esc(r.code)}</div>
  <div class="foot">MADE IN EGYPT &nbsp;·&nbsp; صنع في مصر</div>
</div>`
}
function stickerCss(w: number, h: number) {
  // sizes scale with the label height so other label sizes still look right
  const u = h / 75
  return `
@page{size:${w}mm ${h}mm;margin:0}
body{background:#e9e9ef}
.lbl{width:${w}mm;height:${h}mm;background:#fff;margin:10mm auto;padding:${3.2*u}mm ${3.6*u}mm ${2.4*u}mm;display:flex;flex-direction:column;overflow:hidden;page-break-after:always;break-after:page;box-shadow:0 2px 10px rgba(0,0,0,.15)}
@media print{body{background:#fff}.lbl{margin:0;box-shadow:none}}
.k{font-size:${1.9*u}mm;letter-spacing:.3mm;font-weight:700;color:#000;text-transform:uppercase}
.top{display:flex;align-items:center;justify-content:space-between;border-bottom:${0.6*u}mm solid #000;padding-bottom:${1.8*u}mm}
.logo{height:${7.2*u}mm;width:auto}
.roll{text-align:right;border:${0.5*u}mm solid #000;border-radius:${1.4*u}mm;padding:${0.8*u}mm ${2*u}mm;min-width:${20*u}mm}
.rn{font-size:${7.6*u}mm;font-weight:800;line-height:1}
.mid{padding-top:${1.8*u}mm;flex:1;display:flex;flex-direction:column;min-height:0}
.tex{font-size:${6.6*u}mm;font-weight:800;line-height:1.1;margin:${0.4*u}mm 0 ${1.6*u}mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row{display:flex;gap:${3*u}mm;align-items:flex-end}
.cell.grow{flex:1;min-width:0;border-left:${0.35*u}mm solid #000;padding-left:${3*u}mm}
.m{font-size:${8.4*u}mm;font-weight:800;line-height:1}
.m small{font-size:${3.6*u}mm;font-weight:700}
.cu{font-size:${3.6*u}mm;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}
.bc{height:${12.5*u}mm;margin-top:${1.8*u}mm}
.code{text-align:center;font:700 ${2.6*u}mm 'Courier New',monospace;letter-spacing:${0.8*u}mm;margin-top:${0.6*u}mm}
.foot{margin-top:${1.2*u}mm;background:#000;color:#fff;text-align:center;font-size:${2.5*u}mm;font-weight:700;letter-spacing:.4mm;padding:${0.8*u}mm 0;border-radius:${0.8*u}mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
`
}

// ─── COMPONENT ───────────────────────────────────────────────
export default function RollsView({ db }: { db: SupabaseClient }) {
  const [projects,  setProjects]  = useState<Project[]>([])
  const [rolls,     setRolls]     = useState<Roll[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading,   setLoading]   = useState(true)
  const [err,       setErr]       = useState("")
  const [pid,       setPid]       = useState<number | null>(() => {
    try { const v = localStorage.getItem("dtx_roll_project"); return v ? Number(v) : null } catch { return null }
  })
  const [tab, setTab] = useState<Tab>(() => (window.innerWidth < 768 ? "scan" : "rolls"))

  // forms
  const [projForm, setProjForm] = useState<Project | null>(null)
  const [shipForm, setShipForm] = useState<Shipment | null>(null)
  const [editRoll, setEditRoll] = useState<Roll | null>(null)
  const [rTextile, setRTextile] = useState("")
  const [rMeters,  setRMeters]  = useState("")
  const [rBulk,    setRBulk]    = useState("")
  const [sel,      setSel]      = useState<Set<number>>(new Set())
  const [rollFilter, setRollFilter] = useState("")
  const [lblW, setLblW] = useState(() => { try { return Number(localStorage.getItem("dtx_lbl_w")) || 100 } catch { return 100 } })
  const [lblH, setLblH] = useState(() => { try { return Number(localStorage.getItem("dtx_lbl_h")) || 75 } catch { return 75 } })

  // scanning
  const [scanShipId, setScanShipId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string; t: number } | null>(null)
  const [manual,   setManual]   = useState("")
  const [camOn,    setCamOn]    = useState(false)
  const [camErr,   setCamErr]   = useState("")
  const [undoStack, setUndoStack] = useState<number[]>([])
  const scannerRef = useRef<H5Scanner | null>(null)
  const lastScan   = useRef<{ code: string; t: number }>({ code: "", t: 0 })
  const live       = useRef<{ rolls: Roll[]; shipments: Shipment[]; scanShipId: number | null }>({ rolls, shipments, scanShipId })

  useEffect(() => { try { if (pid) localStorage.setItem("dtx_roll_project", String(pid)) } catch { /* ignore */ } }, [pid])
  useEffect(() => { try { localStorage.setItem("dtx_lbl_w", String(lblW)); localStorage.setItem("dtx_lbl_h", String(lblH)) } catch { /* ignore */ } }, [lblW, lblH])

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
      const [p, r, s] = await Promise.all([
        loadAll("roll_projects", sanProject), loadAll("rolls", sanRoll), loadAll("shipments", sanShipment)])
      setProjects(p); setRolls(r); setShipments(s); setLoading(false)
    })()

    function merge<T extends { id: number }>(set: React.Dispatch<React.SetStateAction<T[]>>, san: (r: Record<string, unknown>) => T) {
      return (payload: { eventType: string; new: unknown; old: unknown }) => {
        if (payload.eventType === "DELETE") {
          const id = Number((payload.old as Record<string, unknown>).id)
          set(p => p.filter(x => x.id !== id)); return
        }
        const row = san(payload.new as Record<string, unknown>)
        set(p => p.some(x => x.id === row.id) ? p.map(x => x.id === row.id ? row : x) : [...p, row])
      }
    }
    const ch = db.channel("deebtex-rolls")
      .on("postgres_changes", { event: "*", schema: "public", table: "roll_projects" }, merge(setProjects, sanProject))
      .on("postgres_changes", { event: "*", schema: "public", table: "rolls" },         merge(setRolls, sanRoll))
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments" },     merge(setShipments, sanShipment))
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [db])

  // stop camera when leaving
  useEffect(() => () => { stopCam() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── DB WRITE (visible errors) ──
  async function save(table: string, row: object): Promise<boolean> {
    const { error } = await db.from(table).upsert(row as Record<string, unknown>, { onConflict: "id" })
    if (error) { setErr(`Save failed (${table}): ${error.message} — check your internet and try again.`); return false }
    return true
  }
  async function remove(table: string, id: number): Promise<boolean> {
    const { error } = await db.from(table).delete().eq("id", id)
    if (error) { setErr(`Delete failed (${table}): ${error.message}`); return false }
    return true
  }

  // ── DERIVED ──
  const project   = projects.find(p => p.id === pid) ?? null
  const pRolls    = useMemo(() => rolls.filter(r => r.projectId === pid).sort((a, b) => a.rollNo - b.rollNo), [rolls, pid])
  const pShips    = useMemo(() => shipments.filter(s => s.projectId === pid).sort((a, b) => a.number - b.number), [shipments, pid])
  const textileNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of project?.targets ?? []) m.set(norm(t.textile), t.textile)
    for (const r of pRolls) if (!m.has(norm(r.textile))) m.set(norm(r.textile), r.textile)
    return [...m.values()]
  }, [project, pRolls])

  function progress(rollsIn: Roll[]) {
    // per textile: ordered / made / loaded (in any shipment)
    return textileNames.map(name => {
      const ordered = project?.targets.find(t => norm(t.textile) === norm(name))?.meters ?? 0
      const live_ = rollsIn.filter(r => !r.voided && norm(r.textile) === norm(name))
      const made   = live_.reduce((s, r) => s + r.meters, 0)
      const loaded = live_.filter(r => r.shipmentId != null).reduce((s, r) => s + r.meters, 0)
      return { name, ordered, made, loaded, rolls: live_.length }
    })
  }
  const prog = progress(pRolls)

  // ── PROJECTS ──
  function blankProject(): Project { return { id: 0, name: "", customer: "", targets: [{ textile: "", meters: 0 }], notes: "", closed: false } }
  async function saveProject() {
    if (!projForm || !projForm.name.trim()) return
    const row: Project = { ...projForm, id: projForm.id || newId(),
      targets: projForm.targets.filter(t => t.textile.trim()).map(t => ({ textile: t.textile.trim(), meters: Number(t.meters) || 0 })) }
    if (await save("roll_projects", row)) {
      setProjects(p => p.some(x => x.id === row.id) ? p.map(x => x.id === row.id ? row : x) : [...p, row])
      setPid(row.id); setProjForm(null)
    }
  }
  async function deleteProject(p: Project) {
    const nR = rolls.filter(r => r.projectId === p.id).length
    const nS = shipments.filter(s => s.projectId === p.id).length
    if (nR || nS) { alert(`"${p.name}" has ${nR} rolls and ${nS} shipments.\nDelete those first — a project with rolls can't be deleted.`); return }
    if (!window.confirm(`Delete project "${p.name}"?\n\nThis cannot be undone.`)) return
    if (await remove("roll_projects", p.id)) { setProjects(x => x.filter(y => y.id !== p.id)); setPid(null) }
  }

  // ── ROLLS ──
  function nextCodeNum() {
    let max = 0
    for (const r of rolls) { const n = Number(r.code.replace(/\D/g, "")); if (n > max) max = n }
    return max + 1
  }
  async function addRolls(metersList: number[]) {
    if (!project) return
    const textile = rTextile.trim()
    if (!textile) { setErr("Pick the textile first."); return }
    const good = metersList.filter(m => m > 0)
    if (!good.length) return
    let rollNo = pRolls.reduce((m, r) => Math.max(m, r.rollNo), 0)
    let codeN  = nextCodeNum()
    const created: Roll[] = good.map(m => ({
      id: newId(), code: `DTX${String(codeN++).padStart(6, "0")}`, projectId: project.id,
      rollNo: ++rollNo, textile, meters: m, voided: false, shipmentId: null, printed: false,
    }))
    const { error } = await db.from("rolls").insert(created)
    if (error) { setErr(`Couldn't add rolls: ${error.message}`); return }
    setRolls(p => [...p, ...created.filter(c => !p.some(x => x.id === c.id))])
    setRMeters(""); setRBulk(""); setErr("")
  }
  async function saveEditRoll() {
    if (!editRoll) return
    const orig = rolls.find(r => r.id === editRoll.id)
    const changed = orig && (orig.meters !== editRoll.meters || orig.textile !== editRoll.textile)
    const row = { ...editRoll, textile: editRoll.textile.trim(), printed: changed ? false : editRoll.printed }
    if (await save("rolls", row)) { setRolls(p => p.map(x => x.id === row.id ? row : x)); setEditRoll(null) }
  }
  async function toggleVoid(r: Roll) {
    if (r.shipmentId != null) { alert("This roll is already loaded in a shipment. Remove it from the shipment first."); return }
    if (!r.voided && !window.confirm(`Cancel roll #${r.rollNo} (${r.textile} · ${fmtM(r.meters)}m)?\n\nIts sticker will be refused when scanned. You can bring it back later.`)) return
    const row = { ...r, voided: !r.voided }
    if (await save("rolls", row)) setRolls(p => p.map(x => x.id === r.id ? row : x))
  }
  async function deleteRoll(r: Roll) {
    if (r.shipmentId != null) { alert("This roll is loaded in a shipment — remove it from the shipment first."); return }
    if (!window.confirm(`Delete roll #${r.rollNo} (${r.textile} · ${fmtM(r.meters)}m, ${r.code})?\n\nIf a sticker was already printed for it, use "Cancel roll" instead so the sticker gets refused when scanned.\n\nThis cannot be undone.`)) return
    if (await remove("rolls", r.id)) { setRolls(p => p.filter(x => x.id !== r.id)); setSel(s => { const n = new Set(s); n.delete(r.id); return n }) }
  }
  async function printStickers(list: Roll[]) {
    if (!project || !list.length) return
    openPrint(`Stickers — ${project.name} (${list.length})`,
      list.map(r => stickerHtml(r, project)).join(""), stickerCss(lblW, lblH))
    const ids = new Set(list.filter(r => !r.printed).map(r => r.id))
    if (!ids.size) return
    const { error } = await db.from("rolls").update({ printed: true }).in("id", [...ids])
    if (!error) setRolls(p => p.map(r => ids.has(r.id) ? { ...r, printed: true } : r))
  }

  // ── SHIPMENTS ──
  function newShipmentDraft(): Shipment {
    const plan = prog.map(x => ({ textile: x.name, meters: Math.max(0, x.ordered - x.loaded) })).filter(x => x.meters > 0)
    return { id: 0, projectId: pid ?? 0, number: pShips.reduce((m, s) => Math.max(m, s.number), 0) + 1,
      date: today(), truck: "", driver: "", notes: "", status: "open", plan }
  }
  async function saveShipment() {
    if (!shipForm || !pid) return
    const row: Shipment = { ...shipForm, id: shipForm.id || newId(), projectId: pid,
      plan: shipForm.plan.filter(l => l.textile.trim()).map(l => ({ textile: l.textile.trim(), meters: Number(l.meters) || 0 })) }
    if (await save("shipments", row)) {
      setShipments(p => p.some(x => x.id === row.id) ? p.map(x => x.id === row.id ? row : x) : [...p, row])
      if (!shipForm.id) { setScanShipId(row.id); setTab("scan") }
      setShipForm(null)
    }
  }
  async function deleteShipment(s: Shipment) {
    const n = rolls.filter(r => r.shipmentId === s.id).length
    if (n) { alert(`Shipment ${s.number} has ${n} rolls loaded. Remove them first (or keep the shipment).`); return }
    if (!window.confirm(`Delete empty shipment ${s.number} (${s.date})?\n\nThis cannot be undone.`)) return
    if (await remove("shipments", s.id)) setShipments(p => p.filter(x => x.id !== s.id))
  }
  function shipStats(s: Shipment) {
    const sr = rolls.filter(r => r.shipmentId === s.id)
    const names = new Map<string, string>()
    for (const l of s.plan) names.set(norm(l.textile), l.textile)
    for (const r of sr) if (!names.has(norm(r.textile))) names.set(norm(r.textile), r.textile)
    const lines = [...names.values()].map(name => {
      const rr = sr.filter(r => norm(r.textile) === norm(name))
      return { name, plan: s.plan.find(l => norm(l.textile) === norm(name))?.meters ?? 0,
        loaded: rr.reduce((a, r) => a + r.meters, 0), rolls: rr.length }
    })
    return { rolls: sr, lines, meters: sr.reduce((a, r) => a + r.meters, 0) }
  }
  async function setShipStatus(s: Shipment, status: "open" | "closed") {
    if (status === "closed") {
      const st = shipStats(s)
      const short = st.lines.filter(l => l.plan > 0 && l.loaded < l.plan)
      const msg = short.length
        ? `⚠️ Less than planned is loaded:\n${short.map(l => `• ${l.name}: ${fmtM(l.loaded)} / ${fmtM(l.plan)}m`).join("\n")}\n\nClose shipment ${s.number} anyway?`
        : `Close shipment ${s.number}? (${st.rolls.length} rolls · ${fmtM(st.meters)}m)`
      if (!window.confirm(msg)) return
    }
    const row = { ...s, status, closedAt: status === "closed" ? new Date().toISOString() : null }
    if (await save("shipments", row)) setShipments(p => p.map(x => x.id === s.id ? row : x))
  }

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

  async function processCode(raw: string) {
    const code = raw.trim().toUpperCase().replace(/\s+/g, "")
    if (!code) return
    const now = Date.now()
    if (code === lastScan.current.code && now - lastScan.current.t < 2500) return   // camera sees the same sticker many times
    lastScan.current = { code, t: now }
    const { rolls: R, shipments: SH, scanShipId: sid } = live.current
    const ship = SH.find(s => s.id === sid)
    if (!ship) return say(false, "Pick or create a shipment first")
    if (ship.status === "closed") return say(false, `Shipment ${ship.number} is closed — reopen it to add rolls`)
    const roll = R.find(r => r.code === code)
    if (!roll) return say(false, `Unknown sticker: ${code}`)
    if (roll.projectId !== ship.projectId) {
      const other = projects.find(p => p.id === roll.projectId)
      return say(false, `Roll belongs to another project${other ? ` (${other.name})` : ""} — don't load it`)
    }
    if (roll.voided) return say(false, `Roll #${roll.rollNo} was CANCELLED — don't load it`)
    if (roll.shipmentId === ship.id) return say(false, `Already scanned: roll #${roll.rollNo}`)
    if (roll.shipmentId != null) {
      const other = SH.find(s => s.id === roll.shipmentId)
      return say(false, `Roll #${roll.rollNo} was already shipped in shipment ${other?.number ?? "?"}`)
    }
    const row = { ...roll, shipmentId: ship.id }
    setRolls(p => p.map(x => x.id === roll.id ? row : x))
    const { error } = await db.from("rolls").update({ shipmentId: ship.id }).eq("id", roll.id)
    if (error) {
      setRolls(p => p.map(x => x.id === roll.id ? roll : x))
      return say(false, `Not saved — check internet. (${error.message})`)
    }
    setUndoStack(u => [...u, roll.id])
    say(true, `✓ Roll #${roll.rollNo} · ${roll.textile} · ${fmtM(roll.meters)}m`)
  }
  async function unload(r: Roll) {
    const row = { ...r, shipmentId: null }
    setRolls(p => p.map(x => x.id === r.id ? row : x))
    const { error } = await db.from("rolls").update({ shipmentId: null }).eq("id", r.id)
    if (error) { setRolls(p => p.map(x => x.id === r.id ? r : x)); setErr(`Couldn't remove: ${error.message}`); return }
    setUndoStack(u => u.filter(id => id !== r.id))
    lastScan.current = { code: "", t: 0 }
  }
  async function undoLast() {
    const id = undoStack[undoStack.length - 1]
    const r = rolls.find(x => x.id === id)
    if (r && r.shipmentId != null) { await unload(r); say(true, `↩ Removed roll #${r.rollNo} from the truck`) }
    else setUndoStack(u => u.slice(0, -1))
  }

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
      const sc = new lib.Html5Qrcode("dtx-reader", {
        formatsToSupport: [F.CODE_128], verbose: false,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      })
      scannerRef.current = sc
      await sc.start({ facingMode: "environment" },
        { fps: 12, qrbox: (vw: number, vh: number) => ({ width: Math.floor(vw * 0.9), height: Math.floor(Math.min(vh * 0.45, vw * 0.35)) }) },
        (text: string) => { processCode(text) }, () => { /* no code in frame */ })
      setCamOn(true)
    } catch (e) {
      scannerRef.current = null
      setCamErr(String(e instanceof Error ? e.message : e).includes("Permission")
        ? "Camera permission was refused. Allow camera access for this site in the browser settings, then try again."
        : `Camera couldn't start: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  async function stopCam() {
    const sc = scannerRef.current
    scannerRef.current = null
    setCamOn(false)
    if (sc) { try { await sc.stop(); sc.clear() } catch { /* already stopped */ } }
  }

  // ── DOCUMENTS ──
  function docHeader(titleEn: string, titleAr: string, s: Shipment) {
    const p = project!
    return `<div class="hd">
  <img src="${LOGO}" class="lg"/>
  <div class="tt"><div class="en">${titleEn}</div><div class="ar">${titleAr}</div></div>
</div>
<table class="meta">
  <tr><th>Shipment No. · رقم الشحنة</th><td>${s.number}</td><th>Date · التاريخ</th><td>${esc(s.date)}</td></tr>
  <tr><th>Customer · العميل</th><td dir="auto">${esc(p.customer || "—")}</td><th>Project · المشروع</th><td dir="auto">${esc(p.name)}</td></tr>
  <tr><th>Truck No. · رقم السيارة</th><td dir="auto">${esc(s.truck || "—")}</td><th>Driver · السائق</th><td dir="auto">${esc(s.driver || "—")}</td></tr>
</table>`
  }
  const docCss = `
.page{max-width:190mm;margin:0 auto;padding:12mm 10mm;font-size:12px}
@page{size:A4;margin:10mm}
@media print{.page{padding:0;max-width:none}}
.hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:12px}
.lg{height:30px}
.tt{text-align:right}.tt .en{font-size:20px;font-weight:800;letter-spacing:1px}.tt .ar{font-size:18px;font-weight:700}
table{width:100%;border-collapse:collapse}
.meta{margin-bottom:14px}.meta th{text-align:left;background:#f2f2f2;width:22%;font-size:11px}
.meta th,.meta td{border:1px solid #bbb;padding:6px 8px}
.list th{background:#222;color:#fff;padding:7px 8px;font-size:11px;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.list td{border-bottom:1px solid #ddd;padding:6px 8px}
.list th.num{text-align:right}
.list tr.sub td{background:#f2f2f2;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.list tr.tot td{border-top:2px solid #000;font-weight:800;font-size:13px}
.num{text-align:right;font-variant-numeric:tabular-nums}
h3{font-size:13px;margin:16px 0 6px}
.chips{display:flex;flex-wrap:wrap;gap:4px}.chips span{border:1px solid #bbb;border-radius:4px;padding:2px 6px;font-size:11px}
.sig{display:flex;justify-content:space-between;margin-top:40px;gap:20px}
.sig div{flex:1;text-align:center;font-size:11px}.sig .ln{border-bottom:1px solid #000;height:36px;margin-bottom:6px}
.foot{margin-top:24px;border-top:1px solid #bbb;padding-top:8px;font-size:10px;color:#444;display:flex;justify-content:space-between}
.made{font-weight:800;letter-spacing:1px}
`
  function groupByTextile(list: Roll[]) {
    const g = new Map<string, { name: string; rolls: Roll[] }>()
    for (const r of [...list].sort((a, b) => a.rollNo - b.rollNo)) {
      const k = norm(r.textile)
      if (!g.has(k)) g.set(k, { name: r.textile, rolls: [] })
      g.get(k)!.rolls.push(r)
    }
    return [...g.values()]
  }
  function exportDeliveryNote(s: Shipment) {
    const st = shipStats(s); const groups = groupByTextile(st.rolls)
    const summary = groups.map(g => `<tr><td dir="auto">${esc(g.name)}</td><td class="num">${g.rolls.length}</td><td class="num">${fmtM(g.rolls.reduce((a, r) => a + r.meters, 0))} m</td></tr>`).join("")
    const detail = groups.map(g => `<h3 dir="auto">${esc(g.name)} — ${g.rolls.length} rolls · رول</h3>
<div class="chips">${g.rolls.map(r => `<span>#${r.rollNo} · ${fmtM(r.meters)}m</span>`).join("")}</div>`).join("")
    openPrint(`Delivery Note — Shipment ${s.number}`, `<div class="page">
${docHeader("DELIVERY NOTE", "إذن تسليم", s)}
<table class="list"><tr><th>Textile · القماش</th><th class="num">Rolls · عدد الرولات</th><th class="num">Meters · الأمتار</th></tr>
${summary}
<tr class="tot"><td>TOTAL · الإجمالي</td><td class="num">${st.rolls.length}</td><td class="num">${fmtM(st.meters)} m</td></tr></table>
${detail}
<div class="sig"><div><div class="ln"></div>Delivered by (Deebtex) · المسلِّم</div><div><div class="ln"></div>Driver · السائق</div><div><div class="ln"></div>Received by · المستلِم</div></div>
<div class="foot"><span>Deebtex · Alexandria, Egypt</span><span class="made">MADE IN EGYPT · صنع في مصر</span></div>
</div>`, docCss)
  }
  function exportPackingList(s: Shipment) {
    const st = shipStats(s); const groups = groupByTextile(st.rolls)
    let i = 0
    const body = groups.map(g => {
      const rowsHtml = g.rolls.map(r => `<tr><td>${++i}</td><td>${r.rollNo}</td><td style="font-family:'Courier New',monospace">${r.code}</td><td dir="auto">${esc(r.textile)}</td><td>140 cm</td><td class="num">${fmtM(r.meters)}</td></tr>`).join("")
      return rowsHtml + `<tr class="sub"><td colspan="3"></td><td dir="auto">Subtotal · إجمالي ${esc(g.name)}</td><td>${g.rolls.length} rolls</td><td class="num">${fmtM(g.rolls.reduce((a, r) => a + r.meters, 0))}</td></tr>`
    }).join("")
    openPrint(`Packing List — Shipment ${s.number}`, `<div class="page">
${docHeader("PACKING LIST", "قائمة التعبئة", s)}
<table class="list">
<tr><th>#</th><th>Roll No. · رقم الرول</th><th>Barcode · الباركود</th><th>Textile · القماش</th><th>Width · العرض</th><th class="num">Meters · الأمتار</th></tr>
${body}
<tr class="tot"><td colspan="4">GRAND TOTAL · الإجمالي الكلي</td><td>${st.rolls.length} rolls · رول</td><td class="num">${fmtM(st.meters)} m</td></tr>
</table>
<div class="sig"><div><div class="ln"></div>Packed by · تم التعبئة بواسطة</div><div><div class="ln"></div>Checked by · تمت المراجعة بواسطة</div></div>
<div class="foot"><span>Exporter · المصدِّر: Deebtex · Alexandria, Egypt</span><span class="made">MADE IN EGYPT · صنع في مصر</span></div>
</div>`, docCss)
  }

  // ─── RENDER ────────────────────────────────────────────────
  if (loading) return <div style={st.pad}><div style={st.empty}>Loading rolls…</div></div>

  // shipment being loaded: the one picked, otherwise the newest open one
  const scanShip = pShips.find(s => s.id === scanShipId) ?? pShips.filter(s => s.status === "open").slice(-1)[0] ?? null
  live.current = { rolls, shipments, scanShipId: scanShip?.id ?? null }

  const filteredRolls = pRolls.filter(r => !rollFilter || norm(r.textile).includes(norm(rollFilter)) || r.code.includes(rollFilter.toUpperCase()) || String(r.rollNo) === rollFilter.trim())
  const unprinted = pRolls.filter(r => !r.printed && !r.voided)

  return (
    <div style={st.pad} className="dtx-viewpad">
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
        {project && <button style={st.btn} onClick={() => setProjForm({ ...project, targets: project.targets.length ? project.targets.map(t => ({ ...t })) : [{ textile: "", meters: 0 }] })}>✏️ Edit</button>}
        <button style={st.btnP} onClick={() => setProjForm(blankProject())}>+ New project</button>
        {project && <button style={{ ...st.btn, color: "#E24B4A", marginLeft: "auto" }} onClick={() => deleteProject(project)}>🗑</button>}
      </div>

      {!project && (
        <div style={{ ...st.card, padding: 32, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🏷</div>
          <div style={{ fontWeight: 600, color: "#333", marginBottom: 4 }}>Pick or create a project</div>
          <div style={{ fontSize: 13 }}>A project is one big order (e.g. a hotel). Add how many meters of each textile were ordered, then print a sticker for every roll.</div>
        </div>
      )}

      {project && <>
        {/* ORDER PROGRESS */}
        <div style={st.card}>
          <div style={st.head}><b>{project.name}</b><span style={st.sub}>{project.customer}</span>
            <span style={{ ...st.sub, marginLeft: "auto" }}>{pRolls.filter(r => !r.voided).length} rolls · {pShips.length} shipments</span></div>
          <div style={{ padding: "10px 16px 14px" }}>
            {prog.length === 0 && <div style={st.empty}>Edit the project to add the ordered meters per textile.</div>}
            {prog.map(x => {
              const max = Math.max(x.ordered, x.made, 1)
              return (
                <div key={x.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 8, flexWrap: "wrap" }}>
                    <span dir="auto" style={{ fontWeight: 600 }}>{x.name}</span>
                    <span style={{ color: "#666" }}>
                      made <b>{fmtM(x.made)}</b> · shipped <b style={{ color: "#166534" }}>{fmtM(x.loaded)}</b>
                      {x.ordered ? <> / {fmtM(x.ordered)}m ordered</> : " m"}
                      {x.ordered > 0 && x.loaded >= x.ordered && " ✅"}
                    </span>
                  </div>
                  <div style={{ height: 7, background: "#eee", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, x.made / max * 100)}%`, background: "#C9C5F2" }} />
                    <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, x.loaded / max * 100)}%`, background: "#639922" }} />
                  </div>
                </div>
              )
            })}
            {prog.length > 0 && <div style={{ fontSize: 11, color: "#999" }}><span style={{ color: "#8f88e0" }}>■</span> made &nbsp; <span style={{ color: "#639922" }}>■</span> shipped</div>}
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([["rolls", "🏷 Rolls & stickers"], ["shipments", "🚚 Shipments"], ["scan", "📷 Scan"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); if (k !== "scan") stopCam() }}
              style={{ ...st.btn, flex: 1, padding: "9px 6px", fontWeight: 600, ...(tab === k ? { background: "#7F77DD", color: "#fff", border: "none" } : {}) }}>{l}</button>
          ))}
        </div>

        {/* ── ROLLS TAB ── */}
        {tab === "rolls" && <>
          <div style={st.card}>
            <div style={st.head}><b>Add rolls</b><span style={st.sub}>roll number fills in automatically</span></div>
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ flex: 2, minWidth: 180 }}><div style={st.lbl}>Textile</div>
                  <input list="dtx-roll-textiles" style={st.input} value={rTextile} onChange={e => setRTextile(e.target.value)} placeholder="e.g. Layaly" dir="auto" />
                  <datalist id="dtx-roll-textiles">{textileNames.map(n => <option key={n} value={n} />)}</datalist>
                </label>
                <label style={{ flex: 1, minWidth: 110 }}><div style={st.lbl}>Meters</div>
                  <input style={st.input} type="number" min="0" step="0.1" value={rMeters} onChange={e => setRMeters(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addRolls([Number(rMeters)]) }} placeholder="100" />
                </label>
                <button style={st.btnP} onClick={() => addRolls([Number(rMeters)])}>+ Add roll</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label style={{ flex: 1, minWidth: 220 }}><div style={st.lbl}>Or add several rolls of this textile at once — meters separated by commas</div>
                  <input style={st.input} value={rBulk} onChange={e => setRBulk(e.target.value)} placeholder="100, 98, 102.5, 100" />
                </label>
                <button style={st.btn} onClick={() => addRolls(rBulk.split(/[,\s،]+/).map(Number))}>
                  + Add {rBulk.split(/[,\s،]+/).map(Number).filter(n => n > 0).length || ""} rolls
                </button>
              </div>
            </div>
          </div>

          <div style={st.card}>
            <div style={{ ...st.head, flexWrap: "wrap" }}>
              <b>Rolls</b><span style={st.sub}>{pRolls.length}</span>
              <input style={{ ...st.input, width: 150, padding: "5px 9px", fontSize: 12 }} placeholder="Filter…" value={rollFilter} onChange={e => setRollFilter(e.target.value)} dir="auto" />
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#999" }}>Sticker
                  <input type="number" style={st.tiny} value={lblW} onChange={e => setLblW(Number(e.target.value) || 100)} />×
                  <input type="number" style={st.tiny} value={lblH} onChange={e => setLblH(Number(e.target.value) || 75)} />mm</span>
                {sel.size > 0 && <button style={st.btn} onClick={() => printStickers(pRolls.filter(r => sel.has(r.id)))}>🖨 Print selected ({sel.size})</button>}
                <button style={{ ...st.btnP, opacity: unprinted.length ? 1 : 0.5 }} disabled={!unprinted.length} onClick={() => printStickers(unprinted)}>
                  🖨 Print new stickers ({unprinted.length})
                </button>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={st.table}>
                <thead><tr>
                  <th style={st.th}><input type="checkbox" checked={filteredRolls.length > 0 && filteredRolls.every(r => sel.has(r.id))}
                    onChange={e => setSel(e.target.checked ? new Set(filteredRolls.map(r => r.id)) : new Set())} /></th>
                  {["Roll", "Textile", "Meters", "Barcode", "Status", ""].map(h => <th key={h} style={st.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filteredRolls.length === 0 && <tr><td colSpan={7} style={{ ...st.td, color: "#aaa", textAlign: "center", padding: 20 }}>No rolls yet.</td></tr>}
                  {filteredRolls.map(r => {
                    const sh = r.shipmentId != null ? shipments.find(s => s.id === r.shipmentId) : null
                    return (
                      <tr key={r.id} style={{ opacity: r.voided ? 0.5 : 1 }}>
                        <td style={st.td}><input type="checkbox" checked={sel.has(r.id)} onChange={e => setSel(s => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} /></td>
                        <td style={{ ...st.td, fontWeight: 700 }}>#{r.rollNo}</td>
                        <td style={st.td} dir="auto">{r.textile}</td>
                        <td style={{ ...st.td, fontWeight: 600, color: "#534AB7" }}>{fmtM(r.meters)}m</td>
                        <td style={{ ...st.td, fontFamily: "monospace", fontSize: 11, color: "#888" }}>{r.code}{!r.printed && !r.voided && <span style={st.tag}>not printed</span>}</td>
                        <td style={st.td}>
                          {r.voided ? <span style={{ ...st.tag, background: "#FEEBEB", color: "#A32D2D" }}>cancelled</span>
                            : sh ? <span style={{ ...st.tag, background: "#EDFBEE", color: "#166534" }}>🚚 shipment {sh.number}</span>
                            : <span style={{ ...st.tag, background: "#F3F2FD", color: "#534AB7" }}>in store</span>}
                        </td>
                        <td style={{ ...st.td, whiteSpace: "nowrap", textAlign: "right" }}>
                          <button style={st.icon} title="Print sticker" onClick={() => printStickers([r])}>🖨</button>
                          <button style={st.icon} title="Edit" onClick={() => setEditRoll({ ...r })}>✏️</button>
                          <button style={st.icon} title={r.voided ? "Bring back" : "Cancel roll"} onClick={() => toggleVoid(r)}>{r.voided ? "↩" : "⛔"}</button>
                          <button style={{ ...st.icon, color: "#E24B4A" }} title="Delete" onClick={() => deleteRoll(r)}>🗑</button>
                        </td>
                      </tr>
                    )
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
              {pShips.length === 0 && <div style={{ ...st.empty, padding: "20px 0" }}>No shipments yet. Create one when the truck arrives, then scan the rolls.</div>}
              {[...pShips].reverse().map(s => {
                const ss = shipStats(s)
                return (
                  <div key={s.id} style={{ padding: "12px 0", borderBottom: "0.5px solid #f0f0f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14 }}>Shipment {s.number}</b>
                      <span style={{ ...st.tag, ...(s.status === "open" ? { background: "#FEF3C7", color: "#92400E" } : { background: "#EDFBEE", color: "#166534" }) }}>
                        {s.status === "open" ? "loading" : "closed"}</span>
                      <span style={st.sub}>{s.date}{s.truck ? ` · 🚚 ${s.truck}` : ""}{s.driver ? ` · ${s.driver}` : ""}</span>
                      <span style={{ marginLeft: "auto", fontWeight: 600 }}>{ss.rolls.length} rolls · {fmtM(ss.meters)}m</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
                      {ss.lines.map(l => <span key={l.name} style={{ marginRight: 12 }} dir="auto">{l.name}: {fmtM(l.loaded)}{l.plan ? `/${fmtM(l.plan)}` : ""}m</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {s.status === "open"
                        ? <>
                            <button style={st.btnP} onClick={() => { setScanShipId(s.id); setTab("scan") }}>📷 Scan rolls</button>
                            <button style={st.btn} onClick={() => setShipStatus(s, "closed")}>✓ Close shipment</button>
                          </>
                        : <button style={st.btn} onClick={() => setShipStatus(s, "open")}>↩ Reopen</button>}
                      <button style={st.btn} onClick={() => exportDeliveryNote(s)}>📄 Delivery note · إذن تسليم</button>
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

            {scanShip && <>
              {/* camera */}
              <div style={{ ...st.card, padding: 12 }}>
                <div id="dtx-reader" style={{ width: "100%", maxWidth: 520, margin: "0 auto", borderRadius: 10, overflow: "hidden", background: camOn ? "#000" : "transparent" }} />
                <div style={{ display: "flex", gap: 8, marginTop: camOn ? 10 : 0, flexWrap: "wrap" }}>
                  {!camOn
                    ? <button style={{ ...st.btnP, flex: 1, padding: 14, fontSize: 15 }} onClick={startCam} disabled={scanShip.status === "closed"}>📷 Start camera</button>
                    : <button style={{ ...st.btn, flex: 1, padding: 12 }} onClick={stopCam}>■ Stop camera</button>}
                  <button style={{ ...st.btn, padding: 12, opacity: undoStack.length ? 1 : 0.4 }} disabled={!undoStack.length} onClick={undoLast}>↩ Undo last</button>
                </div>
                {camErr && <div style={{ color: "#A32D2D", fontSize: 12, marginTop: 8 }}>{camErr}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <input style={{ ...st.input, fontFamily: "monospace" }} placeholder="Or type / scan code here (DTX000001) + Enter" value={manual}
                    onChange={e => setManual(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { lastScan.current = { code: "", t: 0 }; processCode(manual); setManual("") } }} />
                </div>
                {scanShip.status === "closed" && <div style={{ fontSize: 12, color: "#92400E", marginTop: 8 }}>This shipment is closed. Reopen it from the Shipments tab to add rolls.</div>}
              </div>

              {/* feedback */}
              {fresh && (
                <div style={{ ...st.banner, fontSize: 15, fontWeight: 700, padding: "14px 16px",
                  ...(feedback!.ok ? { background: "#EDFBEE", color: "#166534", borderColor: "#86EFAC" } : { background: "#FEEBEB", color: "#A32D2D", borderColor: "#fca5a5" }) }} dir="auto">
                  {feedback!.ok ? "" : "⛔ "}{feedback!.msg}
                </div>
              )}

              {/* this truck */}
              <div style={st.card}>
                <div style={st.head}><b>Shipment {scanShip.number}</b>
                  <span style={{ marginLeft: "auto", fontSize: 18, fontWeight: 800, color: "#534AB7" }}>{ss!.rolls.length} rolls · {fmtM(ss!.meters)}m</span></div>
                <div style={{ padding: "10px 16px" }}>
                  {ss!.lines.length === 0 && <div style={st.empty}>Scan the first roll…</div>}
                  {ss!.lines.map(l => {
                    const orderLine = prog.find(x => norm(x.name) === norm(l.name))
                    const pct = l.plan ? Math.min(100, l.loaded / l.plan * 100) : 100
                    const done = l.plan > 0 && l.loaded >= l.plan
                    return (
                      <div key={l.name} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, gap: 8, flexWrap: "wrap" }}>
                          <span dir="auto" style={{ fontWeight: 700 }}>{l.name}</span>
                          <span><b style={{ fontSize: 16 }}>{fmtM(l.loaded)}</b>{l.plan ? ` / ${fmtM(l.plan)}m` : "m"} loaded {done ? "✅" : ""} <span style={{ color: "#999" }}>({l.rolls} rolls)</span></span>
                        </div>
                        <div style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden", margin: "4px 0 2px" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: done ? "#639922" : "#7F77DD" }} />
                        </div>
                        {orderLine && orderLine.ordered > 0 && <div style={{ fontSize: 11, color: "#999" }}>Whole order: {fmtM(orderLine.loaded)} / {fmtM(orderLine.ordered)}m shipped</div>}
                      </div>
                    )
                  })}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    {scanShip.status === "open" && <button style={st.btnP} onClick={async () => { await stopCam(); await setShipStatus(scanShip, "closed") }}>✓ Close shipment</button>}
                    <button style={st.btn} onClick={() => exportDeliveryNote(scanShip)}>📄 Delivery note</button>
                    <button style={st.btn} onClick={() => exportPackingList(scanShip)}>📄 Packing list</button>
                  </div>
                </div>
              </div>

              {/* loaded rolls */}
              <div style={st.card}>
                <div style={st.head}><b>Loaded rolls</b><span style={st.sub}>latest first</span></div>
                <div style={{ padding: "4px 16px 10px" }}>
                  {[...ss!.rolls].sort((a, b) => (undoStack.indexOf(b.id)) - (undoStack.indexOf(a.id)) || b.rollNo - a.rollNo).map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "0.5px solid #f3f3f3", fontSize: 13 }}>
                      <b style={{ width: 44 }}>#{r.rollNo}</b>
                      <span style={{ flex: 1 }} dir="auto">{r.textile}</span>
                      <span style={{ fontWeight: 600 }}>{fmtM(r.meters)}m</span>
                      {scanShip.status === "open" && (
                        <button style={{ ...st.icon, color: "#E24B4A" }} title="Remove from truck"
                          onClick={() => { if (window.confirm(`Remove roll #${r.rollNo} from shipment ${scanShip.number}?`)) unload(r) }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>}
            {!scanShip && <div style={{ ...st.card, padding: 24, textAlign: "center", color: "#888", fontSize: 13 }}>Create a shipment when the truck arrives, then start scanning.</div>}
          </>
        })()}
      </>}

      {/* ── PROJECT FORM ── */}
      {projForm && (
        <Overlay title={projForm.id ? "Edit project" : "New project"} onClose={() => setProjForm(null)}>
          <label><div style={st.lbl}>Project name</div>
            <input style={st.input} value={projForm.name} onChange={e => setProjForm({ ...projForm, name: e.target.value })} placeholder="e.g. Flamingo hotel order" dir="auto" autoFocus /></label>
          <label><div style={st.lbl}>Customer (printed on stickers)</div>
            <input style={st.input} value={projForm.customer} onChange={e => setProjForm({ ...projForm, customer: e.target.value })} placeholder="e.g. PrideInn Flamingo Beach Resort" dir="auto" /></label>
          <div><div style={st.lbl}>Ordered meters per textile</div>
            {projForm.targets.map((t, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input style={{ ...st.input, flex: 2 }} value={t.textile} placeholder="Textile name" dir="auto"
                  onChange={e => setProjForm({ ...projForm, targets: projForm.targets.map((x, j) => j === i ? { ...x, textile: e.target.value } : x) })} />
                <input style={{ ...st.input, flex: 1 }} type="number" min="0" value={t.meters || ""} placeholder="meters"
                  onChange={e => setProjForm({ ...projForm, targets: projForm.targets.map((x, j) => j === i ? { ...x, meters: Number(e.target.value) } : x) })} />
                <button style={{ ...st.icon, color: "#E24B4A" }} onClick={() => setProjForm({ ...projForm, targets: projForm.targets.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button style={st.btn} onClick={() => setProjForm({ ...projForm, targets: [...projForm.targets, { textile: "", meters: 0 }] })}>+ Add textile</button>
          </div>
          <label><div style={st.lbl}>Notes (optional)</div>
            <input style={st.input} value={projForm.notes} onChange={e => setProjForm({ ...projForm, notes: e.target.value })} dir="auto" /></label>
          <button style={{ ...st.btnP, padding: 11 }} onClick={saveProject}>{projForm.id ? "Save changes" : "Create project"}</button>
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
            {shipForm.plan.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input list="dtx-roll-textiles" style={{ ...st.input, flex: 2 }} value={l.textile} dir="auto"
                  onChange={e => setShipForm({ ...shipForm, plan: shipForm.plan.map((x, j) => j === i ? { ...x, textile: e.target.value } : x) })} />
                <input style={{ ...st.input, flex: 1 }} type="number" min="0" value={l.meters || ""} placeholder="meters"
                  onChange={e => setShipForm({ ...shipForm, plan: shipForm.plan.map((x, j) => j === i ? { ...x, meters: Number(e.target.value) } : x) })} />
                <button style={{ ...st.icon, color: "#E24B4A" }} onClick={() => setShipForm({ ...shipForm, plan: shipForm.plan.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button style={st.btn} onClick={() => setShipForm({ ...shipForm, plan: [...shipForm.plan, { textile: "", meters: 0 }] })}>+ Add textile</button>
          </div>
          <label><div style={st.lbl}>Notes (optional)</div><input style={st.input} value={shipForm.notes} onChange={e => setShipForm({ ...shipForm, notes: e.target.value })} dir="auto" /></label>
          <button style={{ ...st.btnP, padding: 11 }} onClick={saveShipment}>{shipForm.id ? "Save changes" : "Create & start scanning"}</button>
        </Overlay>
      )}

      {/* ── EDIT ROLL ── */}
      {editRoll && (
        <Overlay title={`Edit roll #${editRoll.rollNo}`} onClose={() => setEditRoll(null)}>
          <label><div style={st.lbl}>Textile</div><input list="dtx-roll-textiles" style={st.input} value={editRoll.textile} onChange={e => setEditRoll({ ...editRoll, textile: e.target.value })} dir="auto" /></label>
          <label><div style={st.lbl}>Meters</div><input style={st.input} type="number" min="0" step="0.1" value={editRoll.meters || ""} onChange={e => setEditRoll({ ...editRoll, meters: Number(e.target.value) })} /></label>
          <div style={{ fontSize: 12, color: "#888" }}>The barcode stays the same. If you change the meters or textile, the roll goes back to "not printed" so you remember to reprint its sticker.</div>
          <button style={{ ...st.btnP, padding: 11 }} onClick={saveEditRoll}>Save</button>
        </Overlay>
      )}
    </div>
  )
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 12 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 12, width: 480, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", padding: 20, display: "grid", gap: 12 }} onClick={e => e.stopPropagation()}>
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
  td:     { padding: "8px 10px", borderBottom: "0.5px solid #f5f5f5" },
  tag:    { display: "inline-block", fontSize: 10, fontWeight: 600, borderRadius: 4, padding: "1px 6px", marginLeft: 6, background: "#f3f3f3", color: "#999" },
}

// Deebtex logo (black, for printing) — embedded so stickers print without extra files
const LOGO = "data:image/png;base64,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"
