// ============================================================
//  DEEBTEX — App.tsx  (single file, drop into src/App.tsx)
//  Storage: Supabase (shared across all computers, real-time)
// ============================================================
import { useEffect, useMemo, useState, useRef } from "react"
import type { CSSProperties } from "react"
import { createClient } from "@supabase/supabase-js"

// ─── SUPABASE CLIENT ─────────────────────────────────────────
// These values come from your .env file (see SETUP.md)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── TYPES ───────────────────────────────────────────────────
type MachineCategory =
  | "Electronic Double" | "Electronic 4" | "Mechanical 4"
  | "Mechanical Double 280" | "Mechanical Double 140"
type Priority   = "High" | "Normal" | "Low"
type WarpStatus = "not-started" | "on-machine" | "done"
type View = "dashboard" | "orders" | "machines" | "textiles" | "analytics" | "history" | "suggestions"

// warpOrder: per-machine ordered list of warpKeys — controls which warp group runs first
// key = machineId, value = array of warpKeys in display order
type WarpOrder = Record<number, string[]>

type Machine = {
  id: number; name: string; category: MachineCategory; capacity: number
  outOfOrder?: boolean   // true = machine is down, orders reassigned automatically
}
type Order   = {
  id: number; textile: string; color: string; fabricType: string
  quantity: number; deadline: string; priority: Priority
  machineCategories: MachineCategory[]
  warpStatus: WarpStatus; notes: string
  orderNumber?: string   // branch reference e.g. "ORD-2024-001"
  forcedMachineId?: number
  warpClosed?: boolean
  warpGroupId?: string
}
// A saved textile definition — the "database" entry
type Textile = {
  id: number
  name: string          // e.g. "Blue Gabardine"
  color: string         // e.g. "Navy"
  fabricType: string    // e.g. "Wool"
  machineCategories: MachineCategory[]
  notes: string
}

const CATS: MachineCategory[] = [
  "Electronic Double","Electronic 4","Mechanical 4",
  "Mechanical Double 280","Mechanical Double 140",
]
const DEFAULT_CAP = 1000

// ─── SUPABASE HELPERS ────────────────────────────────────────
// Fetches ALL rows using pagination — Supabase default limit is 1000 rows.
// This loops until every row is loaded so no orders are ever silently dropped.
async function dbLoadRaw<T>(table: string): Promise<T[]> {
  const PAGE = 1000
  let all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order("id")
      .range(from, from + PAGE - 1)
    if (error) { console.error(`dbLoad ${table}:`, error.message); break }
    if (!data || data.length === 0) break
    all = [...all, ...(data as T[])]
    if (data.length < PAGE) break   // last page
    from += PAGE
  }
  return all
}

// Orders need sanitization — boolean columns can come back as null from Supabase
// if the column was added after rows were created (default wasn't backfilled)
function sanitizeOrder(row: Record<string, unknown>): Order {
  return {
    id:                Number(row.id),
    textile:           String(row.textile ?? ""),
    color:             String(row.color ?? ""),
    fabricType:        String(row.fabricType ?? ""),
    quantity:          Number(row.quantity ?? 0),
    deadline:          String(row.deadline ?? ""),
    priority:          (row.priority as Priority) ?? "Normal",
    machineCategories: (row.machineCategories as MachineCategory[]) ?? [],
    warpStatus:        (row.warpStatus as WarpStatus) ?? "not-started",
    notes:             String(row.notes ?? ""),
    orderNumber:       row.orderNumber ? String(row.orderNumber) : undefined,
    forcedMachineId:   row.forcedMachineId != null ? Number(row.forcedMachineId) : undefined,
    warpClosed:        row.warpClosed === true,
  }
}

function sanitizeMachine(row: Record<string, unknown>): Machine {
  return {
    id:         Number(row.id),
    name:       String(row.name ?? ""),
    category:   (row.category as MachineCategory) ?? "Electronic Double",
    capacity:   Number(row.capacity ?? 1000),
    outOfOrder: row.outOfOrder === true,
  }
}

async function dbLoadOrders(): Promise<Order[]> {
  const rows = await dbLoadRaw<Record<string, unknown>>("orders")
  return rows.map(sanitizeOrder)
}

async function dbLoadMachines(): Promise<Machine[]> {
  const rows = await dbLoadRaw<Record<string, unknown>>("machines")
  return rows.map(sanitizeMachine)
}

async function dbLoadTextiles(): Promise<Textile[]> {
  return dbLoadRaw<Textile>("textiles")
}

// Upsert with retry + visible error + localStorage backup
async function dbUpsert(table: string, row: Record<string, unknown>) {
  // always write to localStorage backup first — this never fails
  try {
    const key = `dtx_backup_${table}`
    const existing: Record<string, unknown>[] = JSON.parse(localStorage.getItem(key) || "[]")
    const idx = existing.findIndex(r => r.id === row.id)
    if (idx >= 0) existing[idx] = row
    else existing.push(row)
    localStorage.setItem(key, JSON.stringify(existing))
  } catch {}

  // try Supabase — retry once if it fails
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await db.from(table).upsert(row, { onConflict: "id" })
    if (!error) return   // success
    console.error(`dbUpsert ${table} attempt ${attempt}:`, error.message, error.details, row)
    if (attempt === 2) {
      // second failure — show a visible warning so it's never silent
      console.warn(`⚠️ SAVE FAILED for ${table} id=${row.id}. Data is in localStorage backup.`)
    }
    await new Promise(r => setTimeout(r, 500))   // wait 500ms before retry
  }
}

// Delete with localStorage backup sync
async function dbDelete(table: string, id: number) {
  // remove from localStorage backup
  try {
    const key = `dtx_backup_${table}`
    const existing: Record<string, unknown>[] = JSON.parse(localStorage.getItem(key) || "[]")
    localStorage.setItem(key, JSON.stringify(existing.filter(r => r.id !== id)))
  } catch {}

  const { error } = await db.from(table).delete().eq("id", id)
  if (error) console.error(`dbDelete ${table}:`, error.message)
}

// ─── SCHEDULER ───────────────────────────────────────────────
const PRI: Record<string,number> = { High:3, Normal:2, Low:1 }

// warpKey: the physical warp identity — fabric + color only.
// Sealing is handled in the scheduler by checking warpClosed directly.
function warpKey(o: Order) {
  return `${o.fabricType}||${o.color}`
}
// key for the warp groups card: warpKey + machine
function machineWarpKey(o: Order, machineId: number) {
  return `${warpKey(o)}||m${machineId}`
}
function calcWarp(q: number) { return Math.ceil(q * 1.1) }
function machineLoad(sch: Record<number,Order[]>, id: number) {
  return sch[id]?.reduce((s,o) => s + o.quantity, 0) ?? 0
}
function machineStatus(load: number, cap: number) {
  const r = load / cap
  if (r > 1)   return "OVERLOADED"
  if (r > 0.7) return "BUSY"
  if (r > 0)   return "ACTIVE"
  return "IDLE"
}
function loadPct(load: number, cap: number) { return Math.min(Math.round(load/cap*100), 100) }

function buildSchedule(orders: Order[], machines: Machine[]) {
  const map: Record<number, Order[]> = {}
  machines.forEach(m => { map[m.id] = [] })

  const activeMachines = machines.filter(m => !m.outOfOrder)
  const locked = new Set<number>()

  // ── STEP 1: forced assignments first
  for (const o of orders) {
    if (o.warpStatus === "done") continue
    if (o.forcedMachineId !== undefined && map[o.forcedMachineId] !== undefined) {
      map[o.forcedMachineId].push(o)
      locked.add(o.id)
    }
  }

  // ── STEP 2: lock on-machine orders to their machine
  for (const o of orders) {
    if (locked.has(o.id) || o.warpStatus === "done") continue
    if (o.warpStatus === "on-machine") {
      const compat = machines.filter(m => o.machineCategories.includes(m.category))
      if (!compat.length) continue
      // if already placed (same machine has same warpClosed group), use that machine
      const existing = compat.find(m =>
        map[m.id].some(x => warpKey(x) === warpKey(o) && x.warpClosed === o.warpClosed)
      ) ?? compat[0]
      map[existing.id].push(o)
      locked.add(o.id)
    }
  }

  // ── Build a set of sealed slots: "fabricColor||machineId" combos that are CLOSED.
  // A new not-started order must NOT receive a same-warp bonus if the only matching
  // orders on that machine are sealed (warpClosed = true).
  const sealedSlots = new Set<string>()
  for (const m of machines) {
    const warpCounts: Record<string, { open: number; closed: number }> = {}
    for (const o of map[m.id]) {
      const wk = warpKey(o)
      if (!warpCounts[wk]) warpCounts[wk] = { open: 0, closed: 0 }
      if (o.warpClosed) warpCounts[wk].closed++
      else warpCounts[wk].open++
    }
    for (const [wk, counts] of Object.entries(warpCounts)) {
      // slot is sealed if ALL matching orders on this machine are closed (none open)
      if (counts.closed > 0 && counts.open === 0) {
        sealedSlots.add(`${wk}||${m.id}`)
      }
    }
  }

  // ── STEP 3: re-optimize all not-started orders
  const pending = orders
    .filter(o => !locked.has(o.id) && o.warpStatus === "not-started")
    .sort((a, b) => {
      const flexDiff = a.machineCategories.length - b.machineCategories.length
      if (flexDiff !== 0) return flexDiff
      const priDiff = PRI[b.priority] - PRI[a.priority]
      if (priDiff !== 0) return priDiff
      return warpKey(a).localeCompare(warpKey(b))
    })

  function score(m: Machine, o: Order): number {
    const q   = map[m.id]
    const ld  = q.reduce((s, x) => s + x.quantity, 0)
    const wk  = warpKey(o)
    // Only give same-warp bonus if the slot is NOT sealed
    const slotSealed = sealedSlots.has(`${wk}||${m.id}`)
    const sameWarp = !slotSealed && q.some(x => warpKey(x) === wk)
    const cap = m.capacity ?? DEFAULT_CAP
    const overload = ld > cap ? (ld - cap) * 2 : 0
    return (sameWarp ? 10000 : 0) - ld - overload
  }

  for (const o of pending) {
    const compat = activeMachines.filter(m => o.machineCategories.includes(m.category))
    if (!compat.length) continue
    const best = compat.reduce((b, m) => score(m, o) > score(b, o) ? m : b)
    map[best.id].push(o)
  }

  // ── STEP 4: sort each machine's queue
  // on-machine orders first (already running), then not-started grouped by warpKey
  // within each warp group: highest priority first, then earliest deadline
  for (const m of machines) {
    const q = map[m.id]
    if (q.length < 2) continue

    // separate on-machine (locked/running) from not-started
    const running    = q.filter(o => o.warpStatus === "on-machine")
    const notStarted = q.filter(o => o.warpStatus !== "on-machine")

    // group not-started by warpKey, sort groups by: highest priority in group, then earliest deadline
    const warpGroupMap: Record<string, Order[]> = {}
    for (const o of notStarted) {
      const wk = warpKey(o)
      if (!warpGroupMap[wk]) warpGroupMap[wk] = []
      warpGroupMap[wk].push(o)
    }
    // sort within each group
    for (const wk of Object.keys(warpGroupMap)) {
      warpGroupMap[wk].sort((a, b) => {
        const pd = PRI[b.priority] - PRI[a.priority]
        if (pd !== 0) return pd
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
        if (a.deadline) return -1
        if (b.deadline) return 1
        return 0
      })
    }
    // sort groups themselves: group with highest-priority order first, then earliest deadline in group
    const sortedGroups = Object.values(warpGroupMap).sort((ga, gb) => {
      const pa = Math.max(...ga.map(o => PRI[o.priority]))
      const pb = Math.max(...gb.map(o => PRI[o.priority]))
      if (pa !== pb) return pb - pa
      const da = ga.map(o => o.deadline).filter(Boolean).sort()[0] ?? "9999"
      const deadlineB = gb.map(o => o.deadline).filter(Boolean).sort()[0] ?? "9999"
      return da.localeCompare(deadlineB)
    })

    map[m.id] = [...running, ...sortedGroups.flat()]
  }

  return map
}

// ─── COLOR HELPERS ───────────────────────────────────────────
function priColor(p: string)     { return p==="High"?"#E24B4A":p==="Normal"?"#378ADD":"#9ca3af" }
function statColor(s: string)    { return s==="OVERLOADED"?"#E24B4A":s==="BUSY"?"#378ADD":s==="ACTIVE"?"#639922":"#9ca3af" }
function warpColor(s: WarpStatus){ return s==="on-machine"?"#639922":s==="done"?"#378ADD":"#9ca3af" }
function dlWarn(d: string)       {
  if (!d) return "none"
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  return diff < 3 ? "urgent" : diff < 7 ? "soon" : "ok"
}

// ─── GLOBAL CSS ──────────────────────────────────────────────
if (!document.getElementById("dtx-css")) {
  const t = document.createElement("style")
  t.id = "dtx-css"
  t.textContent = `
    *{box-sizing:border-box}body{margin:0}
    #root{width:100%;max-width:100%;border:none;min-height:100vh}
    input,select,textarea,button{font-family:inherit}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-thumb{background:#d0d0d0;border-radius:3px}
  `
  document.head.appendChild(t)
}

// ─── SHARED UI ───────────────────────────────────────────────
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.mHead}>
          <span style={S.mTitle}>{title}</span>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.mBody}>{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

function Bar({ pct, color, h=4 }: { pct:number; color:string; h?:number }) {
  return (
    <div style={{ height:h, background:"#f0f0f0", borderRadius:2, overflow:"hidden", margin:"4px 0" }}>
      <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:2, transition:"width .3s" }} />
    </div>
  )
}

function Badge({ text, color }: { text:string; color:string }) {
  return (
    <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:20,
      fontSize:11, fontWeight:500, color, background:color+"22" }}>{text}</span>
  )
}

// ─── AUTOCOMPLETE INPUT ──────────────────────────────────────
// Reusable input with dropdown suggestions from a known list.
// Supports Arabic and any language. Matches anywhere in the string.
// Purely for convenience — doesn't affect any logic or scheduling.
type ACProps = {
  value: string
  onChange: (v: string) => void
  suggestions: string[]   // all known values to match against
  placeholder?: string
}
function AutocompleteInput({ value, onChange, suggestions, placeholder }: ACProps) {
  const [open, setOpen] = useState(false)

  const matches = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, 8)  // show recent when empty
    const q = value.toLowerCase()
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8)
  }, [value, suggestions])

  const showDropdown = open && matches.length > 0 && (
    // hide if current value exactly matches a suggestion (already picked)
    !matches.some(m => m.toLowerCase() === value.toLowerCase()) || value.trim() === ""
  )

  return (
    <div style={{ position:"relative" }}>
      <input
        style={S.input}
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        dir="auto"   // supports RTL (Arabic) automatically
      />
      {showDropdown && (
        <div style={{
          position:"absolute", top:"calc(100% + 2px)", left:0, right:0, zIndex:60,
          background:"#fff", border:"0.5px solid #e0e0e0", borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,0.10)", overflow:"hidden",
        }}>
          {matches.map(s => (
            <div
              key={s}
              onMouseDown={() => { onChange(s); setOpen(false) }}
              style={{
                padding:"8px 12px", fontSize:13, cursor:"pointer",
                borderBottom:"0.5px solid #f5f5f5",
                direction:"auto" as unknown as CSSProperties["direction"],
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F3F2FD")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
type OFProps = {
  textiles: Textile[]
  selectedTextileId: number|null
  textile:string; color:string; fabricType:string; quantity:string
  deadline:string; priority:Priority; categories:MachineCategory[]; notes:string
  orderNumber:string
  isEdit:boolean
  set: {
    selectedTextileId:(v:number|null)=>void
    textile:(v:string)=>void; color:(v:string)=>void; fabricType:(v:string)=>void
    quantity:(v:string)=>void; deadline:(v:string)=>void; priority:(v:Priority)=>void
    categories:(v:MachineCategory[])=>void; notes:(v:string)=>void
    orderNumber:(v:string)=>void
  }
  onSave:()=>void
}

function OrderFormUI({ textiles,selectedTextileId,textile,color,fabricType,quantity,deadline,priority,categories,notes,orderNumber,isEdit,set,onSave }: OFProps) {
  const fromDB = selectedTextileId !== null
  const [txSearch, setTxSearch] = useState("")
  const [txOpen,   setTxOpen]   = useState(false)

  const filteredTx = useMemo(() => {
    if (!txSearch.trim()) return textiles
    const q = txSearch.toLowerCase()
    return textiles.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.color.toLowerCase().includes(q) ||
      t.fabricType.toLowerCase().includes(q)
    )
  }, [textiles, txSearch])

  function pickTextile(t: Textile) {
    set.selectedTextileId(t.id)
    set.textile(t.name)
    set.color(t.color)
    set.fabricType(t.fabricType)
    set.categories(t.machineCategories)
    set.notes(t.notes)
    setTxSearch("")
    setTxOpen(false)
  }

  function clearTextile() {
    set.selectedTextileId(null)
    set.textile(""); set.color(""); set.fabricType("")
    set.categories([]); set.notes("")
    setTxSearch(""); setTxOpen(false)
  }

  return (
    <>
      {/* ── TEXTILE PICKER ── */}
      <Field label="Textile">
        {fromDB
          ? (
            /* selected state — show chip with change button */
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
              border:"1.5px solid #7F77DD", borderRadius:8, background:"#F3F2FD" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{textile}</div>
                <div style={{ fontSize:11, color:"#888" }}>{fabricType} · {color}</div>
              </div>
              <button style={{ ...S.btnIcon, fontSize:12, color:"#7F77DD" }} onClick={clearTextile}>✕ change</button>
            </div>
          )
          : (
            /* search + results */
            <div style={{ position:"relative" }}>
              <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
                <span style={{ position:"absolute", left:10, fontSize:13, color:"#aaa", pointerEvents:"none" }}>🔍</span>
                <input
                  style={{ ...S.input, paddingLeft:32 }}
                  placeholder={textiles.length === 0 ? "No textiles saved yet — fill in manually below" : `Search ${textiles.length} textiles…`}
                  value={txSearch}
                  onChange={e => { setTxSearch(e.target.value); setTxOpen(true) }}
                  onFocus={() => setTxOpen(true)}
                  onBlur={() => setTimeout(() => setTxOpen(false), 150)}
                  disabled={textiles.length === 0}
                />
                {txSearch && (
                  <button style={{ position:"absolute", right:8, background:"none", border:"none",
                    cursor:"pointer", color:"#aaa", fontSize:14 }}
                    onClick={() => { setTxSearch(""); setTxOpen(false) }}>✕</button>
                )}
              </div>

              {/* dropdown results */}
              {txOpen && textiles.length > 0 && (
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50,
                  background:"#fff", border:"0.5px solid #e0e0e0", borderRadius:8,
                  boxShadow:"0 4px 16px rgba(0,0,0,0.10)", maxHeight:220, overflowY:"auto" }}>
                  {filteredTx.length === 0
                    ? <div style={{ padding:"12px 14px", fontSize:13, color:"#bbb" }}>No match — fill in manually below</div>
                    : filteredTx.map(t => (
                        <div key={t.id}
                          onClick={() => pickTextile(t)}
                          style={{ padding:"9px 14px", cursor:"pointer", borderBottom:"0.5px solid #f5f5f5",
                            display:"flex", alignItems:"center", gap:10 }}
                          onMouseEnter={e => (e.currentTarget.style.background="#F3F2FD")}
                          onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:500 }}>{t.name}</div>
                            <div style={{ fontSize:11, color:"#888" }}>{t.fabricType} · {t.color}</div>
                          </div>
                          <div style={{ fontSize:10, color:"#aaa" }}>
                            {t.machineCategories.length} machine type{t.machineCategories.length>1?"s":""}
                          </div>
                        </div>
                      ))
                  }
                </div>
              )}
            </div>
          )
        }
      </Field>

      {/* manual fields — shown when no textile selected from DB */}
      {!fromDB && (
        <div style={{ background:"#fafafa", border:"0.5px solid #e5e5e5", borderRadius:8, padding:12, marginBottom:14 }}>
          <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>
            Fill in manually — will be saved to your textile database automatically.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Textile name">
              <input style={S.input} value={textile} onChange={e=>set.textile(e.target.value)} placeholder="e.g. Blue Gabardine" />
            </Field>
            <Field label="Color">
              <input style={S.input} value={color} onChange={e=>set.color(e.target.value)} placeholder="e.g. Navy" />
            </Field>
            <Field label="Fabric type">
              <input style={S.input} value={fabricType} onChange={e=>set.fabricType(e.target.value)} placeholder="e.g. Wool" />
            </Field>
          </div>
          <Field label="Compatible machine types">
            <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"10px 12px",
              border:"0.5px solid #d5d5d5", borderRadius:8, background:"#fff" }}>
              {CATS.map(cat => {
                const checked = categories.includes(cat)
                return (
                  <label key={cat} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:13, userSelect:"none" }}>
                    <div onClick={()=>set.categories(checked?categories.filter(c=>c!==cat):[...categories,cat])}
                      style={{ width:17, height:17, borderRadius:4, flexShrink:0, cursor:"pointer",
                        border:checked?"none":"1.5px solid #ccc", background:checked?"#7F77DD":"#fff",
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {checked&&<span style={{color:"#fff",fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                    </div>
                    <span style={{color:checked?"#1a1a1a":"#666"}}>{cat}</span>
                  </label>
                )
              })}
            </div>
            {categories.length===0&&<div style={{fontSize:11,color:"#E24B4A",marginTop:5}}>Pick at least one machine type.</div>}
            {categories.length>1&&<div style={{fontSize:11,color:"#7F77DD",marginTop:5}}>✦ Flexible — scheduler picks best across {categories.length} types.</div>}
          </Field>
        </div>
      )}

      {/* always-shown fields */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Quantity (m)">
          <input style={S.input} type="number" value={quantity} onChange={e=>set.quantity(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Deadline">
          <input style={S.input} type="date" value={deadline} onChange={e=>set.deadline(e.target.value)} />
        </Field>
        <Field label="Priority">
          <select style={S.input} value={priority} onChange={e=>set.priority(e.target.value as Priority)}>
            <option>High</option><option>Normal</option><option>Low</option>
          </select>
        </Field>
        <Field label="Order number (optional)">
          <input style={S.input} value={orderNumber} onChange={e=>set.orderNumber(e.target.value)}
            placeholder="e.g. ORD-2024-001" dir="auto" />
        </Field>
        <Field label="Notes (optional)">
          <input style={S.input} value={notes} onChange={e=>set.notes(e.target.value)} placeholder="Special instructions…" />
        </Field>
      </div>

      {quantity&&<div style={S.warpPreview}>Warp needed: <strong>{calcWarp(Number(quantity))}m</strong> (qty × 1.1)</div>}
      <button style={{...S.btnPrimary, opacity: (!textile.trim()||!quantity||categories.length===0)?0.5:1}}
        onClick={onSave}>{isEdit?"Save changes":"Add order"}</button>
    </>
  )
}

// ─── MACHINE FORM (top-level component) ──────────────────────
type MFProps = {
  name:string; category:MachineCategory; capacity:string; isEdit:boolean
  set: { name:(v:string)=>void; category:(v:MachineCategory)=>void; capacity:(v:string)=>void }
  onSave:()=>void
}

function MachineFormUI({ name,category,capacity,isEdit,set,onSave }: MFProps) {
  return (
    <>
      <Field label="Machine name">
        <input style={S.input} value={name} onChange={e=>set.name(e.target.value)} placeholder="e.g. M-01 Elettra" />
      </Field>
      <Field label="Category">
        <select style={S.input} value={category} onChange={e=>set.category(e.target.value as MachineCategory)}>
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Capacity (m)">
        <input style={S.input} type="number" value={capacity} onChange={e=>set.capacity(e.target.value)} />
      </Field>
      <button style={S.btnPrimary} onClick={onSave}>{isEdit ? "Save changes" : "Add machine"}</button>
    </>
  )
}

// ─── TEXTILE FORM (top-level component) ──────────────────────
type TFProps = {
  name:string; color:string; fabricType:string
  categories:MachineCategory[]; notes:string; isEdit:boolean
  knownColors: string[]      // autocomplete suggestions for color
  knownFabrics: string[]     // autocomplete suggestions for fabric type
  set: {
    name:(v:string)=>void; color:(v:string)=>void; fabricType:(v:string)=>void
    categories:(v:MachineCategory[])=>void; notes:(v:string)=>void
  }
  onSave:()=>void
}

function TextileFormUI({ name,color,fabricType,categories,notes,isEdit,knownColors,knownFabrics,set,onSave }: TFProps) {
  function toggleCat(cat: MachineCategory) {
    set.categories(categories.includes(cat) ? categories.filter(c=>c!==cat) : [...categories,cat])
  }
  return (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Textile name">
          <input style={S.input} value={name} onChange={e=>set.name(e.target.value)}
            placeholder="e.g. جاكار بيج" dir="auto" />
        </Field>
        <Field label="Color">
          <AutocompleteInput
            value={color}
            onChange={set.color}
            suggestions={knownColors}
            placeholder="e.g. بيج"
          />
        </Field>
        <Field label="Fabric type">
          <AutocompleteInput
            value={fabricType}
            onChange={set.fabricType}
            suggestions={knownFabrics}
            placeholder="e.g. جاكار"
          />
        </Field>
      </div>
      <Field label="Compatible machine types">
        <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"10px 12px",
          border:"0.5px solid #d5d5d5", borderRadius:8, background:"#fafafa" }}>
          {CATS.map(cat => {
            const checked = categories.includes(cat)
            return (
              <label key={cat} style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontSize:13, userSelect:"none" }}>
                <div onClick={()=>toggleCat(cat)} style={{
                  width:17, height:17, borderRadius:4, flexShrink:0, cursor:"pointer",
                  border: checked?"none":"1.5px solid #ccc", background: checked?"#7F77DD":"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  {checked&&<span style={{color:"#fff",fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <span style={{color:checked?"#1a1a1a":"#666"}}>{cat}</span>
              </label>
            )
          })}
        </div>
        {categories.length===0&&<div style={{fontSize:11,color:"#E24B4A",marginTop:5}}>Pick at least one machine type.</div>}
      </Field>
      <Field label="Notes (optional)">
        <textarea style={{...S.input,height:52,resize:"vertical"} as CSSProperties}
          value={notes} onChange={e=>set.notes(e.target.value)} placeholder="Any special notes about this textile…" />
      </Field>
      <button style={S.btnPrimary} onClick={onSave}>{isEdit?"Save changes":"Save textile"}</button>
    </>
  )
}
export default function App() {
  const [machines,  setMachines]  = useState<Machine[]>([])
  const [orders,    setOrders]    = useState<Order[]>([])
  const [textiles,  setTextiles]  = useState<Textile[]>([])
  const [schedule,  setSchedule]  = useState<Record<number,Order[]>>({})
  const [ready,     setReady]     = useState(false)
  const [view,      setView]      = useState<View>("dashboard")
  const [search,    setSearch]    = useState("")

  const [showOM, setShowOM] = useState(false)
  const [showMM, setShowMM] = useState(false)
  const [showTM, setShowTM] = useState(false)
  const [editO,  setEditO]  = useState<Order|null>(null)
  const [editM,  setEditM]  = useState<Machine|null>(null)
  const [editT,  setEditT]  = useState<Textile|null>(null)

  // machine form state
  const [mName, setMName] = useState("")
  const [mCat,  setMCat]  = useState<MachineCategory>("Electronic Double")
  const [mCap,  setMCap]  = useState(String(DEFAULT_CAP))

  // textile form state
  const [tName,  setTName]  = useState("")
  const [tColor, setTColor] = useState("")
  const [tFab,   setTFab]   = useState("")
  const [tCats,  setTCats]  = useState<MachineCategory[]>([])
  const [tNotes, setTNotes] = useState("")

  // order form state
  const [oSelId,   setOSelId]   = useState<number|null>(null)
  const [oTextile, setOTextile] = useState("")
  const [oColor,   setOColor]   = useState("")
  const [oFabric,  setOFabric]  = useState("")
  const [oQty,     setOQty]     = useState("")
  const [oDl,      setODl]      = useState("")
  const [oPri,     setOPri]     = useState<Priority>("Normal")
  const [oCats,    setOCats]    = useState<MachineCategory[]>([])
  const [oNotes,   setONotes]   = useState("")
  const [oOrderNum,setOOrderNum]= useState("")

  const [forceSwitchOrder, setForceSwitchOrder] = useState<Order|null>(null)
  const [historySearch, setHistorySearch] = useState("")
  const [warpOrder, setWarpOrder] = useState<WarpOrder>({})
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())

  // ── SUPABASE: initial load + real-time sync ───────────────
  const subscribed = useRef(false)

  useEffect(() => {
    // 1. Load all data on mount
    async function loadAll() {
      const [m, o, t] = await Promise.all([
        dbLoadMachines(),
        dbLoadOrders(),
        dbLoadTextiles(),
      ])

      // ── RECOVERY: merge localStorage backup into Supabase if rows are missing
      async function recoverFromBackup<T extends { id: number }>(
        table: string,
        oldKey: string,   // pre-Supabase localStorage key
        dbRows: T[],
        sanitize: (r: Record<string, unknown>) => T
      ): Promise<T[]> {
        try {
          // check both old localStorage key and new backup key
          const backupRaw  = localStorage.getItem(`dtx_backup_${table}`) || "[]"
          const oldRaw     = localStorage.getItem(oldKey) || "[]"
          const backup: Record<string, unknown>[] = [
            ...JSON.parse(backupRaw),
            ...JSON.parse(oldRaw),
          ]
          if (backup.length === 0) return dbRows
          const dbIds  = new Set(dbRows.map(r => r.id))
          const missing = backup.filter(r => !dbIds.has(Number(r.id)))
          if (missing.length === 0) return dbRows
          console.log(`Recovering ${missing.length} missing ${table} rows...`)
          for (const row of missing) {
            await dbUpsert(table, row)
          }
          return [...dbRows, ...missing.map(sanitize)]
        } catch (e) {
          console.error("Recovery error:", e)
          return dbRows
        }
      }

      const [recoveredO, recoveredT] = await Promise.all([
        recoverFromBackup("orders",   "dtx_orders",   o, sanitizeOrder),
        recoverFromBackup("textiles", "dtx_textiles", t, r => r as Textile),
      ])

      setMachines(m)
      setOrders(recoveredO)
      setTextiles(recoveredT)
      setReady(true)
    }
    loadAll()

    if (subscribed.current) return
    subscribed.current = true

    // 2. Real-time: MERGE individual row changes into existing state.
    //    We do NOT do a full reload — that was overwriting local warpClosed state.
    //    Instead we use the payload from the real-time event directly.
    const channel = db
      .channel("deebtex-realtime")

      // ── MACHINES ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "machines" },
        (payload) => {
          const m = sanitizeMachine(payload.new as Record<string, unknown>)
          setMachines(p => [...p.filter(x => x.id !== m.id), m])
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "machines" },
        (payload) => {
          const m = sanitizeMachine(payload.new as Record<string, unknown>)
          setMachines(p => p.map(x => x.id === m.id ? m : x))
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "machines" },
        (payload) => {
          const id = (payload.old as Record<string, unknown>).id as number
          setMachines(p => p.filter(x => x.id !== id))
        })

      // ── ORDERS ──
      // INSERT: add new order (from another computer adding it)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const o = sanitizeOrder(payload.new as Record<string, unknown>)
          // only add if we don't already have it locally (we add it locally on save)
          setOrders(p => p.some(x => x.id === o.id) ? p : [...p, o])
        })
      // UPDATE: merge — but NEVER downgrade warpClosed from true to false
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const incoming = sanitizeOrder(payload.new as Record<string, unknown>)
          setOrders(p => p.map(x => {
            if (x.id !== incoming.id) return x
            return {
              ...incoming,
              // If local state has warpClosed=true, NEVER let DB overwrite it with false.
              // This is the core of the fix — the seal is permanent once set locally.
              warpClosed: x.warpClosed === true ? true : incoming.warpClosed,
            }
          }))
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders" },
        (payload) => {
          const id = (payload.old as Record<string, unknown>).id as number
          setOrders(p => p.filter(x => x.id !== id))
        })

      // ── TEXTILES ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "textiles" },
        (payload) => {
          const t = payload.new as Textile
          setTextiles(p => p.some(x => x.id === t.id) ? p : [...p, t])
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "textiles" },
        (payload) => {
          const t = payload.new as Textile
          setTextiles(p => p.map(x => x.id === t.id ? t : x))
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "textiles" },
        (payload) => {
          const id = (payload.old as Record<string, unknown>).id as number
          setTextiles(p => p.filter(x => x.id !== id))
        })

      .subscribe()

    return () => { db.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (ready) setSchedule(buildSchedule(orders, machines))
  }, [orders, machines, ready])

  const filteredOrders = useMemo(() => {
    // done orders go to History — active orders view shows only not-started and on-machine
    const active = orders.filter(o => o.warpStatus !== "done")
    if (!search) return active
    const q = search.toLowerCase()
    return active.filter(o =>
      o.textile.toLowerCase().includes(q) ||
      o.color.toLowerCase().includes(q) ||
      o.fabricType.toLowerCase().includes(q)
    )
  }, [orders, search])

  // Warp groups: group by actual assigned machine + fabric + color.
  // Two orders with different machineCategories but same fabric/color
  // assigned to the same machine share one physical warp — one group.
  const warpGroups = useMemo(() => {
    const g: Record<string, {
      label: string; machine: string; machineId: number|null
      meters: number; count: number; orderIds: number[]
      closed: boolean   // true = warp is sealed / on-machine
    }> = {}
    const activeOrders = orders.filter(o => o.warpStatus !== "done")
    for (const o of activeOrders) {
      const assignedM = machines.find(m => (schedule[m.id] ?? []).some(x => x.id === o.id))
      if (!assignedM) continue
      const key = machineWarpKey(o, assignedM.id) + (o.warpClosed ? "||sealed" : "||open")
      if (!g[key]) g[key] = {
        label: `${o.fabricType} · ${o.color}`,
        machine: assignedM.name, machineId: assignedM.id,
        meters: 0, count: 0, orderIds: [],
        closed: !!o.warpClosed,
      }
      g[key].meters += calcWarp(o.quantity)
      g[key].count++
      g[key].orderIds.push(o.id)
    }
    for (const o of activeOrders) {
      const inSchedule = machines.some(m => (schedule[m.id] ?? []).some(x => x.id === o.id))
      if (!inSchedule) {
        const key = `${warpKey(o)}||unassigned`
        if (!g[key]) g[key] = {
          label: `${o.fabricType} · ${o.color}`, machine: "Unassigned", machineId: null,
          meters: 0, count: 0, orderIds: [], closed: false,
        }
        g[key].meters += calcWarp(o.quantity)
        g[key].count++
        g[key].orderIds.push(o.id)
      }
    }
    return g
  }, [orders, schedule, machines])

  const overloaded = useMemo(() =>
    machines.filter(m => machineLoad(schedule, m.id) > m.capacity),
    [machines, schedule]
  )

  // machine actions
  function resetMF() { setMName(""); setMCat("Electronic Double"); setMCap(String(DEFAULT_CAP)) }

  async function saveMachine() {
    if (!mName.trim()) return
    const cap = Number(mCap) || DEFAULT_CAP
    if (editM) {
      const updated = { ...editM, name:mName, category:mCat, capacity:cap }
      setMachines(p => p.map(m => m.id===editM.id ? updated : m))
      await dbUpsert("machines", updated as unknown as Record<string, unknown>)
      setEditM(null)
    } else {
      const created: Machine = { id:Date.now(), name:mName, category:mCat, capacity:cap }
      setMachines(p => [...p, created])
      await dbUpsert("machines", created as unknown as Record<string, unknown>)
      setShowMM(false)
    }
    resetMF()
  }

  function openEditMachine(m: Machine) {
    setMName(m.name); setMCat(m.category); setMCap(String(m.capacity)); setEditM(m)
  }

  // textile actions
  function resetTF() { setTName(""); setTColor(""); setTFab(""); setTCats([]); setTNotes("") }

  async function saveTextile() {
    if (!tName.trim() || !tFab.trim() || tCats.length === 0) return
    if (editT) {
      const updated = { ...editT, name:tName, color:tColor, fabricType:tFab,
        machineCategories:tCats, notes:tNotes }
      setTextiles(p => p.map(t => t.id===editT.id ? updated : t))
      await dbUpsert("textiles", updated as unknown as Record<string, unknown>)
      setEditT(null)
    } else {
      const created: Textile = { id:Date.now(), name:tName, color:tColor,
        fabricType:tFab, machineCategories:tCats, notes:tNotes }
      setTextiles(p => [...p, created])
      await dbUpsert("textiles", created as unknown as Record<string, unknown>)
      setShowTM(false)
    }
    resetTF()
  }

  function openEditTextile(t: Textile) {
    setTName(t.name); setTColor(t.color); setTFab(t.fabricType)
    setTCats(t.machineCategories); setTNotes(t.notes); setEditT(t)
  }

  async function delTextile(id: number) {
    setTextiles(p => p.filter(t => t.id!==id))
    await dbDelete("textiles", id)
  }

  // order actions
  function resetOF() {
    setOSelId(null)
    setOTextile(""); setOColor(""); setOFabric(""); setOQty("")
    setODl(""); setOPri("Normal"); setOCats([]); setONotes(""); setOOrderNum("")
  }

  async function saveOrder() {
    if (!oTextile.trim() || !oQty || oCats.length === 0) return
    const data: Order = {
      id: editO ? editO.id : Date.now(),
      textile:oTextile, color:oColor, fabricType:oFabric,
      quantity:Number(oQty), deadline:oDl, priority:oPri,
      machineCategories:oCats, warpStatus:editO?.warpStatus??"not-started", notes:oNotes,
      orderNumber: oOrderNum.trim() || undefined,
    }
    if (editO) {
      setOrders(p => p.map(o => o.id===editO.id ? data : o))
      setEditO(null)
    } else {
      setOrders(p => [...p, data])
      setShowOM(false)
    }
    await dbUpsert("orders", data as unknown as Record<string, unknown>)

    // auto-save to textile DB if manually entered and not already there
    if (oSelId === null && oTextile.trim() && oFabric.trim() && oCats.length > 0) {
      const alreadyExists = textiles.some(t =>
        t.name.toLowerCase()      === oTextile.toLowerCase() &&
        t.color.toLowerCase()     === oColor.toLowerCase() &&
        t.fabricType.toLowerCase()=== oFabric.toLowerCase()
      )
      if (!alreadyExists) {
        const newT: Textile = {
          id: Date.now() + 1,
          name:oTextile, color:oColor, fabricType:oFabric,
          machineCategories:oCats, notes:oNotes,
        }
        setTextiles(p => [...p, newT])
        await dbUpsert("textiles", newT as unknown as Record<string, unknown>)
      }
    }
    resetOF()
  }

  function openEditOrder(o: Order) {
    setOSelId(null)
    setOTextile(o.textile); setOColor(o.color); setOFabric(o.fabricType)
    setOQty(String(o.quantity)); setODl(o.deadline); setOPri(o.priority)
    setOCats(o.machineCategories ?? []); setONotes(o.notes)
    setOOrderNum(o.orderNumber ?? ""); setEditO(o)
  }

  async function delOrder(id: number) {
    setOrders(p => p.filter(o => o.id!==id))
    await dbDelete("orders", id)
  }
  async function delMachine(id: number) {
    setMachines(p => p.filter(m => m.id!==id))
    await dbDelete("machines", id)
  }

  // ── FEATURE 1: toggle machine out-of-order
  // not-started orders re-optimize automatically (scheduler excludes OOO machines)
  // on-machine orders stay (can't move mid-run) but show a warning
  async function toggleOutOfOrder(m: Machine) {
    const updated = { ...m, outOfOrder: !m.outOfOrder }
    setMachines(p => p.map(x => x.id===m.id ? updated : x))
    await dbUpsert("machines", updated as unknown as Record<string, unknown>)
  }

  // ── "Warp done, start next"
  // Seals this warp group. Orders → on-machine + warpClosed = true.
  // The scheduler's sealedSlots logic blocks any new order from getting
  // a same-warp bonus on this machine for this fabric+color.
  // New orders with the same specs will be treated as a fresh separate warp.
  async function warpNextRun(orderIds: number[]) {
    const updated = orders.map(o => {
      if (!orderIds.includes(o.id)) return o
      return { ...o, warpStatus: "on-machine" as WarpStatus, warpClosed: true }
    })
    setOrders(updated)
    for (const o of updated.filter(o => orderIds.includes(o.id))) {
      await dbUpsert("orders", o as unknown as Record<string, unknown>)
    }
  }

  async function warpGroupDone(orderIds: number[]) {
    const updated = orders.map(o => {
      if (!orderIds.includes(o.id)) return o
      return { ...o, warpStatus: "done" as WarpStatus, warpClosed: true }
    })
    setOrders(updated)
    for (const o of updated.filter(o => orderIds.includes(o.id))) {
      await dbUpsert("orders", o as unknown as Record<string, unknown>)
    }
  }

  // Move a warp group up or down in a machine's queue
  function moveWarpGroup(machineId: number, wk: string, dir: "up" | "down") {
    const q = schedule[machineId] ?? []
    const pendingKeys = [...new Set(
      q.filter(o => o.warpStatus !== "on-machine").map(o => warpKey(o))
    )]
    // apply existing warpOrder if present
    const currentOrder = warpOrder[machineId] ?? pendingKeys
    // ensure all current keys are in the list (new ones appended)
    const merged = [
      ...currentOrder.filter(k => pendingKeys.includes(k)),
      ...pendingKeys.filter(k => !currentOrder.includes(k)),
    ]
    const idx = merged.indexOf(wk)
    if (idx === -1) return
    if (dir === "up" && idx === 0) return
    if (dir === "down" && idx === merged.length - 1) return
    const newOrder = [...merged]
    const swap = dir === "up" ? idx - 1 : idx + 1
    ;[newOrder[idx], newOrder[swap]] = [newOrder[swap], newOrder[idx]]
    setWarpOrder(p => ({ ...p, [machineId]: newOrder }))
  }

  // Get the queue for a machine with manual warpOrder applied
  function getOrderedQueue(machineId: number): Order[] {
    const q = schedule[machineId] ?? []
    const running    = q.filter(o => o.warpStatus === "on-machine")
    const notStarted = q.filter(o => o.warpStatus !== "on-machine")
    const customOrder = warpOrder[machineId]
    if (!customOrder) return [...running, ...notStarted]
    // group not-started by warpKey
    const groups: Record<string, Order[]> = {}
    for (const o of notStarted) {
      const wk = warpKey(o)
      if (!groups[wk]) groups[wk] = []
      groups[wk].push(o)
    }
    // apply custom order
    const orderedGroups = [
      ...customOrder.filter(wk => groups[wk]).map(wk => groups[wk]),
      ...Object.entries(groups).filter(([wk]) => !customOrder.includes(wk)).map(([,g]) => g),
    ]
    return [...running, ...orderedGroups.flat()]
  }

  async function forceSwitch(orderId: number, machineId: number) {
    const updated = orders.map(o => {
      if (o.id !== orderId) return o
      return { ...o, forcedMachineId: machineId, warpStatus: "not-started" as WarpStatus }
    })
    setOrders(updated)
    const changed = updated.find(o => o.id === orderId)
    if (changed) await dbUpsert("orders", changed as unknown as Record<string, unknown>)
    setForceSwitchOrder(null)
  }

  async function clearForce(orderId: number) {
    const updated = orders.map(o => {
      if (o.id !== orderId) return o
      return { ...o, forcedMachineId: undefined }
    })
    setOrders(updated)
    const changed = updated.find(o => o.id === orderId)
    if (changed) await dbUpsert("orders", changed as unknown as Record<string, unknown>)
  }

  async function setWarpSt(id: number, st: WarpStatus) {
    const updated = orders.map(o => {
      if (o.id !== id) return o
      return { ...o, warpStatus: st }
    })
    setOrders(updated)
    const changed = updated.find(o => o.id === id)
    if (changed) await dbUpsert("orders", changed as unknown as Record<string, unknown>)
  }

  function exportCSV() {
    const rows = orders.map(o =>
      [o.textile,o.color,o.fabricType,o.quantity,o.priority,o.deadline,o.warpStatus].join(",")
    )
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(
      ["Textile,Color,Fabric,Qty,Priority,Deadline,WarpStatus\n"+rows.join("\n")],
      { type:"text/csv" }
    ))
    a.download = "deebtex-orders.csv"; a.click()
  }

  // ── BACKUP: export full JSON snapshot of all data
  function exportBackup() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      orders, machines, textiles,
    }
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(
      [JSON.stringify(snapshot, null, 2)],
      { type:"application/json" }
    ))
    a.download = `deebtex-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }

  // ── RESTORE: import JSON backup and push missing rows to Supabase
  async function importBackup(file: File) {
    try {
      const text = await file.text()
      const snapshot = JSON.parse(text)
      const importedOrders:   Order[]   = snapshot.orders   ?? []
      const importedTextiles: Textile[] = snapshot.textiles ?? []
      const importedMachines: Machine[] = snapshot.machines ?? []

      // find rows missing from current state and push them
      const missingOrders   = importedOrders.filter(o => !orders.some(x => x.id === o.id))
      const missingTextiles = importedTextiles.filter(t => !textiles.some(x => x.id === t.id))
      const missingMachines = importedMachines.filter(m => !machines.some(x => x.id === m.id))

      for (const o of missingOrders)   await dbUpsert("orders",   o as unknown as Record<string,unknown>)
      for (const t of missingTextiles) await dbUpsert("textiles", t as unknown as Record<string,unknown>)
      for (const m of missingMachines) await dbUpsert("machines", m as unknown as Record<string,unknown>)

      setOrders(p   => [...p,   ...missingOrders])
      setTextiles(p => [...p,   ...missingTextiles])
      setMachines(p => [...p,   ...missingMachines])

      alert(`Restored: ${missingOrders.length} orders, ${missingTextiles.length} textiles, ${missingMachines.length} machines.`)
    } catch(e) {
      alert("Import failed — make sure it's a valid Deebtex backup file.")
      console.error(e)
    }
  }

  // ── DERIVED: must come BEFORE prop bundles that use them ──
  const knownColors = useMemo(() => {
    const seen = new Set(textiles.map(t => t.color).filter(Boolean))
    return [...seen].sort((a, b) => a.localeCompare(b, "ar"))
  }, [textiles])

  const knownFabrics = useMemo(() => {
    const seen = new Set(textiles.map(t => t.fabricType).filter(Boolean))
    return [...seen].sort((a, b) => a.localeCompare(b, "ar"))
  }, [textiles])

  const totalLoad = orders.reduce((s,o)=>s+o.quantity,0)
  const highCnt   = orders.filter(o=>o.priority==="High").length

  // ── PROP BUNDLES ──────────────────────────────────────────
  const orderFormProps: OFProps = {
    textiles, selectedTextileId:oSelId,
    textile:oTextile, color:oColor, fabricType:oFabric, quantity:oQty,
    deadline:oDl, priority:oPri, categories:oCats, notes:oNotes,
    orderNumber:oOrderNum,
    isEdit:!!editO,
    set:{
      selectedTextileId:setOSelId,
      textile:setOTextile, color:setOColor, fabricType:setOFabric,
      quantity:setOQty, deadline:setODl, priority:setOPri,
      categories:setOCats, notes:setONotes, orderNumber:setOOrderNum,
    },
    onSave:saveOrder,
  }
  const machineFormProps: MFProps = {
    name:mName, category:mCat, capacity:mCap, isEdit:!!editM,
    set:{ name:setMName, category:setMCat, capacity:setMCap },
    onSave:saveMachine,
  }
  const textileFormProps: TFProps = {
    name:tName, color:tColor, fabricType:tFab, categories:tCats, notes:tNotes,
    isEdit:!!editT, knownColors, knownFabrics,
    set:{ name:setTName, color:setTColor, fabricType:setTFab, categories:setTCats, notes:setTNotes },
    onSave:saveTextile,
  }

  // ── NAV ───────────────────────────────────────────────────
  const NAV: {id:View;icon:string;label:string}[] = [
    {id:"dashboard",   icon:"⊞", label:"Dashboard"},
    {id:"orders",      icon:"≡", label:"Orders"},
    {id:"machines",    icon:"⚙", label:"Machines"},
    {id:"textiles",    icon:"🧵", label:"Textiles"},
    {id:"analytics",   icon:"↗", label:"Analytics"},
    {id:"history",     icon:"🕓", label:"History"},
    {id:"suggestions", icon:"💡", label:"Suggestions"},
  ]

  return (
    <div style={S.shell}>

      {/* ── SIDEBAR ─────────────────────────────────────── */}
      <div style={S.sidebar}>
        <div style={S.logo}>Dt</div>
        {NAV.map(n => (
          <button key={n.id}
            style={{...S.navBtn,...(view===n.id?S.navActive:{})}}
            onClick={()=>setView(n.id)}>
            <span style={{fontSize:16,width:18,textAlign:"center"}}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div style={{flex:1}}/>
        {machines.length>0 && (
          <div style={{borderTop:"0.5px solid #2e2e3a",paddingTop:10,marginTop:8}}>
            {machines.slice(0,7).map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 10px"}}>
                {m.outOfOrder
                  ? <span style={{fontSize:10,color:"#E24B4A",flexShrink:0}}>⚠</span>
                  : <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,
                      background:statColor(machineStatus(machineLoad(schedule,m.id),m.capacity))}}/>
                }
                <span style={{fontSize:11,color:m.outOfOrder?"#E24B4A":"#6b7280",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {m.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MAIN ────────────────────────────────────────── */}
      <div style={S.main}>

        {/* TOPBAR */}
        <div style={S.topbar}>
          <span style={{fontWeight:500,fontSize:15,flex:1}}>
            {NAV.find(n=>n.id===view)?.label}
          </span>
          <div style={{position:"relative",display:"flex",alignItems:"center"}}>
            <span style={{position:"absolute",left:9,fontSize:12,pointerEvents:"none"}}>🔍</span>
            <input style={S.search} placeholder="Search orders…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          {/* hidden file input for restore */}
          <input id="restore-input" type="file" accept=".json" style={{display:"none"}}
            onChange={e=>{ if(e.target.files?.[0]) importBackup(e.target.files[0]); e.target.value="" }}/>
          <button style={{...S.btnSm,background:"#EDFBEE",color:"#166534",border:"0.5px solid #86EFAC"}}
            onClick={exportBackup} title="Download full backup of all data">
            💾 Backup
          </button>
          <button style={{...S.btnSm,color:"#888"}}
            onClick={()=>document.getElementById("restore-input")?.click()}
            title="Restore from a backup file">
            📂 Restore
          </button>
          <button style={S.btnSm} onClick={exportCSV}>CSV</button>
          <button style={S.btnSm} onClick={()=>{resetMF();setShowMM(true)}}>+ Machine</button>
          <button style={S.btnSm} onClick={()=>{resetTF();setShowTM(true)}}>+ Textile</button>
          <button style={S.btnPrimary} onClick={()=>{resetOF();setShowOM(true)}}>+ Add order</button>
        </div>

        {/* ── DASHBOARD VIEW ────────────────────────────── */}
        {view==="dashboard" && (
          <div style={S.viewPad}>
            <div style={S.metrics}>
              {[
                {label:"Total orders", val:orders.length,                  sub:`${highCnt} high priority`},
                {label:"Total load",   val:`${totalLoad.toLocaleString()}m`,sub:`${machines.length} machines`},
                {label:"Warp groups",  val:Object.keys(warpGroups).length,  sub:"changeover groups"},
                {label:"Overloaded",   val:overloaded.length,
                 sub:overloaded.length?overloaded.map(m=>m.name).join(", "):"all clear",
                 danger:overloaded.length>0},
              ].map(c=>(
                <div key={c.label} style={{...S.mCard,...(c.danger?{borderColor:"#fca5a5"}:{})}}>
                  <div style={S.mLabel}>{c.label}</div>
                  <div style={{...S.mVal,...(c.danger?{color:"#E24B4A"}:{})}}>{c.val}</div>
                  <div style={S.mSub}>{c.sub}</div>
                </div>
              ))}
            </div>

            {overloaded.map(m=>(
              <div key={m.id} style={S.alert}>
                ⚠️ {m.name} is overloaded ({machineLoad(schedule,m.id)}m / {m.capacity}m). Reassign orders or increase capacity.
              </div>
            ))}

            <div style={S.twoCol}>
              {/* schedule card */}
              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Machine schedule</span><span style={S.cSub}>active warp + queue · use arrows to reorder</span></div>
                <div style={S.cBody}>
                  {machines.length===0 && <div style={S.empty}>No machines yet.</div>}
                  {machines.map(m=>{
                    const q  = getOrderedQueue(m.id)
                    const ld = machineLoad(schedule,m.id)
                    const st = m.outOfOrder ? "OUT OF ORDER" : machineStatus(ld,m.capacity)
                    const pc = loadPct(ld,m.capacity)
                    const dotBg = m.outOfOrder ? "#E24B4A" : statColor(st)

                    // build warp group blocks from ordered queue
                    const running    = q.filter(o => o.warpStatus === "on-machine")
                    const notStarted = q.filter(o => o.warpStatus !== "on-machine")

                    // group notStarted into consecutive warp blocks
                    const warpBlocks: Order[][] = []
                    for (const o of notStarted) {
                      const last = warpBlocks[warpBlocks.length - 1]
                      if (last && warpKey(last[0]) === warpKey(o)) last.push(o)
                      else warpBlocks.push([o])
                    }

                    return (
                      <div key={m.id} style={{marginBottom:16,paddingBottom:16,borderBottom:"0.5px solid #f0f0f0",
                        opacity: m.outOfOrder ? 0.65 : 1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:dotBg,flexShrink:0}}/>
                          <span style={{fontSize:13,fontWeight:500,flex:1}}>{m.name}</span>
                          {m.outOfOrder
                            ? <span style={{background:"#FEEBEB",color:"#E24B4A",borderRadius:4,padding:"1px 7px",fontSize:11,fontWeight:600}}>OUT OF ORDER</span>
                            : <Badge text={`${ld}m / ${m.capacity}m`} color={statColor(st)}/>
                          }
                        </div>
                        {!m.outOfOrder && <Bar pct={pc} color={statColor(st)}/>}
                        {m.outOfOrder && q.some(o=>o.warpStatus==="on-machine") && (
                          <div style={{fontSize:11,color:"#E24B4A",padding:"4px 0"}}>
                            ⚠️ In-progress warp cannot be moved. Mark it done when finished.
                          </div>
                        )}
                        {q.length===0
                          ? <div style={{fontSize:12,color:"#bbb",paddingTop:4}}>No orders assigned</div>
                          : <div style={{marginTop:6}}>
                            {/* running warp blocks */}
                            {running.map(o=>(
                              <div key={o.id} style={{...S.activeWarp,
                                borderColor:"#639922",background:"#EDFBEE",marginBottom:4}}>
                                <div style={{display:"flex",alignItems:"flex-start",gap:6}}>
                                  <div style={{flex:1}}>
                                    <div style={{...S.activeLabel,color:"#166534"}}>🔒 Running on machine</div>
                                    <div style={{fontSize:13,fontWeight:500}}>{o.textile}</div>
                                    <div style={{fontSize:11,color:"#888"}}>{o.fabricType} · {o.color} · {o.quantity}m</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {/* pending warp group blocks with reorder arrows */}
                            {warpBlocks.map((block, bi)=>{
                              const wk = warpKey(block[0])
                              const totalM = block.reduce((s,o)=>s+o.quantity,0)
                              const topPri = block.reduce((best,o) => PRI[o.priority]>PRI[best.priority]?o:best, block[0]).priority
                              return (
                                <div key={wk+bi} style={{
                                  border:"0.5px solid #e5e5e5",borderRadius:8,
                                  marginBottom:6,overflow:"hidden",
                                  borderLeft: bi===0 ? "3px solid #7F77DD" : "3px solid #e0e0e0",
                                }}>
                                  {/* warp group header */}
                                  <div style={{display:"flex",alignItems:"center",gap:8,
                                    padding:"6px 10px",background:bi===0?"#F8F7FF":"#fafafa"}}>
                                    <div style={{flex:1}}>
                                      <span style={{fontSize:12,fontWeight:600,color:bi===0?"#534AB7":"#555"}}>
                                        {bi===0?"▶ ":""}{block[0].fabricType} · {block[0].color}
                                      </span>
                                      <span style={{fontSize:11,color:"#aaa",marginLeft:8}}>
                                        {block.length} order{block.length>1?"s":""} · {totalM}m
                                      </span>
                                      <Badge text={topPri} color={priColor(topPri)}/>
                                    </div>
                                    {/* reorder arrows */}
                                    <div style={{display:"flex",gap:2}}>
                                      <button
                                        onClick={()=>moveWarpGroup(m.id, wk, "up")}
                                        disabled={bi===0}
                                        style={{...S.btnIcon,fontSize:12,opacity:bi===0?0.3:1,padding:"2px 5px",
                                          border:"0.5px solid #e0e0e0",borderRadius:4}}
                                        title="Move warp group earlier">▲</button>
                                      <button
                                        onClick={()=>moveWarpGroup(m.id, wk, "down")}
                                        disabled={bi===warpBlocks.length-1}
                                        style={{...S.btnIcon,fontSize:12,opacity:bi===warpBlocks.length-1?0.3:1,padding:"2px 5px",
                                          border:"0.5px solid #e0e0e0",borderRadius:4}}
                                        title="Move warp group later">▼</button>
                                    </div>
                                  </div>
                                  {/* orders in this warp block */}
                                  {block.map((o,oi)=>(
                                    <div key={o.id} style={{...S.qItem,
                                      margin:0,borderRadius:0,borderBottom:"0.5px solid #f0f0f0",
                                      background:bi===0&&oi===0?"#F8F7FF":"transparent"}}>
                                      <span style={S.qNum}>{running.length + warpBlocks.slice(0,bi).reduce((s,b)=>s+b.length,0) + oi + 1}</span>
                                      <span style={{flex:1,fontSize:12}}>
                                        {o.textile} · {o.quantity}m
                                        {o.orderNumber&&<span style={{color:"#aaa",marginLeft:6}}>#{o.orderNumber}</span>}
                                        {o.forcedMachineId&&<span style={{...S.sameWarp,marginLeft:4,background:"#F3F2FD",color:"#7F77DD"}}>⚡</span>}
                                      </span>
                                      <Badge text={o.priority} color={priColor(o.priority)}/>
                                      <button onClick={()=>setForceSwitchOrder(o)}
                                        style={{...S.btnSm,fontSize:10,padding:"2px 6px",color:"#7F77DD",
                                          border:"0.5px solid #c4c0f0",background:"#F3F2FD",marginLeft:4}}>⚡</button>
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                        }
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* warp groups card */}
              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Warp groups</span><span style={S.cSub}>per machine · fabric + color</span></div>
                <div style={S.cBody}>
                  {Object.keys(warpGroups).length===0&&<div style={S.empty}>No orders yet.</div>}
                  {Object.entries(warpGroups).map(([key,{label,machine,meters,count,orderIds,closed}])=>(
                    <div key={key} style={{padding:"10px 0",borderBottom:"0.5px solid #f5f5f5",
                      opacity: closed ? 0.85 : 1}}>
                      <div style={{display:"flex",alignItems:"center"}}>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:13,fontWeight:500}}>{label}</span>
                            {closed && (
                              <span style={{background:"#EDFBEE",color:"#166534",borderRadius:4,
                                padding:"1px 7px",fontSize:10,fontWeight:600}}>
                                🔒 Warp running
                              </span>
                            )}
                          </div>
                          <div style={{fontSize:11,color:"#888",display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                            <span>→ {machine}</span>
                            <span>·</span>
                            <span>{count} order{count>1?"s":""}</span>
                            {count>1&&!closed&&<span style={S.sameWarp}>same warp</span>}
                          </div>
                        </div>
                        <div style={{fontSize:13,color:"#555",marginRight:10}}>{meters}m</div>
                      </div>
                      {/* action buttons */}
                      <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                        {!closed && (
                          <button
                            onClick={()=>warpNextRun(orderIds)}
                            style={{...S.btnSm,fontSize:11,padding:"4px 10px",
                              background:"#FEF9EE",color:"#92400E",border:"0.5px solid #FCD34D"}}
                            title="Seal this warp — orders move to on-machine. New same-color orders start a fresh warp.">
                            🔒 Warp done, start next
                          </button>
                        )}
                        <button
                          onClick={()=>warpGroupDone(orderIds)}
                          style={{...S.btnSm,fontSize:11,padding:"4px 10px",
                            background:"#EDFBEE",color:"#166534",border:"0.5px solid #86EFAC"}}
                          title="All orders in this warp are fully woven — move to history">
                          ✅ All orders done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ORDERS VIEW ───────────────────────────────── */}
        {view==="orders" && (
          <div style={S.viewPad}>
            <div style={S.card}>
              <div style={S.cHead}>
                <span style={S.cTitle}>Active orders</span>
                <span style={S.cSub}>{filteredOrders.length} shown · done orders in History</span>
              </div>
              <div style={S.cBody}>
                {filteredOrders.length===0&&<div style={S.empty}>No orders match your search.</div>}
                {filteredOrders.map(o=>{
                  const warn  = dlWarn(o.deadline)
                  // find which machine this order is currently assigned to via schedule
                  const assignedMachine = machines.find(m => (schedule[m.id]??[]).some(x => x.id === o.id))
                  return (
                    <div key={o.id} style={S.oRow}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:priColor(o.priority),marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:500}}>{o.textile}</div>
                        <div style={{fontSize:12,color:"#888",marginTop:2}}>{o.fabricType} · {o.color} · {(o.machineCategories??[]).join(", ")}</div>
                        {o.deadline&&(
                          <div style={{fontSize:11,marginTop:3,
                            color:warn==="urgent"?"#E24B4A":warn==="soon"?"#BA7517":"#aaa"}}>
                            {warn==="urgent"?"⚠️ ":""}Due {o.deadline}
                          </div>
                        )}
                        {o.notes&&<div style={{fontSize:11,color:"#aaa",marginTop:2,fontStyle:"italic"}}>{o.notes}</div>}
                        {o.orderNumber&&<div style={{fontSize:11,color:"#7F77DD",marginTop:2,fontWeight:500}}>#{o.orderNumber}</div>}
                        {assignedMachine&&<div style={{fontSize:11,color:"#7F77DD",marginTop:2}}>→ {assignedMachine.name}</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
                        <Badge text={o.priority} color={priColor(o.priority)}/>
                        <span style={{fontSize:13}}>{o.quantity}m</span>
                        <span style={{fontSize:11,color:"#aaa"}}>Warp: {calcWarp(o.quantity)}m</span>
                        <div style={{display:"flex",gap:5,alignItems:"center"}}>
                          <select style={{...S.inlineSel,color:warpColor(o.warpStatus)}}
                            value={o.warpStatus} onChange={e=>setWarpSt(o.id,e.target.value as WarpStatus)}>
                            <option value="not-started">Not started</option>
                            <option value="on-machine">On machine</option>
                            <option value="done">Done</option>
                          </select>
                          <button style={S.btnIcon} onClick={()=>openEditOrder(o)} title="Edit">✏️</button>
                          <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>delOrder(o.id)} title="Delete">🗑</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── MACHINES VIEW ─────────────────────────────── */}
        {view==="machines" && (
          <div style={S.viewPad}>
            <div style={S.card}>
              <div style={S.cHead}>
                <span style={S.cTitle}>Machines</span>
                <button style={S.btnSm} onClick={()=>{resetMF();setShowMM(true)}}>+ Add machine</button>
              </div>
              <div style={S.cBody}>
                {machines.length===0&&<div style={S.empty}>No machines added yet.</div>}
                {machines.map(m=>{
                  const ld = machineLoad(schedule,m.id)
                  const st = m.outOfOrder ? "OUT OF ORDER" : machineStatus(ld,m.capacity)
                  const pc = loadPct(ld,m.capacity)
                  const ooColor = "#E24B4A"
                  const dotBg = m.outOfOrder ? ooColor : statColor(st)
                  return (
                    <div key={m.id} style={{display:"flex",alignItems:"flex-start",gap:12,
                      padding:"14px 0",borderBottom:"0.5px solid #f5f5f5",
                      opacity: m.outOfOrder ? 0.7 : 1}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:dotBg,marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:14,fontWeight:500}}>{m.name}</span>
                          {m.outOfOrder && (
                            <span style={{background:"#FEEBEB",color:ooColor,borderRadius:4,
                              padding:"1px 7px",fontSize:11,fontWeight:600}}>OUT OF ORDER</span>
                          )}
                        </div>
                        <div style={{fontSize:12,color:"#888",marginTop:2}}>{m.category}</div>
                        {!m.outOfOrder && <Bar pct={pc} color={statColor(st)} h={5}/>}
                        {m.outOfOrder && (
                          <div style={{fontSize:11,color:ooColor,marginTop:4}}>
                            Not-started orders have been reassigned automatically.
                          </div>
                        )}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        {!m.outOfOrder && <div style={{fontSize:13}}>{ld}m / {m.capacity}m</div>}
                        {!m.outOfOrder && <Badge text={st} color={statColor(st)}/>}
                        <div style={{display:"flex",gap:5,justifyContent:"flex-end",marginTop:8,flexWrap:"wrap"}}>
                          {/* out-of-order toggle */}
                          <button
                            onClick={()=>toggleOutOfOrder(m)}
                            style={{...S.btnSm,
                              background: m.outOfOrder ? "#639922" : "#FEF3C7",
                              color:       m.outOfOrder ? "#fff"    : "#92400E",
                              border:      m.outOfOrder ? "none"    : "0.5px solid #FCD34D",
                              fontSize:11, padding:"4px 10px"}}>
                            {m.outOfOrder ? "✓ Back online" : "⚠ Out of order"}
                          </button>
                          <button style={S.btnIcon} onClick={()=>openEditMachine(m)}>✏️</button>
                          <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>delMachine(m.id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYTICS VIEW ────────────────────────────── */}
        {view==="analytics" && (
          <div style={S.viewPad}>
            <div style={S.twoCol}>
              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Machine load</span></div>
                <div style={S.cBody}>
                  {machines.length===0&&<div style={S.empty}>No machines yet.</div>}
                  {machines.map(m=>{
                    const ld=machineLoad(schedule,m.id); const st=machineStatus(ld,m.capacity); const pc=loadPct(ld,m.capacity)
                    return (
                      <div key={m.id} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                          <span>{m.name}</span><span style={{color:statColor(st)}}>{pc}% — {st}</span>
                        </div>
                        <Bar pct={pc} color={statColor(st)} h={8}/>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Priority breakdown</span></div>
                <div style={S.cBody}>
                  {(["High","Normal","Low"] as Priority[]).map(p=>{
                    const cnt=orders.filter(o=>o.priority===p).length
                    const pc=orders.length?Math.round(cnt/orders.length*100):0
                    return (
                      <div key={p} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                          <span>{p}</span><span style={{color:priColor(p)}}>{cnt} ({pc}%)</span>
                        </div>
                        <Bar pct={pc} color={priColor(p)} h={8}/>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Warp status</span></div>
                <div style={S.cBody}>
                  {(["not-started","on-machine","done"] as WarpStatus[]).map(st=>{
                    const cnt=orders.filter(o=>o.warpStatus===st).length
                    const pc=orders.length?Math.round(cnt/orders.length*100):0
                    const label=st==="on-machine"?"On machine":st==="done"?"Done":"Not started"
                    return (
                      <div key={st} style={{marginBottom:14}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                          <span>{label}</span><span style={{color:warpColor(st)}}>{cnt} ({pc}%)</span>
                        </div>
                        <Bar pct={pc} color={warpColor(st)} h={8}/>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cHead}><span style={S.cTitle}>Orders per category</span></div>
                <div style={S.cBody}>
                  {CATS.map(cat=>{
                    const cnt=orders.filter(o=>(o.machineCategories??[]).includes(cat)).length
                    const pc=orders.length?Math.round(cnt/orders.length*100):0
                    return (
                      <div key={cat} style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                          <span>{cat}</span><span style={{color:"#888"}}>{cnt}</span>
                        </div>
                        <Bar pct={pc} color="#7F77DD" h={6}/>
                      </div>
                    )
                  })}
                  <div style={{marginTop:12,fontSize:12,color:"#aaa"}}>
                    Total: {totalLoad.toLocaleString()}m
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY VIEW ──────────────────────────────── */}
        {view==="history" && (()=>{
          const doneOrders = orders.filter(o => o.warpStatus === "done")
          const filtered = historySearch.trim()
            ? doneOrders.filter(o =>
                o.textile.toLowerCase().includes(historySearch.toLowerCase()) ||
                o.color.toLowerCase().includes(historySearch.toLowerCase()) ||
                o.fabricType.toLowerCase().includes(historySearch.toLowerCase())
              )
            : doneOrders
          const totalDoneMeters = doneOrders.reduce((s,o)=>s+o.quantity,0)
          return (
            <div style={S.viewPad}>
              {/* summary strip */}
              <div style={{display:"flex",gap:12,marginBottom:16}}>
                <div style={S.mCard}>
                  <div style={S.mLabel}>Completed orders</div>
                  <div style={S.mVal}>{doneOrders.length}</div>
                </div>
                <div style={S.mCard}>
                  <div style={S.mLabel}>Total meters produced</div>
                  <div style={S.mVal}>{totalDoneMeters.toLocaleString()}m</div>
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cHead}>
                  <span style={S.cTitle}>Completed orders</span>
                  <span style={S.cSub}>{filtered.length} shown</span>
                  {/* search inside history */}
                  <div style={{position:"relative",display:"flex",alignItems:"center",marginLeft:"auto"}}>
                    <span style={{position:"absolute",left:9,fontSize:12,pointerEvents:"none"}}>🔍</span>
                    <input style={{...S.search,width:160,marginBottom:0,paddingLeft:28}}
                      placeholder="Search history…"
                      value={historySearch}
                      onChange={e=>setHistorySearch(e.target.value)}/>
                  </div>
                </div>
                <div style={S.cBody}>
                  {filtered.length===0 && (
                    <div style={{...S.empty,textAlign:"center",padding:"32px 0"}}>
                      <div style={{fontSize:28,marginBottom:8}}>🕓</div>
                      <div style={{fontWeight:500,marginBottom:4}}>No completed orders yet</div>
                      <div style={{fontSize:12,color:"#bbb"}}>
                        Orders marked as done will appear here.
                      </div>
                    </div>
                  )}
                  {filtered.map(o=>{
                    const warn = dlWarn(o.deadline)
                    return (
                      <div key={o.id} style={{...S.oRow,opacity:0.8}}>
                        {/* green done pip */}
                        <div style={{width:6,height:6,borderRadius:"50%",
                          background:"#639922",marginTop:5,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:14,fontWeight:500,
                            textDecoration:"line-through",color:"#666"}}>{o.textile}</div>
                          <div style={{fontSize:12,color:"#aaa",marginTop:2}}>
                            {o.fabricType} · {o.color} · {(o.machineCategories??[]).join(", ")}
                          </div>
                          {o.deadline&&(
                            <div style={{fontSize:11,marginTop:3,
                              color:warn==="urgent"?"#E24B4A":warn==="soon"?"#BA7517":"#aaa"}}>
                              {warn==="urgent"?"⚠️ Late — ":""}Due {o.deadline}
                            </div>
                          )}
                          {o.notes&&<div style={{fontSize:11,color:"#bbb",marginTop:2,fontStyle:"italic"}}>{o.notes}</div>}
                          {o.orderNumber&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,fontWeight:500}}>#{o.orderNumber}</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                          <Badge text="Done" color="#639922"/>
                          <span style={{fontSize:13,color:"#aaa"}}>{o.quantity}m</span>
                          <Badge text={o.priority} color={priColor(o.priority)}/>
                          {/* restore button — move back to active if marked done by mistake */}
                          <button
                            onClick={async ()=>{
                              const restored = {...o, warpStatus:"not-started" as WarpStatus}
                              setOrders(p=>p.map(x=>x.id===o.id?restored:x))
                              await dbUpsert("orders", restored as unknown as Record<string,unknown>)
                            }}
                            style={{...S.btnSm,fontSize:10,padding:"2px 8px",marginTop:2,color:"#888"}}>
                            ↩ Restore
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── SUGGESTIONS VIEW ──────────────────────────── */}
        {view==="suggestions" && (()=>{

          // ── ANALYSIS ENGINE ─────────────────────────────────
          type Suggestion = {
            id: string
            type: "move-to-free-machine" | "merge-warps" | "split-overloaded"
            title: string
            detail: string
            impact: string
            affectedOrderIds: number[]
            targetMachineId?: number
            severity: "high" | "medium" | "low"
          }

          const suggestions: Suggestion[] = []

          // ── ANALYSIS 1: overloaded machine has flexible orders
          // Find orders on overloaded machines that can run on another machine with capacity
          for (const m of machines) {
            const ld = machineLoad(schedule, m.id)
            const cap = m.capacity ?? DEFAULT_CAP
            if (ld <= cap) continue   // not overloaded

            const machineOrders = (schedule[m.id] ?? []).filter(o => o.warpStatus === "not-started")
            for (const o of machineOrders) {
              if (o.machineCategories.length < 2) continue   // can't move — only fits this machine
              // find a compatible machine with available capacity
              const alternatives = machines.filter(alt =>
                alt.id !== m.id &&
                !alt.outOfOrder &&
                o.machineCategories.includes(alt.category) &&
                machineLoad(schedule, alt.id) + o.quantity <= (alt.capacity ?? DEFAULT_CAP)
              )
              if (!alternatives.length) continue
              // pick best alternative — same warp bonus or least loaded
              const best = alternatives.reduce((b, alt) => {
                const altQ = schedule[alt.id] ?? []
                const sameWarp = altQ.some(x => warpKey(x) === warpKey(o))
                const bQ = schedule[b.id] ?? []
                const bSameWarp = bQ.some(x => warpKey(x) === warpKey(o))
                if (sameWarp && !bSameWarp) return alt
                if (!sameWarp && bSameWarp) return b
                return machineLoad(schedule,alt.id) < machineLoad(schedule,b.id) ? alt : b
              })
              const altQ = schedule[best.id] ?? []
              const sameWarp = altQ.some(x => warpKey(x) === warpKey(o))
              suggestions.push({
                id: `move-${o.id}`,
                type: "move-to-free-machine",
                title: `Move "${o.textile}" off overloaded ${m.name}`,
                detail: `This order (${o.quantity}m · ${o.fabricType} · ${o.color}) is on ${m.name} which is at ${Math.round(ld/cap*100)}% capacity. It can also run on ${best.name} which has room.${sameWarp ? " ✦ Same warp already on "+best.name+" — no changeover needed." : ""}`,
                impact: `Frees ${o.quantity}m from ${m.name} · ${sameWarp ? "zero extra changeover" : "one new changeover on "+best.name}`,
                affectedOrderIds: [o.id],
                targetMachineId: best.id,
                severity: ld/cap > 1.3 ? "high" : "medium",
              })
            }
          }

          // ── ANALYSIS 2: same warp split across two machines
          // Orders with same fabric+color are on different machines — could be merged
          const warpMachineMap: Record<string, Set<number>> = {}
          for (const m of machines) {
            for (const o of (schedule[m.id] ?? []).filter(o => o.warpStatus === "not-started")) {
              const wk = warpKey(o)
              if (!warpMachineMap[wk]) warpMachineMap[wk] = new Set()
              warpMachineMap[wk].add(m.id)
            }
          }
          for (const [wk, machineIds] of Object.entries(warpMachineMap)) {
            if (machineIds.size < 2) continue
            const mIds = [...machineIds]
            // find the machine with more of this warp — that's the "primary"
            const primary = mIds.reduce((a, b) =>
              (schedule[a]??[]).filter(o=>warpKey(o)===wk).reduce((s,o)=>s+o.quantity,0) >
              (schedule[b]??[]).filter(o=>warpKey(o)===wk).reduce((s,o)=>s+o.quantity,0) ? a : b
            )
            const secondary = mIds.filter(id=>id!==primary)
            for (const secId of secondary) {
              const movableOrders = (schedule[secId]??[]).filter(o =>
                warpKey(o)===wk && o.warpStatus==="not-started" && o.machineCategories.length > 1
              )
              if (!movableOrders.length) continue
              const primM = machines.find(m=>m.id===primary)
              const secM  = machines.find(m=>m.id===secId)
              if (!primM || !secM) continue
              const totalMoving = movableOrders.reduce((s,o)=>s+o.quantity,0)
              const primLoad = machineLoad(schedule, primary)
              const primCap  = primM.capacity ?? DEFAULT_CAP
              if (primLoad + totalMoving > primCap * 1.1) continue  // would overload primary
              suggestions.push({
                id: `merge-${wk}-${secId}`,
                type: "merge-warps",
                title: `Merge ${wk.replace("||","·")} warp onto one machine`,
                detail: `This warp (${wk.replace("||"," · ")}) is split across ${primM.name} and ${secM.name}. Consolidating onto ${primM.name} saves ${movableOrders.length} changeover${movableOrders.length>1?"s":""}. Total: ${totalMoving}m moving.`,
                impact: `Eliminates ${movableOrders.length} changeover${movableOrders.length>1?"s":""} · saves warp setup time`,
                affectedOrderIds: movableOrders.map(o=>o.id),
                targetMachineId: primary,
                severity: movableOrders.length > 2 ? "high" : "medium",
              })
            }
          }

          // ── ANALYSIS 3: deadline urgency — high priority order queued late
          for (const m of machines) {
            const q = getOrderedQueue(m.id).filter(o => o.warpStatus === "not-started")
            for (let i = 1; i < q.length; i++) {
              const o = q[i]
              if (!o.deadline || o.priority !== "High") continue
              const diff = (new Date(o.deadline).getTime() - Date.now()) / 86400000
              if (diff > 5) continue
              const ahead = q.slice(0, i)
              const aheadLow = ahead.filter(x => x.priority === "Low" || x.priority === "Normal")
              if (!aheadLow.length) continue
              suggestions.push({
                id: `urgent-${o.id}`,
                type: "split-overloaded",
                title: `Urgent order "${o.textile}" is queued behind lower-priority work`,
                detail: `"${o.textile}" (High priority, due in ${Math.round(diff)} days) is position ${i+1} in ${m.name}'s queue. There are ${aheadLow.length} lower-priority order${aheadLow.length>1?"s":""} ahead of it.`,
                impact: `Reorder queue to run urgent order first`,
                affectedOrderIds: [o.id],
                targetMachineId: m.id,
                severity: diff < 2 ? "high" : "medium",
              })
            }
          }

          const sorted = suggestions
            .filter(sg => !dismissedSuggestions.has(sg.id))
            .sort((a,b) =>
              (a.severity==="high"?0:a.severity==="medium"?1:2) -
              (b.severity==="high"?0:b.severity==="medium"?1:2)
            )

          return (
            <div style={S.viewPad}>
              <div style={{marginBottom:16}}>
                <div style={{fontSize:18,fontWeight:600,marginBottom:4}}>💡 Smart Suggestions</div>
                <div style={{fontSize:13,color:"#888"}}>
                  Analysis of your current schedule. Each suggestion can be accepted or declined — accepting changes the production plan, declining dismisses it.
                  <strong style={{color:"#534AB7"}}> Your dashboard is never changed until you accept.</strong>
                </div>
              </div>

              {sorted.length===0 && (
                <div style={{...S.card,padding:40,textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:12}}>✅</div>
                  <div style={{fontWeight:500,marginBottom:6}}>Your schedule looks optimal</div>
                  <div style={{fontSize:13,color:"#aaa"}}>No issues found. Add more orders or machines to get suggestions.</div>
                </div>
              )}

              {sorted.map(sg=>(
                <div key={sg.id} style={{...S.card,marginBottom:12,borderLeft:`3px solid ${
                  sg.severity==="high"?"#E24B4A":sg.severity==="medium"?"#EF9F27":"#639922"
                }`}}>
                  <div style={S.cBody}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                      <div style={{
                        width:32,height:32,borderRadius:8,flexShrink:0,
                        background:sg.severity==="high"?"#FEEBEB":sg.severity==="medium"?"#FEF3C7":"#EDFBEE",
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
                      }}>
                        {sg.type==="move-to-free-machine"?"🔀":sg.type==="merge-warps"?"🧵":"⚡"}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                          <span style={{fontSize:14,fontWeight:600}}>{sg.title}</span>
                          <span style={{
                            fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:20,
                            background:sg.severity==="high"?"#FEEBEB":sg.severity==="medium"?"#FEF3C7":"#EDFBEE",
                            color:sg.severity==="high"?"#A32D2D":sg.severity==="medium"?"#92400E":"#166534",
                          }}>{sg.severity.toUpperCase()}</span>
                        </div>
                        <div style={{fontSize:13,color:"#555",marginBottom:6,lineHeight:1.5}}>{sg.detail}</div>
                        <div style={{fontSize:12,color:"#7F77DD",fontWeight:500,marginBottom:12}}>
                          📈 Impact: {sg.impact}
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button
                            style={{...S.btnPrimary,fontSize:12,padding:"6px 16px"}}
                            onClick={async ()=>{
                              if (sg.type==="move-to-free-machine" && sg.targetMachineId) {
                                for (const oid of sg.affectedOrderIds) {
                                  await forceSwitch(oid, sg.targetMachineId)
                                }
                              } else if (sg.type==="merge-warps" && sg.targetMachineId) {
                                for (const oid of sg.affectedOrderIds) {
                                  await forceSwitch(oid, sg.targetMachineId)
                                }
                              } else if (sg.type==="split-overloaded" && sg.targetMachineId) {
                                // move urgent order to front by clearing its force and bumping warp order
                                const o = orders.find(x=>x.id===sg.affectedOrderIds[0])
                                if (o) moveWarpGroup(sg.targetMachineId, warpKey(o), "up")
                              }
                            }}>
                            ✓ Accept
                          </button>
                          <button style={{...S.btnSm,fontSize:12,padding:"6px 16px"}}
                            onClick={()=>setDismissedSuggestions(p=>new Set([...p,sg.id]))}>
                            ✕ Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* ── TEXTILES VIEW ─────────────────────────────── */}
        {view==="textiles" && (
          <div style={S.viewPad}>
            <div style={S.card}>
              <div style={S.cHead}>
                <span style={S.cTitle}>Textile database</span>
                <span style={S.cSub}>{textiles.length} saved</span>
                <button style={S.btnSm} onClick={()=>{resetTF();setShowTM(true)}}>+ Add textile</button>
              </div>
              <div style={S.cBody}>
                {textiles.length===0 && (
                  <div style={{...S.empty, textAlign:"center", padding:"32px 0"}}>
                    <div style={{fontSize:32,marginBottom:8}}>🧵</div>
                    <div style={{fontWeight:500,marginBottom:4}}>No textiles yet</div>
                    <div style={{fontSize:12,color:"#bbb",marginBottom:16}}>
                      Save your textiles here once — then pick them when adding orders instead of typing everything each time.
                    </div>
                    <button style={S.btnPrimary} onClick={()=>{resetTF();setShowTM(true)}}>Add first textile</button>
                  </div>
                )}
                {textiles.map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"0.5px solid #f5f5f5"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:"#EEEDFE",display:"flex",
                      alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🧵</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:500}}>{t.name}</div>
                      <div style={{fontSize:12,color:"#888",marginTop:2}}>{t.fabricType} · {t.color}</div>
                      <div style={{fontSize:11,color:"#aaa",marginTop:4,display:"flex",flexWrap:"wrap",gap:4}}>
                        {t.machineCategories.map(c=>(
                          <span key={c} style={{background:"#f0f0f0",borderRadius:4,padding:"1px 7px"}}>{c}</span>
                        ))}
                      </div>
                      {t.notes&&<div style={{fontSize:11,color:"#bbb",marginTop:4,fontStyle:"italic"}}>{t.notes}</div>}
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0}}>
                      <button style={S.btnIcon} onClick={()=>openEditTextile(t)}>✏️</button>
                      <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>delTextile(t.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>{/* end S.main */}

      {/* ── MODALS ──────────────────────────────────────── */}
      {showOM&&(
        <Modal title="New order" onClose={()=>{setShowOM(false);resetOF()}}>
          <OrderFormUI {...orderFormProps}/>
        </Modal>
      )}
      {editO&&(
        <Modal title="Edit order" onClose={()=>{setEditO(null);resetOF()}}>
          <OrderFormUI {...orderFormProps}/>
        </Modal>
      )}
      {showMM&&(
        <Modal title="New machine" onClose={()=>{setShowMM(false);resetMF()}}>
          <MachineFormUI {...machineFormProps}/>
        </Modal>
      )}
      {editM&&(
        <Modal title="Edit machine" onClose={()=>{setEditM(null);resetMF()}}>
          <MachineFormUI {...machineFormProps}/>
        </Modal>
      )}
      {showTM&&(
        <Modal title="New textile" onClose={()=>{setShowTM(false);resetTF()}}>
          <TextileFormUI {...textileFormProps}/>
        </Modal>
      )}
      {editT&&(
        <Modal title="Edit textile" onClose={()=>{setEditT(null);resetTF()}}>
          <TextileFormUI {...textileFormProps}/>
        </Modal>
      )}

      {/* ── FORCE SWITCH MODAL ────────────────────────── */}
      {forceSwitchOrder&&(
        <Modal title={`Force switch: ${forceSwitchOrder.textile}`} onClose={()=>setForceSwitchOrder(null)}>
          <div style={{fontSize:13,color:"#888",marginBottom:16}}>
            Pick a machine to force-assign this order to. The optimizer will be overridden
            and this order will stay on the chosen machine until you clear it.
          </div>
          <div style={{fontSize:12,color:"#aaa",marginBottom:12}}>
            Order: {forceSwitchOrder.fabricType} · {forceSwitchOrder.color} · {forceSwitchOrder.quantity}m
          </div>
          {machines.filter(m=>!m.outOfOrder).map(m=>{
            const compat = forceSwitchOrder.machineCategories.includes(m.category)
            const ld = machineLoad(schedule, m.id)
            const st = machineStatus(ld, m.capacity)
            return (
              <div key={m.id}
                onClick={()=>compat && forceSwitch(forceSwitchOrder.id, m.id)}
                style={{
                  display:"flex", alignItems:"center", gap:12,
                  padding:"10px 12px", marginBottom:6, borderRadius:8,
                  border:`1px solid ${compat?"#d0d0d0":"#f0f0f0"}`,
                  background: compat ? "#fafafa" : "#f7f7f7",
                  cursor: compat ? "pointer" : "not-allowed",
                  opacity: compat ? 1 : 0.45,
                }}
                onMouseEnter={e=>{ if(compat) e.currentTarget.style.background="#F3F2FD" }}
                onMouseLeave={e=>{ if(compat) e.currentTarget.style.background="#fafafa" }}
              >
                <div style={{width:8,height:8,borderRadius:"50%",background:statColor(st),flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{m.name}</div>
                  <div style={{fontSize:11,color:"#888"}}>{m.category} · {ld}m loaded</div>
                </div>
                {!compat && <span style={{fontSize:11,color:"#ccc"}}>incompatible type</span>}
                {compat && forceSwitchOrder.forcedMachineId===m.id && (
                  <span style={{...S.sameWarp}}>current</span>
                )}
              </div>
            )
          })}
          {forceSwitchOrder.forcedMachineId && (
            <button style={{...S.btnSm,marginTop:8,width:"100%",color:"#888"}}
              onClick={()=>{ clearForce(forceSwitchOrder.id); setForceSwitchOrder(null) }}>
              Clear force — let optimizer decide
            </button>
          )}
        </Modal>
      )}
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────
const S: Record<string,CSSProperties> = {
  shell:      {display:"flex",height:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",background:"#F7F6F3",color:"#1a1a1a",overflow:"hidden"},
  sidebar:    {width:174,background:"#111318",display:"flex",flexDirection:"column",padding:"14px 10px",gap:2,flexShrink:0},
  logo:       {width:34,height:34,borderRadius:8,background:"#7F77DD",color:"#EEEDFE",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14,marginBottom:14,alignSelf:"flex-start",marginLeft:4},
  navBtn:     {display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,border:"none",background:"transparent",color:"#9ca3af",cursor:"pointer",fontSize:13,textAlign:"left"},
  navActive:  {background:"#1e2130",color:"#e5e7eb"},
  main:       {flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  topbar:     {background:"#fff",borderBottom:"0.5px solid #e5e5e5",padding:"0 20px",height:52,display:"flex",alignItems:"center",gap:10,flexShrink:0},
  search:     {padding:"6px 10px 6px 28px",border:"0.5px solid #d5d5d5",borderRadius:8,fontSize:13,background:"#f7f7f7",width:180,outline:"none"},
  viewPad:    {flex:1,padding:20,overflowY:"auto"},
  twoCol:     {display:"grid",gridTemplateColumns:"1fr 1fr",gap:14},
  metrics:    {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16},
  mCard:      {background:"#fff",borderRadius:10,border:"0.5px solid #e5e5e5",padding:"14px 16px"},
  mLabel:     {fontSize:11,color:"#888",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.5px"},
  mVal:       {fontSize:24,fontWeight:500,lineHeight:"1"},
  mSub:       {fontSize:11,color:"#aaa",marginTop:4},
  alert:      {background:"#FAEEDA",border:"0.5px solid #EF9F27",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#633806",marginBottom:12},
  card:       {background:"#fff",borderRadius:12,border:"0.5px solid #e5e5e5",overflow:"hidden",marginBottom:14},
  cHead:      {padding:"12px 16px",borderBottom:"0.5px solid #efefef",display:"flex",alignItems:"center",gap:10},
  cTitle:     {fontWeight:500,fontSize:14,flex:1},
  cSub:       {fontSize:12,color:"#aaa"},
  cBody:      {padding:"12px 16px"},
  activeWarp: {border:"1.5px solid #7F77DD",borderRadius:8,padding:"7px 10px",marginBottom:6,marginTop:8},
  activeLabel:{fontSize:10,color:"#7F77DD",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2},
  qItem:      {background:"#f7f7f7",borderRadius:6,padding:"5px 8px",fontSize:12,color:"#666",display:"flex",alignItems:"center",gap:6,marginBottom:4},
  qNum:       {width:16,height:16,borderRadius:"50%",border:"0.5px solid #ccc",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#aaa",flexShrink:0},
  sameWarp:   {background:"#EEEDFE",color:"#534AB7",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:500},
  oRow:       {display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:"0.5px solid #f5f5f5"},
  inlineSel:  {border:"0.5px solid #e0e0e0",borderRadius:6,fontSize:11,padding:"3px 6px",background:"transparent",cursor:"pointer",outline:"none"},
  btnPrimary: {padding:"7px 14px",borderRadius:8,background:"#7F77DD",color:"#EEEDFE",border:"none",fontSize:13,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap"},
  btnSm:      {padding:"6px 12px",borderRadius:8,background:"transparent",border:"0.5px solid #d5d5d5",fontSize:13,cursor:"pointer",whiteSpace:"nowrap"},
  btnIcon:    {background:"transparent",border:"none",cursor:"pointer",fontSize:14,padding:2},
  label:      {display:"block",fontSize:12,color:"#555",marginBottom:5,fontWeight:500},
  input:      {width:"100%",padding:"8px 10px",border:"0.5px solid #d5d5d5",borderRadius:8,fontSize:13,background:"#fafafa",outline:"none",boxSizing:"border-box",fontFamily:"inherit"},
  warpPreview:{background:"#EEEDFE",color:"#534AB7",borderRadius:8,padding:"8px 12px",fontSize:13,marginBottom:14},
  overlay:    {position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100},
  modal:      {background:"#fff",borderRadius:14,border:"0.5px solid #e0e0e0",width:520,maxWidth:"90vw",maxHeight:"90vh",overflowY:"auto"},
  mHead:      {padding:"16px 20px",borderBottom:"0.5px solid #f0f0f0",display:"flex",alignItems:"center"},
  mTitle:     {fontWeight:500,fontSize:15,flex:1},
  closeBtn:   {background:"transparent",border:"none",fontSize:16,cursor:"pointer",color:"#888",padding:4},
  mBody:      {padding:20},
  empty:      {fontSize:13,color:"#bbb",padding:"10px 0"},
}
