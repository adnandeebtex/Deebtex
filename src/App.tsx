// ============================================================
//  DEEBTEX — App.tsx  (single file, drop into src/App.tsx)
//  Storage: Supabase (shared across all computers, real-time)
// ============================================================
import { useEffect, useMemo, useState, useRef } from "react"
import type { CSSProperties } from "react"
import { createClient } from "@supabase/supabase-js"
import type { Session } from "@supabase/supabase-js"

// ─── SUPABASE CLIENT ─────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── LOGIN SCREEN ─────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password.trim()) return
    setLoading(true); setError("")
    const { data, error: err } = await db.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err || !data.session) {
      setError("Incorrect email or password.")
    } else {
      onLogin(data.session)
    }
  }

  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"center",
      height:"100vh", background:"#F7F6F3",
      fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",
    }}>
      <div style={{
        background:"#fff", borderRadius:16, border:"0.5px solid #e5e5e5",
        padding:40, width:360, boxShadow:"0 8px 32px rgba(0,0,0,0.08)",
      }}>
        {/* logo */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <div style={{
            width:40,height:40,borderRadius:10,background:"#7F77DD",
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"#EEEDFE",fontWeight:700,fontSize:16,
          }}>Dt</div>
          <div>
            <div style={{fontWeight:600,fontSize:18}}>Deebtex</div>
            <div style={{fontSize:12,color:"#aaa"}}>Factory management</div>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:12,fontWeight:500,color:"#555",marginBottom:6}}>
            Email
          </label>
          <input
            style={{
              width:"100%",padding:"10px 12px",border:"0.5px solid #d5d5d5",
              borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box" as const,
              fontFamily:"inherit",
            }}
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            autoFocus
          />
        </div>

        <div style={{marginBottom:24}}>
          <label style={{display:"block",fontSize:12,fontWeight:500,color:"#555",marginBottom:6}}>
            Password
          </label>
          <input
            style={{
              width:"100%",padding:"10px 12px",border:"0.5px solid #d5d5d5",
              borderRadius:8,fontSize:14,outline:"none",boxSizing:"border-box" as const,
              fontFamily:"inherit",
            }}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
          />
        </div>

        {error && (
          <div style={{
            background:"#FEEBEB",color:"#A32D2D",borderRadius:8,
            padding:"8px 12px",fontSize:13,marginBottom:16,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width:"100%",padding:"11px",borderRadius:8,border:"none",
            background: loading ? "#c4c0f0" : "#7F77DD",
            color:"#EEEDFE",fontSize:14,fontWeight:600,cursor: loading ? "not-allowed" : "pointer",
            fontFamily:"inherit",
          }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  )
}

// ─── TEXTILE STOCK PICKER ─────────────────────────────────────
// Reusable searchable picker for selecting a textile from the DB
// Used in the textile stock modal — same UX as the order form picker
type TSPickerProps = {
  textiles: Textile[]
  selectedCode: string
  selectedName: string
  onPick: (code: string, name: string) => void
  onClear: () => void
}
function TextileStockPicker({ textiles, selectedCode, selectedName, onPick, onClear }: TSPickerProps) {
  const [search, setSearch] = useState("")
  const [open,   setOpen]   = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return textiles.slice(0, 10)
    const q = search.toLowerCase()
    return textiles.filter(t =>
      t.code.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.color.toLowerCase().includes(q) ||
      t.fabricType.toLowerCase().includes(q)
    ).slice(0, 20)
  }, [textiles, search])

  if (selectedCode) {
    return (
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
        border:"1.5px solid #7F77DD", borderRadius:8, background:"#F3F2FD" }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:500 }} dir="auto">
            {selectedCode}{selectedName ? ` — ${selectedName}` : ""}
          </div>
        </div>
        <button style={{ background:"none", border:"none", cursor:"pointer",
          fontSize:12, color:"#7F77DD" }} onClick={onClear}>✕ change</button>
      </div>
    )
  }

  return (
    <div style={{ position:"relative" }}>
      <div style={{ position:"relative", display:"flex", alignItems:"center" }}>
        <span style={{ position:"absolute", left:10, fontSize:13, color:"#aaa", pointerEvents:"none" }}>🔍</span>
        <input
          style={{ ...S.input, paddingLeft:32 }}
          placeholder={textiles.length===0 ? "No textiles in database yet" : `Search ${textiles.length} textiles…`}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={textiles.length===0}
          dir="auto"
        />
        {search && (
          <button style={{ position:"absolute", right:8, background:"none", border:"none",
            cursor:"pointer", color:"#aaa", fontSize:14 }}
            onClick={() => { setSearch(""); setOpen(false) }}>✕</button>
        )}
      </div>
      {open && textiles.length>0 && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:60,
          background:"#fff", border:"0.5px solid #e0e0e0", borderRadius:8,
          boxShadow:"0 4px 16px rgba(0,0,0,0.10)", maxHeight:220, overflowY:"auto" }}>
          {filtered.length===0
            ? <div style={{ padding:"12px 14px", fontSize:13, color:"#bbb" }}>No match found</div>
            : filtered.map(t => (
                <div key={t.id}
                  onMouseDown={() => { onPick(t.code, t.name); setSearch(""); setOpen(false) }}
                  style={{ padding:"9px 14px", cursor:"pointer", borderBottom:"0.5px solid #f5f5f5",
                    display:"flex", alignItems:"center", gap:10 }}
                  onMouseEnter={e => (e.currentTarget.style.background="#F3F2FD")}
                  onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:500 }} dir="auto">
                      {t.code}{t.name ? ` — ${t.name}` : ""}
                    </div>
                    <div style={{ fontSize:11, color:"#888" }}>{t.fabricType} · {t.color}</div>
                  </div>
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}
// This wraps the entire app. If no session → show login screen.
// Once logged in → show the full app. Session persists across refreshes.
export default function Root() {
  const [session, setSession] = useState<Session | null | "loading">("loading")

  useEffect(() => {
    // check existing session on mount
    db.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null)
    })
    // listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = db.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === "loading") {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",
        height:"100vh",background:"#F7F6F3",fontFamily:"sans-serif",color:"#aaa",fontSize:14}}>
        Loading…
      </div>
    )
  }

  if (!session) {
    return <LoginScreen onLogin={setSession}/>
  }

  return <App session={session} onLogout={async ()=>{
    await db.auth.signOut()
    setSession(null)
  }}/>
}

// ─── TYPES ───────────────────────────────────────────────────
type MachineCategory =
  | "Electronic Double" | "Electronic 4" | "Mechanical 4"
  | "Mechanical Double 280" | "Mechanical Double 140"
type Priority   = "High" | "Normal" | "Low"
type WarpStatus = "not-started" | "on-machine" | "done"
type View = "dashboard" | "orders" | "machines" | "textiles" | "analytics" | "history" | "suggestions" | "threads" | "textile-stock" | "import"

// warpOrder: per-machine ordered list of warpKeys — controls which warp group runs first
// key = machineId, value = array of warpKeys in display order
type WarpOrder = Record<number, string[]>

// ── THREAD (raw material wound onto warp beam) ───────────────
type Thread = {
  id: number
  code: string           // e.g. "THR-001"
  name: string           // e.g. "Cotton 60/2"
  color: string
  stockKg: number        // current stock in kg
  minThreshold: number   // low stock alert below this
  notes: string
}

// ── STOCK LOG ENTRY (in or out) ──────────────────────────────
type StockLogEntry = {
  id: number
  itemId: number         // thread id or textile code reference
  itemType: "thread" | "textile-stock"
  direction: "in" | "out"
  quantityKg?: number    // for threads
  quantityM?: number     // for textile stock
  date: string           // ISO date string
  note: string           // e.g. "Received from supplier" / "Delivered to client X"
  autoDeducted?: boolean // true = deducted automatically when warp was marked done
}

// ── TEXTILE STOCK (finished goods not yet delivered) ──────────
type TextileStock = {
  id: number
  textileCode: string    // links to Textile.code
  textileName: string
  stockM: number         // current finished stock in meters
  minThreshold: number   // low stock alert
  notes: string
}

type Machine = {
  id: number; name: string; category: MachineCategory; capacity: number
  outOfOrder?: boolean   // true = machine is down, orders reassigned automatically
}
const STORES = [
  "دمياط","دمياط ٢","عباس العقاد","الدقي",
  "سموحة","العطارين","لوران","العبور",
] as const

type Order   = {
  id: number
  textileCode: string
  textileName: string
  color: string; fabricType: string
  quantity: number; deadline: string; priority: Priority
  machineCategories: MachineCategory[]
  warpStatus: WarpStatus; notes: string
  orderNumber?: string
  orderDate?: string
  store?: string
  forcedMachineId?: number
  warpClosed?: boolean
  warpGroupId?: string
  completedAt?: string
}
// A saved textile definition
type Textile = {
  id: number
  code: string
  name: string
  color: string
  fabricType: string
  pattern: string     // e.g. "زهور", "هندسي"
  weave: string       // e.g. "ساتان", "تويل"
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
    // support old rows that still have "textile" field — treat it as textileCode
    textileCode:       String(row.textileCode ?? row.textile ?? ""),
    textileName:       String(row.textileName ?? ""),
    color:             String(row.color ?? ""),
    fabricType:        String(row.fabricType ?? ""),
    quantity:          Number(row.quantity ?? 0),
    deadline:          String(row.deadline ?? ""),
    priority:          (row.priority as Priority) ?? "Normal",
    machineCategories: (row.machineCategories as MachineCategory[]) ?? [],
    warpStatus:        (row.warpStatus as WarpStatus) ?? "not-started",
    notes:             String(row.notes ?? ""),
    orderNumber:       row.orderNumber ? String(row.orderNumber) : undefined,
    orderDate:         row.orderDate   ? String(row.orderDate)   : undefined,
    store:             row.store       ? String(row.store)       : undefined,
    forcedMachineId:   row.forcedMachineId != null ? Number(row.forcedMachineId) : undefined,
    warpClosed:        row.warpClosed === true,
    completedAt:       row.completedAt ? String(row.completedAt) : undefined,
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

function sanitizeThread(row: Record<string, unknown>): Thread {
  return {
    id:           Number(row.id),
    code:         String(row.code ?? ""),
    name:         String(row.name ?? ""),
    color:        String(row.color ?? ""),
    stockKg:      Number(row.stockKg ?? 0),
    minThreshold: Number(row.minThreshold ?? 0),
    notes:        String(row.notes ?? ""),
  }
}

function sanitizeStockLog(row: Record<string, unknown>): StockLogEntry {
  return {
    id:            Number(row.id),
    itemId:        Number(row.itemId ?? 0),
    itemType:      (row.itemType as "thread" | "textile-stock") ?? "thread",
    direction:     (row.direction as "in" | "out") ?? "in",
    quantityKg:    row.quantityKg != null ? Number(row.quantityKg) : undefined,
    quantityM:     row.quantityM  != null ? Number(row.quantityM)  : undefined,
    date:          String(row.date ?? ""),
    note:          String(row.note ?? ""),
    autoDeducted:  row.autoDeducted === true,
  }
}

function sanitizeTextileStock(row: Record<string, unknown>): TextileStock {
  return {
    id:           Number(row.id),
    textileCode:  String(row.textileCode ?? ""),
    textileName:  String(row.textileName ?? ""),
    stockM:       Number(row.stockM ?? 0),
    minThreshold: Number(row.minThreshold ?? 0),
    notes:        String(row.notes ?? ""),
  }
}

function sanitizeTextile(row: Record<string, unknown>): Textile {
  return {
    id:                Number(row.id),
    code:              String(row.code ?? row.name ?? ""),
    name:              String(row.name ?? ""),
    color:             String(row.color ?? ""),
    fabricType:        String(row.fabricType ?? ""),
    pattern:           String(row.pattern ?? ""),
    weave:             String(row.weave ?? ""),
    machineCategories: (row.machineCategories as MachineCategory[]) ?? [],
    notes:             String(row.notes ?? ""),
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
  const rows = await dbLoadRaw<Record<string, unknown>>("textiles")
  return rows.map(sanitizeTextile)
}
async function dbLoadThreads(): Promise<Thread[]> {
  const rows = await dbLoadRaw<Record<string, unknown>>("threads")
  return rows.map(sanitizeThread)
}
async function dbLoadStockLog(): Promise<StockLogEntry[]> {
  const rows = await dbLoadRaw<Record<string, unknown>>("stock_log")
  return rows.map(sanitizeStockLog)
}
async function dbLoadTextileStock(): Promise<TextileStock[]> {
  const rows = await dbLoadRaw<Record<string, unknown>>("textile_stock")
  return rows.map(sanitizeTextileStock)
}

// Upsert with retry + visible error + localStorage backup
async function dbUpsert(table: string, row: Record<string, unknown>) {
  // strip undefined/null fields — Supabase rejects rows containing
  // columns it doesn't recognise in its schema cache
  const cleanRow: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined && v !== null) cleanRow[k] = v
  }

  // always write to localStorage backup first — this never fails
  try {
    const key = `dtx_backup_${table}`
    const existing: Record<string, unknown>[] = JSON.parse(localStorage.getItem(key) || "[]")
    const idx = existing.findIndex(r => r.id === cleanRow.id)
    if (idx >= 0) existing[idx] = cleanRow
    else existing.push(cleanRow)
    localStorage.setItem(key, JSON.stringify(existing))
  } catch {}

  // try Supabase — retry once if it fails
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { error } = await db.from(table).upsert(cleanRow, { onConflict: "id" })
    if (!error) return   // success
    console.error(`dbUpsert ${table} attempt ${attempt}:`, error.message, error.details, cleanRow)
    if (attempt === 2) {
      console.warn(`⚠️ SAVE FAILED for ${table} id=${cleanRow.id}. Data is in localStorage backup.`)
    }
    await new Promise(r => setTimeout(r, 500))
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
  // Sort by warpKey FIRST so all orders sharing the same warp are processed
  // as a consecutive group. Within each warp group, most-constrained order
  // goes first (fewest compatible machines) so flexible orders follow it
  // to the same machine, not the other way around.
  const pending = orders
    .filter(o => !locked.has(o.id) && o.warpStatus === "not-started")
    .sort((a, b) => {
      // primary: group by warp key — keeps same-fabric/color orders together
      const wkDiff = warpKey(a).localeCompare(warpKey(b))
      if (wkDiff !== 0) return wkDiff
      // secondary: within same warp group, most constrained first
      const flexDiff = a.machineCategories.length - b.machineCategories.length
      if (flexDiff !== 0) return flexDiff
      // tertiary: highest priority first
      return PRI[b.priority] - PRI[a.priority]
    })

  // Machine category priority — when no same-warp exists, prefer higher-capability machines
  // Electronic > Mechanical for the same fabric (electronic machines handle more order types)
  const MACHINE_PRIORITY: Record<MachineCategory, number> = {
    "Electronic Double":     4,
    "Electronic 4":          3,
    "Mechanical Double 280": 2,
    "Mechanical Double 140": 2,
    "Mechanical 4":          1,
  }

  function score(m: Machine, o: Order): number {
    const q   = map[m.id]
    const ld  = q.reduce((s, x) => s + x.quantity, 0)
    const wk  = warpKey(o)
    const slotSealed = sealedSlots.has(`${wk}||${m.id}`)

    if (!slotSealed) {
      // count how many meters of THIS warp are already on this machine
      const warpMeters = q.filter(x => warpKey(x) === wk).reduce((s,x) => s + x.quantity, 0)
      if (warpMeters > 0) {
        // same-warp machine: score by how much of this warp is already here
        // more meters = stronger "primary warp machine" signal
        return 1000000 + warpMeters
      }
    }

    // no same warp — score by machine priority first, then available capacity
    // this ensures جانيت goes to Electronic 4 (علم) before Mechanical 4
    // when both are equally empty
    const cap = m.capacity ?? DEFAULT_CAP
    const overload = ld > cap ? (ld - cap) * 2 : 0
    const priority = MACHINE_PRIORITY[m.category] ?? 0
    return (priority * 10000) - ld - overload
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
// Format an order's display label — code + name if name exists
function orderLabel(o: Order)    { return o.textileName ? o.textileCode + " — " + o.textileName : o.textileCode }
function dlWarn(d: string)       {
  if (!d) return "none"
  const diff = (new Date(d).getTime() - Date.now()) / 86400000
  return diff < 3 ? "urgent" : diff < 7 ? "soon" : "ok"
}

// ─── GLOBAL CSS ──────────────────────────────────────────────
if (!document.getElementById("dtx-css")) {
  // ensure proper mobile viewport
  if (!document.querySelector("meta[name=viewport]")) {
    const meta = document.createElement("meta")
    meta.name = "viewport"
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1"
    document.head.appendChild(meta)
  }
  const t = document.createElement("style")
  t.id = "dtx-css"
  t.textContent = `
    *{box-sizing:border-box}body{margin:0}
    #root{width:100%;max-width:100%;border:none;min-height:100vh}
    input,select,textarea,button{font-family:inherit}
    ::-webkit-scrollbar{width:6px}
    ::-webkit-scrollbar-thumb{background:#d0d0d0;border-radius:3px}

    /* ── MOBILE LAYOUT ─────────────────────────────── */
    @media (max-width: 768px) {

      /* Shell: stack vertically, sidebar moves to bottom */
      .dtx-shell { flex-direction: column !important; height: 100dvh !important; }

      /* Sidebar becomes bottom tab bar */
      .dtx-sidebar {
        width: 100% !important;
        height: 56px !important;
        flex-direction: row !important;
        padding: 0 4px !important;
        gap: 0 !important;
        order: 2;
        border-top: 0.5px solid #2e2e3a;
        overflow-x: auto;
        justify-content: space-around;
        align-items: center;
        flex-shrink: 0 !important;
      }

      /* Hide logo and machine list in bottom bar */
      .dtx-logo { display: none !important; }
      .dtx-sb-machines { display: none !important; }

      /* Nav buttons: vertical icon+label, compact */
      .dtx-navbtn {
        flex-direction: column !important;
        gap: 2px !important;
        padding: 6px 8px !important;
        font-size: 10px !important;
        align-items: center !important;
        border-radius: 8px !important;
        min-width: 44px !important;
        flex: 1 !important;
      }
      .dtx-navbtn span:first-child { font-size: 18px !important; width: auto !important; }

      /* Main: takes full height minus bottom bar */
      .dtx-main { flex: 1 !important; overflow: hidden !important; order: 1; }

      /* Topbar: wrap to two rows, smaller */
      .dtx-topbar {
        flex-wrap: wrap !important;
        height: auto !important;
        padding: 8px 12px !important;
        gap: 6px !important;
      }
      .dtx-view-title { width: 100% !important; font-size: 16px !important; }
      .dtx-search { width: 100% !important; }
      .dtx-search input { width: 100% !important; }

      /* Hide less-used topbar buttons on mobile, keep + Add order */
      .dtx-topbar-secondary { display: none !important; }

      /* Two-col becomes one col */
      .dtx-twocol { grid-template-columns: 1fr !important; }

      /* Metrics: 2x2 grid */
      .dtx-metrics { grid-template-columns: 1fr 1fr !important; }

      /* viewPad: smaller padding */
      .dtx-viewpad { padding: 10px !important; }

      /* Modal: full screen on mobile */
      .dtx-modal {
        width: 100% !important;
        max-width: 100% !important;
        max-height: 100vh !important;
        border-radius: 0 !important;
        margin: 0 !important;
        height: 100dvh !important;
      }
      .dtx-overlay {
        align-items: flex-start !important;
        padding: 0 !important;
      }

      /* Card head: allow wrapping */
      .dtx-chead { flex-wrap: wrap !important; gap: 6px !important; }

      /* Order rows: tighter */
      .dtx-orow { gap: 6px !important; }

      /* warp group search: full width */
      .dtx-warp-search input { width: 140px !important; }
    }
  `
  document.head.appendChild(t)
}

// ─── SHARED UI ───────────────────────────────────────────────
function Modal({ title, onClose, children }: { title:string; onClose:()=>void; children:React.ReactNode }) {
  return (
    <div style={S.overlay} className="dtx-overlay" onClick={onClose}>
      <div style={S.modal} className="dtx-modal" onClick={e => e.stopPropagation()}>
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
  textileCode:string; textileName:string; color:string; fabricType:string; quantity:string
  deadline:string; priority:Priority; categories:MachineCategory[]; notes:string
  orderNumber:string; orderDate:string; store:string
  isEdit:boolean
  set: {
    selectedTextileId:(v:number|null)=>void
    textileCode:(v:string)=>void; textileName:(v:string)=>void
    color:(v:string)=>void; fabricType:(v:string)=>void
    quantity:(v:string)=>void; deadline:(v:string)=>void; priority:(v:Priority)=>void
    categories:(v:MachineCategory[])=>void; notes:(v:string)=>void
    orderNumber:(v:string)=>void; orderDate:(v:string)=>void; store:(v:string)=>void
  }
  onSave:()=>void
}

function OrderFormUI({ textiles,selectedTextileId,textileCode,textileName,color,fabricType,quantity,deadline,priority,categories,notes,orderNumber,orderDate,store,isEdit,set,onSave }: OFProps) {
  const fromDB = selectedTextileId !== null
  const [txSearch, setTxSearch] = useState("")
  const [txOpen,   setTxOpen]   = useState(false)

  const filteredTx = useMemo(() => {
    if (!txSearch.trim()) return textiles
    const q = txSearch.toLowerCase()
    return textiles.filter(t =>
      t.code.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.color.toLowerCase().includes(q) ||
      t.fabricType.toLowerCase().includes(q)
    )
  }, [textiles, txSearch])

  function pickTextile(t: Textile) {
    set.selectedTextileId(t.id)
    set.textileCode(t.code)
    set.textileName(t.name)
    set.color(t.color)
    set.fabricType(t.fabricType)
    set.categories(t.machineCategories)
    set.notes(t.notes)
    setTxSearch(""); setTxOpen(false)
  }

  function clearTextile() {
    set.selectedTextileId(null)
    set.textileCode(""); set.textileName("")
    set.color(""); set.fabricType("")
    set.categories([]); set.notes("")
    setTxSearch(""); setTxOpen(false)
  }

  return (
    <>
      {/* ── TEXTILE PICKER ── */}
      <Field label="Textile">
        {fromDB
          ? (
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px",
              border:"1.5px solid #7F77DD", borderRadius:8, background:"#F3F2FD" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500 }} dir="auto">
                  {textileCode}{textileName ? ` — ${textileName}` : ""}
                </div>
                <div style={{ fontSize:11, color:"#888" }}>{fabricType} · {color}</div>
              </div>
              <button style={{ ...S.btnIcon, fontSize:12, color:"#7F77DD" }} onClick={clearTextile}>✕ change</button>
            </div>
          )
          : (
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
              {txOpen && textiles.length > 0 && (
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, zIndex:50,
                  background:"#fff", border:"0.5px solid #e0e0e0", borderRadius:8,
                  boxShadow:"0 4px 16px rgba(0,0,0,0.10)", maxHeight:220, overflowY:"auto" }}>
                  {filteredTx.length === 0
                    ? <div style={{ padding:"12px 14px", fontSize:13, color:"#bbb" }}>No match — fill in manually below</div>
                    : filteredTx.map(t => (
                        <div key={t.id} onClick={() => pickTextile(t)}
                          style={{ padding:"9px 14px", cursor:"pointer", borderBottom:"0.5px solid #f5f5f5",
                            display:"flex", alignItems:"center", gap:10 }}
                          onMouseEnter={e => (e.currentTarget.style.background="#F3F2FD")}
                          onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:500 }} dir="auto">
                              {t.code}{t.name ? ` — ${t.name}` : ""}
                            </div>
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

      {/* manual fields */}
      {!fromDB && (
        <div style={{ background:"#fafafa", border:"0.5px solid #e5e5e5", borderRadius:8, padding:12, marginBottom:14 }}>
          <div style={{ fontSize:11, color:"#aaa", marginBottom:10 }}>
            Fill in manually — will be saved to your textile database automatically.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Textile code">
              <input style={S.input} value={textileCode} onChange={e=>set.textileCode(e.target.value)} placeholder="e.g. 1138/01/01" dir="auto"/>
            </Field>
            <Field label="Textile name (optional)">
              <input style={S.input} value={textileName} onChange={e=>set.textileName(e.target.value)} placeholder="e.g. Montana" dir="auto"/>
            </Field>
            <Field label="Color">
              <input style={S.input} value={color} onChange={e=>set.color(e.target.value)} placeholder="e.g. بيج" dir="auto"/>
            </Field>
            <Field label="Fabric type">
              <input style={S.input} value={fabricType} onChange={e=>set.fabricType(e.target.value)} placeholder="e.g. جاكار" dir="auto"/>
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

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Quantity (m)">
          <input style={S.input} type="number" value={quantity} onChange={e=>set.quantity(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Order date">
          <input style={S.input} type="date" value={orderDate} onChange={e=>set.orderDate(e.target.value)}/>
        </Field>
        <Field label="Due date">
          <input style={S.input} type="date" value={deadline} onChange={e=>set.deadline(e.target.value)} />
        </Field>
        <Field label="Priority">
          <select style={S.input} value={priority} onChange={e=>set.priority(e.target.value as Priority)}>
            <option>High</option><option>Normal</option><option>Low</option>
          </select>
        </Field>
        <Field label="Order number (optional)">
          <input style={S.input} value={orderNumber} onChange={e=>set.orderNumber(e.target.value)} placeholder="e.g. ORD-2024-001" dir="auto"/>
        </Field>
        <Field label="Store">
          <select style={S.input} value={store} onChange={e=>set.store(e.target.value)} dir="auto">
            <option value="">— select store —</option>
            {STORES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Notes (optional)">
          <input style={S.input} value={notes} onChange={e=>set.notes(e.target.value)} placeholder="Special instructions…" />
        </Field>
      </div>

      {quantity&&<div style={S.warpPreview}>Warp needed: <strong>{calcWarp(Number(quantity))}m</strong> (qty × 1.1)</div>}
      <button style={{...S.btnPrimary, opacity:(!textileCode.trim()||!quantity||categories.length===0)?0.5:1}}
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
  code:string; name:string; color:string; fabricType:string
  pattern:string; weave:string
  categories:MachineCategory[]; notes:string; isEdit:boolean
  knownColors: string[]
  knownFabrics: string[]
  set: {
    code:(v:string)=>void; name:(v:string)=>void
    color:(v:string)=>void; fabricType:(v:string)=>void
    pattern:(v:string)=>void; weave:(v:string)=>void
    categories:(v:MachineCategory[])=>void; notes:(v:string)=>void
  }
  onSave:()=>void
}

function TextileFormUI({ code,name,color,fabricType,pattern,weave,categories,notes,isEdit,knownColors,knownFabrics,set,onSave }: TFProps) {
  function toggleCat(cat: MachineCategory) {
    set.categories(categories.includes(cat) ? categories.filter(c=>c!==cat) : [...categories,cat])
  }
  return (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Field label="Textile code">
          <input style={S.input} value={code} onChange={e=>set.code(e.target.value)}
            placeholder="e.g. 1138/01/01" dir="auto" />
        </Field>
        <Field label="Textile name">
          <input style={S.input} value={name} onChange={e=>set.name(e.target.value)}
            placeholder="e.g. Montana" dir="auto" />
        </Field>
        <Field label="Color">
          <AutocompleteInput value={color} onChange={set.color} suggestions={knownColors} placeholder="e.g. بيج"/>
        </Field>
        <Field label="Fabric type">
          <AutocompleteInput value={fabricType} onChange={set.fabricType} suggestions={knownFabrics} placeholder="e.g. جاكار"/>
        </Field>
        <Field label="Pattern (optional)">
          <input style={S.input} value={pattern} onChange={e=>set.pattern(e.target.value)}
            placeholder="e.g. زهور، هندسي" dir="auto"/>
        </Field>
        <Field label="Weave (optional)">
          <input style={S.input} value={weave} onChange={e=>set.weave(e.target.value)}
            placeholder="e.g. ساتان، تويل" dir="auto"/>
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
          value={notes} onChange={e=>set.notes(e.target.value)} placeholder="Any special notes…" />
      </Field>
      <button style={S.btnPrimary} onClick={onSave}>{isEdit?"Save changes":"Save textile"}</button>
    </>
  )
}
function App({ onLogout }: { session: Session; onLogout: () => void }) {
  const [machines,     setMachines]     = useState<Machine[]>([])
  const [orders,       setOrders]       = useState<Order[]>([])
  const [textiles,     setTextiles]     = useState<Textile[]>([])
  const [threads,      setThreads]      = useState<Thread[]>([])
  const [stockLog,     setStockLog]     = useState<StockLogEntry[]>([])
  const [textileStock, setTextileStock] = useState<TextileStock[]>([])
  const [schedule,  setSchedule]  = useState<Record<number,Order[]>>({})
  const [ready,     setReady]     = useState(false)
  const [view,      setView]      = useState<View>("dashboard")
  const [search,    setSearch]    = useState("")

  const [showOM,  setShowOM]  = useState(false)
  const [showMM,  setShowMM]  = useState(false)
  const [showTM,  setShowTM]  = useState(false)
  const [showThM, setShowThM] = useState(false)   // thread modal
  const [showTSM, setShowTSM] = useState(false)   // textile stock modal
  const [editO,   setEditO]   = useState<Order|null>(null)
  const [editM,   setEditM]   = useState<Machine|null>(null)
  const [editT,   setEditT]   = useState<Textile|null>(null)
  const [editTh,  setEditTh]  = useState<Thread|null>(null)
  const [editTS,  setEditTS]  = useState<TextileStock|null>(null)

  // warp done deduction modal
  const [warpDoneGroup, setWarpDoneGroup] = useState<{orderIds:number[];label:string;machine:string;meters:number}|null>(null)
  const [warpDoneThreadId, setWarpDoneThreadId] = useState<number|null>(null)
  const [warpDoneKg, setWarpDoneKg] = useState("")

  // machine form state
  const [mName, setMName] = useState("")
  const [mCat,  setMCat]  = useState<MachineCategory>("Electronic Double")
  const [mCap,  setMCap]  = useState(String(DEFAULT_CAP))

  // textile form state
  const [tCode,  setTCode]  = useState("")
  const [tName,  setTName]  = useState("")
  const [tColor, setTColor] = useState("")
  const [tFab,   setTFab]   = useState("")
  const [tCats,  setTCats]  = useState<MachineCategory[]>([])
  const [tNotes, setTNotes] = useState("")
  const [tPattern,setTPattern]= useState("")
  const [tWeave,  setTWeave]  = useState("")

  // thread form state
  const [thCode,  setThCode]  = useState("")
  const [thName,  setThName]  = useState("")
  const [thColor, setThColor] = useState("")
  const [thStock, setThStock] = useState("")
  const [thMin,   setThMin]   = useState("")
  const [thNotes, setThNotes] = useState("")

  // textile stock form state
  const [tsCode,  setTsCode]  = useState("")
  const [tsName,  setTsName]  = useState("")
  const [tsStock, setTsStock] = useState("")
  const [tsMin,   setTsMin]   = useState("")
  const [tsNotes, setTsNotes] = useState("")

  // manual stock log form
  const [logItemId,   setLogItemId]   = useState<number|null>(null)
  const [logType,     setLogType]     = useState<"thread"|"textile-stock">("thread")
  const [logDir,      setLogDir]      = useState<"in"|"out">("in")
  const [logQty,      setLogQty]      = useState("")
  const [logNote,     setLogNote]     = useState("")
  const [showLogM,    setShowLogM]    = useState(false)

  // order form state
  const [oSelId,       setOSelId]       = useState<number|null>(null)
  const [oTextileCode, setOTextileCode] = useState("")
  const [oTextileName, setOTextileName] = useState("")
  const [oColor,   setOColor]   = useState("")
  const [oFabric,  setOFabric]  = useState("")
  const [oQty,     setOQty]     = useState("")
  const [oDl,      setODl]      = useState("")
  const [oPri,     setOPri]     = useState<Priority>("Normal")
  const [oCats,    setOCats]    = useState<MachineCategory[]>([])
  const [oNotes,   setONotes]   = useState("")
  const [oOrderNum,setOOrderNum]= useState("")
  const [oOrderDate,setOOrderDate]= useState("")
  const [oStore,setOStore]= useState("")

  const [forceSwitchOrder, setForceSwitchOrder] = useState<Order|null>(null)
  const [historySearch, setHistorySearch] = useState("")
  const [warpOrder, setWarpOrder] = useState<WarpOrder>({})
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set())
  const [warpGroupSearch, setWarpGroupSearch] = useState("")
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<Order|null>(null)
  const [expandedBase, setExpandedBase] = useState<string|null>(null)
  const [seasonPreset, setSeasonPreset] = useState<"all"|"month"|"3months"|"custom">("all")
  const [seasonFrom,   setSeasonFrom]   = useState("")
  const [seasonTo,     setSeasonTo]     = useState("")
  const [overdueShowAll, setOverdueShowAll] = useState(false)

  type ImportRow = {
    appCode:string; textileName:string; qty:number
    ordered:string; due:string; orderNum:string; store:string
    status:"new"|"duplicate"|"no-textile"; tex:Textile|null
  }
  const [importRows,     setImportRows]     = useState<ImportRow[]>([])
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set())
  const [importStatus,   setImportStatus]   = useState<"idle"|"parsing"|"preview"|"importing"|"done">("idle")
  const [importLog,      setImportLog]      = useState<string[]>([])
  const [importProgress, setImportProgress] = useState(0)
  // tracks which warp blocks are expanded in the schedule — key = machineId+warpKey+blockIndex
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set())

  function toggleBlock(key: string) {
    setExpandedBlocks(p => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [orderSort,   setOrderSort]   = useState<"name" | "deadline">("name")
  const [textileSearch, setTextileSearch] = useState("")
  const [textileSort,   setTextileSort]   = useState<"name" | "fabricType">("name")

  // ── SUPABASE: initial load + real-time sync ───────────────
  const subscribed = useRef(false)

  useEffect(() => {
    // 1. Load all data on mount
    async function recoverFromBackup<T extends { id: number }>(
      table: string, oldKey: string, dbRows: T[],
      sanitize: (r: Record<string, unknown>) => T
    ): Promise<T[]> {
      try {
        const backupRaw = localStorage.getItem(`dtx_backup_${table}`) || "[]"
        const oldRaw    = localStorage.getItem(oldKey) || "[]"
        const backup: Record<string, unknown>[] = [...JSON.parse(backupRaw), ...JSON.parse(oldRaw)]
        if (backup.length === 0) return dbRows
        const dbIds = new Set(dbRows.map(r => r.id))
        const missing = backup.filter(r => !dbIds.has(Number(r.id)))
        if (missing.length === 0) return dbRows
        for (const row of missing) await dbUpsert(table, row)
        return [...dbRows, ...missing.map(sanitize)]
      } catch { return dbRows }
    }

    async function loadAll() {
      const [m, o, t, th, sl, ts] = await Promise.all([
        dbLoadMachines(), dbLoadOrders(), dbLoadTextiles(),
        dbLoadThreads(), dbLoadStockLog(), dbLoadTextileStock(),
      ])
      const [recoveredO, recoveredT] = await Promise.all([
        recoverFromBackup("orders",   "dtx_orders",   o, sanitizeOrder),
        recoverFromBackup("textiles", "dtx_textiles", t, r => r as Textile),
      ])
      setMachines(m); setOrders(recoveredO); setTextiles(recoveredT)
      setThreads(th); setStockLog(sl); setTextileStock(ts)
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

      // ── THREADS ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "threads" },
        (payload) => { const t = sanitizeThread(payload.new as Record<string,unknown>); setThreads(p => p.some(x=>x.id===t.id)?p:[...p,t]) })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "threads" },
        (payload) => { const t = sanitizeThread(payload.new as Record<string,unknown>); setThreads(p => p.map(x=>x.id===t.id?t:x)) })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "threads" },
        (payload) => { const id=(payload.old as Record<string,unknown>).id as number; setThreads(p=>p.filter(x=>x.id!==id)) })

      // ── STOCK LOG ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stock_log" },
        (payload) => { const l = sanitizeStockLog(payload.new as Record<string,unknown>); setStockLog(p => p.some(x=>x.id===l.id)?p:[...p,l]) })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "stock_log" },
        (payload) => { const id=(payload.old as Record<string,unknown>).id as number; setStockLog(p=>p.filter(x=>x.id!==id)) })

      // ── TEXTILE STOCK ──
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "textile_stock" },
        (payload) => { const t = sanitizeTextileStock(payload.new as Record<string,unknown>); setTextileStock(p => p.some(x=>x.id===t.id)?p:[...p,t]) })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "textile_stock" },
        (payload) => { const t = sanitizeTextileStock(payload.new as Record<string,unknown>); setTextileStock(p => p.map(x=>x.id===t.id?t:x)) })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "textile_stock" },
        (payload) => { const id=(payload.old as Record<string,unknown>).id as number; setTextileStock(p=>p.filter(x=>x.id!==id)) })

      .subscribe()

    return () => { db.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (ready) setSchedule(buildSchedule(orders, machines))
  }, [orders, machines, ready])

  const filteredOrders = useMemo(() => {
    const active = orders.filter(o => o.warpStatus !== "done")
    const q = search.toLowerCase().trim()
    const filtered = q
      ? active.filter(o =>
          o.textileCode.toLowerCase().includes(q) ||
          (o.textileName ?? "").toLowerCase().includes(q) ||
          o.color.toLowerCase().includes(q) ||
          o.fabricType.toLowerCase().includes(q) ||
          (o.orderNumber ?? "").toLowerCase().includes(q)
        )
      : active
    return [...filtered].sort((a, b) => {
      if (orderSort === "deadline") {
        const da = a.deadline || "9999-99-99"
        const db = b.deadline || "9999-99-99"
        if (da !== db) return da.localeCompare(db)
      }
      return a.textileCode.localeCompare(b.textileCode, "ar")
    })
  }, [orders, search, orderSort])

  const filteredTextiles = useMemo(() => {
    const q = textileSearch.toLowerCase().trim()
    const filtered = q
      ? textiles.filter(t =>
          t.code.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.color.toLowerCase().includes(q) ||
          t.fabricType.toLowerCase().includes(q)
        )
      : [...textiles]
    return filtered.sort((a, b) => {
      if (textileSort === "fabricType") {
        const fc = a.fabricType.localeCompare(b.fabricType, "ar")
        if (fc !== 0) return fc
      }
      return a.code.localeCompare(b.code, "ar")
    })
  }, [textiles, textileSearch, textileSort])

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
  function resetTF() { setTCode(""); setTName(""); setTColor(""); setTFab(""); setTCats([]); setTNotes(""); setTPattern(""); setTWeave("") }

  async function saveTextile() {
    if (!tCode.trim() || !tFab.trim() || tCats.length === 0) return
    if (editT) {
      const updated: Textile = { ...editT, code:tCode, name:tName, color:tColor,
        fabricType:tFab, pattern:tPattern, weave:tWeave, machineCategories:tCats, notes:tNotes }
      setTextiles(p => p.map(t => t.id===editT.id ? updated : t))
      await dbUpsert("textiles", updated as unknown as Record<string, unknown>)
      // ── AUTO-LINK: update all orders that match this textile code
      // with the new name so the worker doesn't have to re-enter it
      if (tName.trim()) {
        const updatedOrders = orders.map(o => {
          if (o.textileCode !== tCode) return o
          const linked = { ...o, textileName: tName }
          dbUpsert("orders", linked as unknown as Record<string, unknown>)
          return linked
        })
        setOrders(updatedOrders)
      }
      setEditT(null)
    } else {
      const created: Textile = { id:Date.now(), code:tCode, name:tName, color:tColor,
        fabricType:tFab, pattern:tPattern, weave:tWeave, machineCategories:tCats, notes:tNotes }
      setTextiles(p => [...p, created])
      await dbUpsert("textiles", created as unknown as Record<string, unknown>)
      // ── AUTO-LINK new textile: update matching existing orders
      if (tName.trim()) {
        const updatedOrders = orders.map(o => {
          if (o.textileCode !== tCode) return o
          const linked = { ...o, textileName: tName }
          dbUpsert("orders", linked as unknown as Record<string, unknown>)
          return linked
        })
        setOrders(updatedOrders)
      }
      setShowTM(false)
    }
    resetTF()
  }

  function openEditTextile(t: Textile) {
    setTCode(t.code); setTName(t.name); setTColor(t.color); setTFab(t.fabricType)
    setTPattern(t.pattern); setTWeave(t.weave)
    setTCats(t.machineCategories); setTNotes(t.notes); setEditT(t)
  }

  async function delTextile(id: number) {
    setTextiles(p => p.filter(t => t.id!==id))
    await dbDelete("textiles", id)
  }

  // order actions
  function resetOF() {
    setOSelId(null)
    setOTextileCode(""); setOTextileName(""); setOColor(""); setOFabric(""); setOQty("")
    setODl(""); setOPri("Normal"); setOCats([]); setONotes(""); setOOrderNum(""); setOOrderDate(""); setOStore("")
  }

  async function saveOrder() {
    if (!oTextileCode.trim() || !oQty || oCats.length === 0) return
    const data: Order = {
      id: editO ? editO.id : Date.now(),
      textileCode: oTextileCode,
      textileName: oTextileName,
      color:oColor, fabricType:oFabric,
      quantity:Number(oQty), deadline:oDl, priority:oPri,
      machineCategories:oCats, warpStatus:editO?.warpStatus??"not-started", notes:oNotes,
      orderNumber: oOrderNum.trim() || undefined,
      orderDate:   oOrderDate || undefined,
      store:       oStore || undefined,
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
    if (oSelId === null && oTextileCode.trim() && oFabric.trim() && oCats.length > 0) {
      const alreadyExists = textiles.some(t => t.code.toLowerCase() === oTextileCode.toLowerCase())
      if (!alreadyExists) {
        const newT: Textile = {
          id: Date.now() + 1,
          code:oTextileCode, name:oTextileName, color:oColor, fabricType:oFabric,
          pattern:"", weave:"",
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
    setOTextileCode(o.textileCode); setOTextileName(o.textileName ?? "")
    setOColor(o.color); setOFabric(o.fabricType)
    setOQty(String(o.quantity)); setODl(o.deadline); setOPri(o.priority)
    setOCats(o.machineCategories ?? []); setONotes(o.notes)
    setOOrderNum(o.orderNumber ?? ""); setOOrderDate(o.orderDate ?? ""); setOStore(o.store ?? ""); setEditO(o)
  }

  async function delOrder(id: number) {
    setOrders(p => p.filter(o => o.id!==id))
    await dbDelete("orders", id)
  }
  async function delMachine(id: number) {
    setMachines(p => p.filter(m => m.id!==id))
    await dbDelete("machines", id)
  }

  // ── THREAD ACTIONS ────────────────────────────────────────
  function resetThF() { setThCode(""); setThName(""); setThColor(""); setThStock(""); setThMin(""); setThNotes("") }

  async function saveThread() {
    if (!thCode.trim()) return
    if (editTh) {
      const updated: Thread = { ...editTh, code:thCode, name:thName, color:thColor,
        stockKg:Number(thStock)||0, minThreshold:Number(thMin)||0, notes:thNotes }
      setThreads(p => p.map(t => t.id===editTh.id ? updated : t))
      await dbUpsert("threads", updated as unknown as Record<string,unknown>)
      setEditTh(null)
    } else {
      const created: Thread = { id:Date.now(), code:thCode, name:thName, color:thColor,
        stockKg:Number(thStock)||0, minThreshold:Number(thMin)||0, notes:thNotes }
      setThreads(p => [...p, created])
      await dbUpsert("threads", created as unknown as Record<string,unknown>)
      setShowThM(false)
    }
    resetThF()
  }

  function openEditThread(t: Thread) {
    setThCode(t.code); setThName(t.name); setThColor(t.color)
    setThStock(String(t.stockKg)); setThMin(String(t.minThreshold)); setThNotes(t.notes)
    setEditTh(t)
  }

  async function delThread(id: number) {
    setThreads(p => p.filter(t => t.id!==id))
    await dbDelete("threads", id)
  }

  // ── TEXTILE STOCK ACTIONS ──────────────────────────────────
  function resetTsF() { setTsCode(""); setTsName(""); setTsStock(""); setTsMin(""); setTsNotes("") }

  async function saveTextileStockItem() {
    if (!tsCode.trim()) return
    if (editTS) {
      const updated: TextileStock = { ...editTS, textileCode:tsCode, textileName:tsName,
        stockM:Number(tsStock)||0, minThreshold:Number(tsMin)||0, notes:tsNotes }
      setTextileStock(p => p.map(t => t.id===editTS.id ? updated : t))
      await dbUpsert("textile_stock", updated as unknown as Record<string,unknown>)
      setEditTS(null)
    } else {
      const created: TextileStock = { id:Date.now(), textileCode:tsCode, textileName:tsName,
        stockM:Number(tsStock)||0, minThreshold:Number(tsMin)||0, notes:tsNotes }
      setTextileStock(p => [...p, created])
      await dbUpsert("textile_stock", created as unknown as Record<string,unknown>)
      setShowTSM(false)
    }
    resetTsF()
  }

  function openEditTextileStock(ts: TextileStock) {
    setTsCode(ts.textileCode); setTsName(ts.textileName)
    setTsStock(String(ts.stockM)); setTsMin(String(ts.minThreshold)); setTsNotes(ts.notes)
    setEditTS(ts)
  }

  async function delTextileStock(id: number) {
    setTextileStock(p => p.filter(t => t.id!==id))
    await dbDelete("textile_stock", id)
  }

  // ── STOCK LOG: add a manual entry and update running stock ─
  async function addStockLog(
    itemId: number, itemType: "thread"|"textile-stock",
    direction: "in"|"out", qty: number, note: string, auto = false
  ) {
    const entry: StockLogEntry = {
      id: Date.now(), itemId, itemType, direction,
      quantityKg:  itemType==="thread"          ? qty : undefined,
      quantityM:   itemType==="textile-stock"   ? qty : undefined,
      date: new Date().toISOString().slice(0,10),
      note, autoDeducted: auto,
    }
    setStockLog(p => [...p, entry])
    await dbUpsert("stock_log", entry as unknown as Record<string,unknown>)

    // update running stock
    if (itemType === "thread") {
      const delta = direction==="in" ? qty : -qty
      setThreads(p => p.map(t => {
        if (t.id !== itemId) return t
        const updated = { ...t, stockKg: Math.max(0, t.stockKg + delta) }
        dbUpsert("threads", updated as unknown as Record<string,unknown>)
        return updated
      }))
    } else {
      const delta = direction==="in" ? qty : -qty
      setTextileStock(p => p.map(ts => {
        if (ts.id !== itemId) return ts
        const updated = { ...ts, stockM: Math.max(0, ts.stockM + delta) }
        dbUpsert("textile_stock", updated as unknown as Record<string,unknown>)
        return updated
      }))
    }
  }

  async function submitManualLog() {
    if (!logItemId || !logQty) return
    await addStockLog(logItemId, logType, logDir, Number(logQty), logNote)
    setLogItemId(null); setLogQty(""); setLogNote(""); setShowLogM(false)
  }

  // ── WARP DONE: intercept to show thread deduction modal ───
  function handleWarpNextRun(orderIds: number[], label: string, machine: string, meters: number) {
    setWarpDoneGroup({ orderIds, label, machine, meters })
    setWarpDoneThreadId(null)
    setWarpDoneKg("")
  }

  async function confirmWarpDone() {
    if (!warpDoneGroup) return
    await warpNextRun(warpDoneGroup.orderIds)
    // auto-deduct thread stock if user selected a thread
    if (warpDoneThreadId && warpDoneKg) {
      await addStockLog(warpDoneThreadId, "thread", "out", Number(warpDoneKg),
        "Auto-deducted: warp done — " + warpDoneGroup.label, true)
    }
    setWarpDoneGroup(null); setWarpDoneThreadId(null); setWarpDoneKg("")
  }

  // ── LOW STOCK ALERTS ──────────────────────────────────────
  const lowStockAlerts = useMemo(() => {
    const alerts: {label:string; current:string; min:string; type:"thread"|"textile"}[] = []
    for (const t of threads) {
      if (t.minThreshold > 0 && t.stockKg <= t.minThreshold) {
        alerts.push({ label:`${t.code}${t.name?" — "+t.name:""}`, current:`${t.stockKg}kg`, min:`${t.minThreshold}kg`, type:"thread" })
      }
    }
    for (const ts of textileStock) {
      if (ts.minThreshold > 0 && ts.stockM <= ts.minThreshold) {
        alerts.push({ label:`${ts.textileCode}${ts.textileName?" — "+ts.textileName:""}`, current:`${ts.stockM}m`, min:`${ts.minThreshold}m`, type:"textile" })
      }
    }
    return alerts
  }, [threads, textileStock])
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
    const now = new Date().toISOString()
    const updated = orders.map(o => {
      if (!orderIds.includes(o.id)) return o
      return { ...o, warpStatus: "done" as WarpStatus, warpClosed: true, completedAt: now }
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
      return {
        ...o,
        warpStatus: st,
        // stamp when marked done, clear when moved back to active
        completedAt: st === "done" ? new Date().toISOString() : undefined,
      }
    })
    setOrders(updated)
    const changed = updated.find(o => o.id === id)
    if (changed) await dbUpsert("orders", changed as unknown as Record<string, unknown>)
  }

  function exportCSV() {
    const rows = orders.map(o =>
      [o.textileCode,o.textileName,o.color,o.fabricType,o.quantity,o.priority,o.deadline,o.warpStatus].join(",")
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

  // ── PRINT: generate a printable warp sheet for a warp group
  function printWarpGroup(
    label: string,
    machine: string,
    groupOrderIds: number[],
    meters: number
  ) {
    const groupOrders = orders
      .filter(o => groupOrderIds.includes(o.id))
      .sort((a, b) => {
        const codeComp = a.textileCode.localeCompare(b.textileCode, "ar")
        if (codeComp !== 0) return codeComp
        return (a.textileName ?? "").localeCompare(b.textileName ?? "", "ar")
      })

    const totalOrderMeters = groupOrders.reduce((s, o) => s + o.quantity, 0)
    const totalWarpMeters  = meters   // already calculated as calcWarp sum

    const date = new Date().toLocaleDateString("en-GB")
    const rows = groupOrders.map((o, i) => {
      const textile = textiles.find(t => t.code === o.textileCode)
      const pattern = textile?.pattern || "—"
      const weave   = textile?.weave   || "—"
      return `
      <tr>
        <td>${i + 1}</td>
        <td dir="auto">${o.textileCode}</td>
        <td dir="auto">${o.textileName || "—"}</td>
        <td dir="auto">${pattern}</td>
        <td dir="auto">${weave}</td>
        <td>${o.quantity}m</td>
        <td>${o.orderDate || "—"}</td>
        <td dir="auto">${o.store || "—"}</td>
      </tr>
    `}).join("")

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>Warp Sheet — ${label}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #111; font-size: 13px; }
    .topbar { position: fixed; top: 0; left: 0; right: 0; background: #534AB7; color: #fff; padding: 10px 24px; display: flex; align-items: center; gap: 16px; z-index: 999; }
    .topbar button { background: #fff; color: #534AB7; border: none; padding: 6px 18px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .topbar button:hover { background: #f0efff; }
    .topbar span { font-size: 14px; font-weight: 600; }
    .content { margin-top: 56px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; }
    .brand { font-size: 22px; font-weight: 700; color: #534AB7; }
    .meta { text-align: right; font-size: 12px; color: #555; line-height: 1.8; }
    h2 { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .info { display: flex; gap: 32px; margin-bottom: 20px; flex-wrap: wrap; }
    .info-item { }
    .info-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .info-val { font-size: 15px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #534AB7; color: #fff; padding: 8px 10px; text-align: right; font-size: 12px; font-weight: 600; }
    td { padding: 8px 10px; border-bottom: 0.5px solid #e5e5e5; vertical-align: top; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .total { margin-top: 16px; text-align: left; font-size: 13px; font-weight: 600; }
    .footer { margin-top: 40px; border-top: 0.5px solid #e5e5e5; padding-top: 12px; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
    .sig { margin-top: 48px; display: flex; justify-content: space-between; }
    .sig-box { text-align: center; }
    .sig-line { width: 140px; border-bottom: 1px solid #333; margin-bottom: 6px; height: 32px; }
    .sig-label { font-size: 11px; color: #555; }
    @media print { .topbar { display: none; } .content { margin-top: 0; } body { padding: 16px; } }
  </style>
</head>
<body>
  <div class="topbar">
    <span>🖨 Warp Sheet — ${label}</span>
    <button onclick="window.print()">🖨 Print</button>
  </div>
  <div class="content">
  <div class="header">
    <div>
      <div class="brand">Deebtex</div>
      <div style="font-size:12px;color:#888;margin-top:4px">Warp Production Sheet</div>
    </div>
    <div class="meta">
      <div>${date}</div>
      <div>Machine: <strong>${machine}</strong></div>
    </div>
  </div>

  <div class="info">
    <div class="info-item">
      <div class="info-label">Warp</div>
      <div class="info-val" dir="auto">${label}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Total order meters</div>
      <div class="info-val">${totalOrderMeters}m</div>
    </div>
    <div class="info-item">
      <div class="info-label">Total warp meters</div>
      <div class="info-val" style="color:#534AB7">${totalWarpMeters}m</div>
    </div>
    <div class="info-item">
      <div class="info-label">Orders</div>
      <div class="info-val">${groupOrders.length}</div>
    </div>
    <div class="info-item">
      <div class="info-label">Machine</div>
      <div class="info-val">${machine}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Code</th>
        <th>Name</th>
        <th>Pattern</th>
        <th>Weave</th>
        <th>Quantity</th>
        <th>Order date</th>
        <th>Branch</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="total">
    Order total: ${totalOrderMeters}m &nbsp;·&nbsp; Warp total: <span style="color:#534AB7">${totalWarpMeters}m</span>
    &nbsp;·&nbsp; ${groupOrders.length} orders
  </div>

  <div class="sig">
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Prepared by</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Checked by</div>
    </div>
    <div class="sig-box">
      <div class="sig-line"></div>
      <div class="sig-label">Machine operator</div>
    </div>
  </div>

  <div class="footer">
    <span>Deebtex Factory Management</span>
    <span>Printed: ${date}</span>
  </div>
  </div>
</body>
</html>`

    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
  }
  const knownColors = useMemo(() => {
    const seen = new Set(textiles.map(t => t.color).filter(Boolean))
    return [...seen].sort((a, b) => a.localeCompare(b, "ar"))
  }, [textiles])

  const knownFabrics = useMemo(() => {
    const seen = new Set(textiles.map(t => t.fabricType).filter(Boolean))
    return [...seen].sort((a, b) => a.localeCompare(b, "ar"))
  }, [textiles])

  const totalLoad  = orders.filter(o => o.warpStatus !== "done").reduce((s,o)=>s+o.quantity,0)
  const highCnt    = orders.filter(o => o.priority==="High" && o.warpStatus !== "done").length
  const doneLoad   = orders.filter(o => o.warpStatus === "done").reduce((s,o)=>s+o.quantity,0)
  const activeCount= orders.filter(o => o.warpStatus !== "done").length

  // ── PROP BUNDLES ──────────────────────────────────────────
  const orderFormProps: OFProps = {
    textiles, selectedTextileId:oSelId,
    textileCode:oTextileCode, textileName:oTextileName,
    color:oColor, fabricType:oFabric, quantity:oQty,
    deadline:oDl, priority:oPri, categories:oCats, notes:oNotes,
    orderNumber:oOrderNum, orderDate:oOrderDate, store:oStore,
    isEdit:!!editO,
    set:{
      selectedTextileId:setOSelId,
      textileCode:setOTextileCode, textileName:setOTextileName,
      color:setOColor, fabricType:setOFabric,
      quantity:setOQty, deadline:setODl, priority:setOPri,
      categories:setOCats, notes:setONotes, orderNumber:setOOrderNum,
      orderDate:setOOrderDate, store:setOStore,
    },
    onSave:saveOrder,
  }
  const machineFormProps: MFProps = {
    name:mName, category:mCat, capacity:mCap, isEdit:!!editM,
    set:{ name:setMName, category:setMCat, capacity:setMCap },
    onSave:saveMachine,
  }
  const textileFormProps: TFProps = {
    code:tCode, name:tName, color:tColor, fabricType:tFab,
    pattern:tPattern, weave:tWeave,
    categories:tCats, notes:tNotes,
    isEdit:!!editT, knownColors, knownFabrics,
    set:{ code:setTCode, name:setTName, color:setTColor, fabricType:setTFab,
      pattern:setTPattern, weave:setTWeave,
      categories:setTCats, notes:setTNotes },
    onSave:saveTextile,
  }

  // ── NAV ───────────────────────────────────────────────────
  const NAV: {id:View;icon:string;label:string}[] = [
    {id:"dashboard",     icon:"⊞", label:"Dashboard"},
    {id:"orders",        icon:"≡", label:"Orders"},
    {id:"machines",      icon:"⚙", label:"Machines"},
    {id:"textiles",      icon:"🧵", label:"Textiles"},
    {id:"threads",       icon:"🪡", label:"Threads"},
    {id:"textile-stock", icon:"📦", label:"Stock"},
    {id:"analytics",     icon:"↗", label:"Analytics"},
    {id:"history",       icon:"🕓", label:"History"},
    {id:"suggestions",   icon:"💡", label:"Suggestions"},
    {id:"import",        icon:"📥", label:"Import"},
  ]

  // ── LOADING GATE ──────────────────────────────────────────
  // Show a proper loading screen instead of empty dashboard while
  // Supabase data is fetching. Prevents the "everything disappeared"
  // panic on slow connections.
  if (!ready) {
    return (
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",height:"100vh",background:"#F7F6F3",
        fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",gap:16}}>
        <div style={{width:44,height:44,borderRadius:10,background:"#7F77DD",
          display:"flex",alignItems:"center",justifyContent:"center",
          color:"#EEEDFE",fontWeight:700,fontSize:18}}>Dt</div>
        <div style={{fontSize:14,color:"#aaa"}}>Loading your factory data…</div>
        <div style={{
          width:180,height:3,background:"#e5e5e5",borderRadius:2,overflow:"hidden",
        }}>
          <div style={{
            height:"100%",background:"#7F77DD",borderRadius:2,
            animation:"dtx-load 1.4s ease-in-out infinite",
            width:"40%",
          }}/>
        </div>
        <style>{`
          @keyframes dtx-load {
            0%   { margin-left: -40%; }
            100% { margin-left: 140%; }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div style={S.shell} className="dtx-shell">
      <div style={S.sidebar} className="dtx-sidebar">
        <div style={S.logo} className="dtx-logo">Dt</div>
        {NAV.map(n => (
          <button key={n.id}
            className="dtx-navbtn"
            style={{...S.navBtn,...(view===n.id?S.navActive:{})}}
            onClick={()=>setView(n.id)}>
            <span style={{fontSize:16,width:18,textAlign:"center"}}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div style={{flex:1}}/>
        {machines.length>0 && (
          <div className="dtx-sb-machines" style={{borderTop:"0.5px solid #2e2e3a",paddingTop:10,marginTop:8}}>
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
      <div style={S.main} className="dtx-main">

        {/* TOPBAR */}
        <div style={S.topbar} className="dtx-topbar">
          <span style={{fontWeight:500,fontSize:15,flex:1}} className="dtx-view-title">
            {NAV.find(n=>n.id===view)?.label}
          </span>
          <div style={{position:"relative",display:"flex",alignItems:"center"}} className="dtx-search">
            <span style={{position:"absolute",left:9,fontSize:12,pointerEvents:"none"}}>🔍</span>
            <input style={S.search} placeholder="Search orders…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          {/* hidden file input for restore */}
          <input id="restore-input" type="file" accept=".json" style={{display:"none"}}
            onChange={e=>{ if(e.target.files?.[0]) importBackup(e.target.files[0]); e.target.value="" }}/>
          <div style={{display:"flex",gap:6,alignItems:"center"}} className="dtx-topbar-secondary">
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
          </div>
          <button style={S.btnPrimary} onClick={()=>{resetOF();setShowOM(true)}}>+ Order</button>
          <button
            onClick={onLogout}
            style={{...S.btnSm,color:"#E24B4A",border:"0.5px solid #fca5a5",marginLeft:4}}
            title="Sign out">
            ⎋ Sign out
          </button>
        </div>

        {/* ── DASHBOARD VIEW ────────────────────────────── */}
        {view==="dashboard" && (
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.metrics} className="dtx-metrics">
              {[
                {label:"Active orders", val:activeCount,                    sub:`${highCnt} high priority`},
                {label:"Remaining load",val:`${totalLoad.toLocaleString()}m`,sub:`${doneLoad.toLocaleString()}m produced`},
                {label:"Warp groups",   val:Object.keys(warpGroups).length,  sub:"changeover groups"},
                {label:"Overloaded",    val:overloaded.length,
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

            {/* low stock alerts */}
            {lowStockAlerts.map((a,i)=>(
              <div key={i} style={{...S.alert, background:"#FEF3C7", border:"0.5px solid #F59E0B", color:"#92400E"}}>
                {a.type==="thread" ? "🪡" : "📦"} Low stock: <strong>{a.label}</strong> — {a.current} remaining (min: {a.min})
              </div>
            ))}

            <div style={S.twoCol} className="dtx-twocol">
              {/* schedule card */}
              <div style={S.card}>
                <div style={S.cHead} className="dtx-chead"><span style={S.cTitle}>Machine schedule</span><span style={S.cSub}>active warp + queue · use arrows to reorder</span></div>
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
                                    <div style={{fontSize:13,fontWeight:500}}>{orderLabel(o)}</div>
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
                              const blockKey = `${m.id}||${wk}||${bi}`
                              const isExpanded = expandedBlocks.has(blockKey)
                              return (
                                <div key={wk+bi} style={{
                                  border:"0.5px solid #e5e5e5",borderRadius:8,
                                  marginBottom:6,overflow:"hidden",
                                  borderLeft: bi===0 ? "3px solid #7F77DD" : "3px solid #e0e0e0",
                                }}>
                                  {/* warp group header — click to expand/collapse */}
                                  <div
                                    onClick={()=>toggleBlock(blockKey)}
                                    style={{display:"flex",alignItems:"center",gap:8,
                                      padding:"8px 10px",background:bi===0?"#F8F7FF":"#fafafa",
                                      cursor:"pointer",userSelect:"none"}}
                                    onMouseEnter={e=>(e.currentTarget.style.background=bi===0?"#EEEDFE":"#f0f0f0")}
                                    onMouseLeave={e=>(e.currentTarget.style.background=bi===0?"#F8F7FF":"#fafafa")}
                                  >
                                    {/* expand chevron */}
                                    <span style={{fontSize:10,color:"#aaa",width:12,flexShrink:0,transition:"transform 0.15s",
                                      display:"inline-block",transform:isExpanded?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                                    <div style={{flex:1}}>
                                      <span style={{fontSize:12,fontWeight:600,color:bi===0?"#534AB7":"#555"}}>
                                        {block[0].fabricType} · {block[0].color}
                                      </span>
                                      <span style={{fontSize:11,color:"#aaa",marginLeft:8}}>
                                        {block.length} order{block.length>1?"s":""} · {totalM}m
                                      </span>
                                      <Badge text={topPri} color={priColor(topPri)}/>
                                    </div>
                                    {/* reorder arrows — stop propagation so they don't toggle expand */}
                                    <div style={{display:"flex",gap:2}} onClick={e=>e.stopPropagation()}>
                                      <button
                                        onClick={e=>{e.stopPropagation();moveWarpGroup(m.id, wk, "up")}}
                                        disabled={bi===0}
                                        style={{...S.btnIcon,fontSize:12,opacity:bi===0?0.3:1,padding:"2px 5px",
                                          border:"0.5px solid #e0e0e0",borderRadius:4}}
                                        title="Move warp group earlier">▲</button>
                                      <button
                                        onClick={e=>{e.stopPropagation();moveWarpGroup(m.id, wk, "down")}}
                                        disabled={bi===warpBlocks.length-1}
                                        style={{...S.btnIcon,fontSize:12,opacity:bi===warpBlocks.length-1?0.3:1,padding:"2px 5px",
                                          border:"0.5px solid #e0e0e0",borderRadius:4}}
                                        title="Move warp group later">▼</button>
                                    </div>
                                  </div>
                                  {/* orders — only shown when expanded */}
                                  {isExpanded && block.map((o,oi)=>(
                                    <div key={o.id} style={{...S.qItem,
                                      margin:0,borderRadius:0,borderBottom:"0.5px solid #f0f0f0",
                                      background:"transparent"}}>
                                      <span style={S.qNum}>{running.length + warpBlocks.slice(0,bi).reduce((s,b)=>s+b.length,0) + oi + 1}</span>
                                      <span style={{flex:1,fontSize:12}}>
                                        {orderLabel(o)} · {o.quantity}m
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
                <div style={S.cHead} className="dtx-chead">
                  <span style={S.cTitle}>Warp groups</span>
                  <span style={S.cSub}>{Object.keys(warpGroups).length} total</span>
                  <div style={{position:"relative",display:"flex",alignItems:"center",marginLeft:"auto"}}>
                    <span style={{position:"absolute",left:9,fontSize:12,pointerEvents:"none",color:"#aaa"}}>🔍</span>
                    <input
                      style={{...S.search,width:180,marginBottom:0,paddingLeft:28,fontSize:12}}
                      placeholder="Search warps…"
                      value={warpGroupSearch}
                      onChange={e=>setWarpGroupSearch(e.target.value)}
                      dir="auto"
                    />
                    {warpGroupSearch && (
                      <button
                        onClick={()=>setWarpGroupSearch("")}
                        style={{position:"absolute",right:8,background:"none",border:"none",
                          cursor:"pointer",color:"#aaa",fontSize:13,lineHeight:1}}>
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                <div style={S.cBody}>
                  {Object.keys(warpGroups).length===0&&<div style={S.empty}>No orders yet.</div>}
                  {(()=>{
                    const q = warpGroupSearch.toLowerCase().trim()
                    const entries = Object.entries(warpGroups).filter(([,{label,machine}])=>
                      !q ||
                      label.toLowerCase().includes(q) ||
                      machine.toLowerCase().includes(q)
                    )
                    if (entries.length===0) return <div style={S.empty}>No warp groups match "{warpGroupSearch}"</div>
                    return <>{entries.map(([key,{label,machine,meters,count,orderIds,closed}])=>(
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
                            onClick={()=>handleWarpNextRun(orderIds, label, machine, meters)}
                            style={{...S.btnSm,fontSize:11,padding:"4px 10px",
                              background:"#FEF9EE",color:"#92400E",border:"0.5px solid #FCD34D"}}
                            title="Seal this warp and log thread usage">
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
                        <button
                          onClick={()=>printWarpGroup(label, machine, orderIds, meters)}
                          style={{...S.btnSm,fontSize:11,padding:"4px 10px",
                            background:"#F3F2FD",color:"#534AB7",border:"0.5px solid #c4c0f0"}}
                          title="Print warp sheet for the worker">
                          🖨 Print sheet
                        </button>
                      </div>
                    </div>
                  ))}</>
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ORDERS VIEW ───────────────────────────────── */}
        {view==="orders" && (
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.card}>
              <div style={S.cHead} className="dtx-chead">
                <span style={S.cTitle}>Active orders</span>
                <span style={S.cSub}>{filteredOrders.length} shown · done in History</span>
                {/* sort controls */}
                <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
                  <button
                    onClick={()=>setOrderSort("name")}
                    style={{...S.btnSm,fontSize:11,padding:"3px 10px",
                      background:orderSort==="name"?"#7F77DD":"transparent",
                      color:orderSort==="name"?"#fff":"#888",
                      border:orderSort==="name"?"none":"0.5px solid #d5d5d5"}}>
                    A→Z
                  </button>
                  <button
                    onClick={()=>setOrderSort("deadline")}
                    style={{...S.btnSm,fontSize:11,padding:"3px 10px",
                      background:orderSort==="deadline"?"#7F77DD":"transparent",
                      color:orderSort==="deadline"?"#fff":"#888",
                      border:orderSort==="deadline"?"none":"0.5px solid #d5d5d5"}}>
                    📅 Deadline
                  </button>
                </div>
              </div>
              {search && (
                <div style={{padding:"6px 16px",fontSize:11,color:"#aaa",borderBottom:"0.5px solid #f5f5f5"}}>
                  Searching name, color, fabric type, and order number
                </div>
              )}
              <div style={S.cBody}>
                {filteredOrders.length===0&&<div style={S.empty}>No orders match your search.</div>}
                {filteredOrders.map(o=>{
                  const warn  = dlWarn(o.deadline)
                  const assignedMachine = machines.find(m => (schedule[m.id]??[]).some(x => x.id === o.id))
                  return (
                    <div key={o.id} style={S.oRow} className="dtx-orow">
                      <div style={{width:6,height:6,borderRadius:"50%",background:priColor(o.priority),marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:14,fontWeight:500}}>{orderLabel(o)}</div>
                        <div style={{fontSize:12,color:"#888",marginTop:2}}>{o.fabricType} · {o.color} · {(o.machineCategories??[]).join(", ")}</div>
                        {o.deadline&&(
                          <div style={{fontSize:11,marginTop:3,
                            color:warn==="urgent"?"#E24B4A":warn==="soon"?"#BA7517":"#aaa"}}>
                            {warn==="urgent"?"⚠️ ":""}Due {o.deadline}
                          </div>
                        )}
                        {o.orderDate&&<div style={{fontSize:11,color:"#aaa",marginTop:2}}>📅 Ordered: {o.orderDate}</div>}
                        {o.store&&<div style={{fontSize:11,color:"#534AB7",marginTop:2,fontWeight:500}}>🏪 {o.store}</div>}
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
                          <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>setConfirmDeleteOrder(o)} title="Delete">🗑</button>
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
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.card}>
              <div style={S.cHead} className="dtx-chead">
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
        {view==="analytics" && (()=>{
          const allOrders   = orders
          const doneOrders  = orders.filter(o => o.warpStatus === "done")
          const activeOrds  = orders.filter(o => o.warpStatus !== "done")

          // ── PRODUCTION TIME ──────────────────────────────
          // days from orderDate → completedAt
          const prodTimes = doneOrders
            .filter(o => o.orderDate && o.completedAt)
            .map(o => {
              const start = new Date(o.orderDate!).getTime()
              const end   = new Date(o.completedAt!).getTime()
              return Math.round((end - start) / 86400000)
            })
            .filter(d => d >= 0)

          const avgProdDays = prodTimes.length
            ? Math.round(prodTimes.reduce((s,d)=>s+d,0) / prodTimes.length)
            : null
          const minProdDays = prodTimes.length ? Math.min(...prodTimes) : null
          const maxProdDays = prodTimes.length ? Math.max(...prodTimes) : null

          // ── ON-TIME RATE ──────────────────────────────────
          const withDeadline = doneOrders.filter(o => o.deadline && o.completedAt)
          const onTime = withDeadline.filter(o =>
            new Date(o.completedAt!) <= new Date(o.deadline)
          )
          const onTimeRate = withDeadline.length
            ? Math.round(onTime.length / withDeadline.length * 100)
            : null

          // ── MOST ORDERED COLOR ────────────────────────────
          const colorCount: Record<string,number> = {}
          for (const o of allOrders) colorCount[o.color] = (colorCount[o.color]||0) + 1
          const topColors = Object.entries(colorCount).sort((a,b)=>b[1]-a[1]).slice(0,8)

          // ── MOST ORDERED FABRIC TYPE ──────────────────────

          // ── MACHINE UTILIZATION ───────────────────────────
          const machineMeters: Record<string,{name:string;meters:number;orders:number}> = {}
          for (const m of machines) machineMeters[m.id] = {name:m.name,meters:0,orders:0}
          for (const m of machines) {
            for (const o of (schedule[m.id]??[])) {
              machineMeters[m.id].meters += o.quantity
              machineMeters[m.id].orders++
            }
          }
          const machineStats = Object.values(machineMeters).sort((a,b)=>b.meters-a.meters)
          const maxMachineM  = Math.max(...machineStats.map(m=>m.meters), 1)

          // ── AVG PROD TIME PER PRIORITY ────────────────────
          const priTimes: Record<Priority,number[]> = {High:[],Normal:[],Low:[]}
          for (const o of doneOrders) {
            if (!o.orderDate || !o.completedAt) continue
            const days = Math.round((new Date(o.completedAt).getTime() - new Date(o.orderDate).getTime()) / 86400000)
            if (days >= 0) priTimes[o.priority].push(days)
          }
          const avgByPri = (p: Priority) => priTimes[p].length
            ? Math.round(priTimes[p].reduce((s,d)=>s+d,0)/priTimes[p].length)
            : null

          // ── ORDERS PER MONTH ──────────────────────────────
          const monthCount: Record<string,{received:number;completed:number}> = {}
          for (const o of allOrders) {
            const d = o.orderDate || o.deadline
            if (!d) continue
            const key = d.slice(0,7)   // "2025-06"
            if (!monthCount[key]) monthCount[key] = {received:0,completed:0}
            monthCount[key].received++
          }
          for (const o of doneOrders) {
            const d = o.completedAt
            if (!d) continue
            const key = d.slice(0,7)
            if (!monthCount[key]) monthCount[key] = {received:0,completed:0}
            monthCount[key].completed++
          }
          const months = Object.keys(monthCount).sort().slice(-12)   // last 12 months
          const maxMonthVal = Math.max(...months.map(m=>Math.max(monthCount[m].received,monthCount[m].completed)),1)

          // ── STOCK VELOCITY ────────────────────────────────
          // threads: sum of OUT entries in last 30 days
          const now30 = Date.now() - 30*86400000
          const threadVelocity = threads.map(t=>{
            const outKg = stockLog
              .filter(l=>l.itemId===t.id&&l.itemType==="thread"&&l.direction==="out"&&new Date(l.date).getTime()>now30)
              .reduce((s,l)=>s+(l.quantityKg||0),0)
            return {label:t.code+(t.name?` — ${t.name}`:""),outKg}
          }).filter(t=>t.outKg>0).sort((a,b)=>b.outKg-a.outKg).slice(0,6)

          const tsVelocity = textileStock.map(ts=>{
            const outM = stockLog
              .filter(l=>l.itemId===ts.id&&l.itemType==="textile-stock"&&l.direction==="out"&&new Date(l.date).getTime()>now30)
              .reduce((s,l)=>s+(l.quantityM||0),0)
            return {label:ts.textileCode+(ts.textileName?` — ${ts.textileName}`:""),outM}
          }).filter(t=>t.outM>0).sort((a,b)=>b.outM-a.outM).slice(0,6)


          // helper: stat card
          const StatCard = ({label,val,sub,color}:{label:string;val:string|number|null;sub?:string;color?:string})=>(
            <div style={S.mCard}>
              <div style={S.mLabel}>{label}</div>
              <div style={{...S.mVal,color:color||"#1a1a1a"}}>{val??<span style={{color:"#ccc",fontSize:16}}>—</span>}</div>
              {sub&&<div style={S.mSub}>{sub}</div>}
            </div>
          )

          return (
            <div style={S.viewPad} className="dtx-viewpad">

              {/* ── KPI STRIP ─────────────────────────────── */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}} className="dtx-metrics">
                <StatCard label="Total orders" val={allOrders.length} sub={`${doneOrders.length} completed`}/>
                <StatCard label="Avg production time" val={avgProdDays!==null?`${avgProdDays}d`:null} sub={prodTimes.length?`from ${prodTimes.length} tracked orders`:"add order dates to track"}/>
                <StatCard label="On-time rate" val={onTimeRate!==null?`${onTimeRate}%`:null} sub={withDeadline.length?`${onTime.length}/${withDeadline.length} orders`:"need deadline+done orders"}/>
                <StatCard label="Total meters" val={`${allOrders.reduce((s,o)=>s+o.quantity,0).toLocaleString()}m`} sub={`${doneOrders.reduce((s,o)=>s+o.quantity,0).toLocaleString()}m produced`}/>
              </div>

              <div style={S.twoCol} className="dtx-twocol">

                {/* ── PRODUCTION TIME BY PRIORITY ───────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Avg production time by priority</span>
                    <span style={S.cSub}>order date → done</span>
                  </div>
                  <div style={S.cBody}>
                    {(["High","Normal","Low"] as Priority[]).map(p=>{
                      const avg = avgByPri(p)
                      return (
                        <div key={p} style={{marginBottom:16}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                            <span style={{color:priColor(p),fontWeight:500}}>{p}</span>
                            <span>{avg!==null?`${avg} days avg (${priTimes[p].length} orders)`:"not enough data"}</span>
                          </div>
                          {avg!==null&&<Bar pct={Math.min(avg/30*100,100)} color={priColor(p)} h={8}/>}
                        </div>
                      )
                    })}
                    {avgProdDays!==null&&(
                      <div style={{marginTop:8,padding:"10px 12px",background:"#F3F2FD",borderRadius:8,fontSize:13}}>
                        <span style={{color:"#534AB7",fontWeight:600}}>Overall avg: {avgProdDays} days</span>
                        <span style={{color:"#888",marginLeft:8}}>fastest: {minProdDays}d · slowest: {maxProdDays}d</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── ORDERS RECEIVED PER MONTH ─────────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Monthly activity</span>
                    <span style={S.cSub}>last 12 months</span>
                  </div>
                  <div style={S.cBody}>
                    {months.length===0&&<div style={S.empty}>Add order dates to see monthly trends.</div>}
                    {months.map(m=>{
                      const {received,completed} = monthCount[m]
                      const label = new Date(m+"-01").toLocaleDateString("en-GB",{month:"short",year:"2-digit"})
                      return (
                        <div key={m} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                            <span style={{color:"#555",fontWeight:500}}>{label}</span>
                            <span style={{color:"#aaa"}}>{received} received · {completed} completed</span>
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            <Bar pct={Math.round(received/maxMonthVal*100)} color="#7F77DD" h={5}/>
                            <Bar pct={Math.round(completed/maxMonthVal*100)} color="#639922" h={5}/>
                          </div>
                        </div>
                      )
                    })}
                    {months.length>0&&(
                      <div style={{display:"flex",gap:16,marginTop:8,fontSize:11}}>
                        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:5,background:"#7F77DD",borderRadius:2,display:"inline-block"}}/>Received</span>
                        <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:5,background:"#639922",borderRadius:2,display:"inline-block"}}/>Completed</span>
                      </div>
                    )}
                  </div>
                </div>


                {/* ── TOP COLORS ────────────────────────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Most ordered colors</span>
                  </div>
                  <div style={S.cBody}>
                    {topColors.length===0&&<div style={S.empty}>No orders yet.</div>}
                    {topColors.map(([color,cnt],i)=>{
                      const pc=Math.round(cnt/Math.max(...topColors.map(c=>c[1]))*100)
                      return (
                        <div key={color} style={{marginBottom:10}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}>
                            <span dir="auto">{color}</span>
                            <span style={{color:"#888"}}>{cnt} orders</span>
                          </div>
                          <Bar pct={pc} color={`hsl(${i*37},60%,55%)`} h={6}/>
                        </div>
                      )
                    })}
                  </div>
                </div>


                {/* ── MACHINE UTILIZATION ───────────────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Machine utilization</span>
                    <span style={S.cSub}>current active load</span>
                  </div>
                  <div style={S.cBody}>
                    {machineStats.length===0&&<div style={S.empty}>No machines yet.</div>}
                    {machineStats.map(m=>{
                      const pc=Math.round(m.meters/maxMachineM*100)
                      const machine = machines.find(x=>x.name===m.name)
                      const st = machine ? machineStatus(m.meters,machine.capacity??DEFAULT_CAP) : "IDLE"
                      return (
                        <div key={m.name} style={{marginBottom:14}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                            <span style={{fontWeight:500}}>{m.name}</span>
                            <span style={{color:statColor(st)}}>{m.meters.toLocaleString()}m · {m.orders} orders</span>
                          </div>
                          <Bar pct={pc} color={statColor(st)} h={8}/>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── WARP STATUS OVERVIEW ──────────────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Order status overview</span>
                  </div>
                  <div style={S.cBody}>
                    {(["not-started","on-machine","done"] as WarpStatus[]).map(st=>{
                      const cnt=allOrders.filter(o=>o.warpStatus===st).length
                      const pc=allOrders.length?Math.round(cnt/allOrders.length*100):0
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
                    <div style={{marginTop:12,padding:"10px 12px",background:"#fafafa",borderRadius:8}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
                        <div><div style={{color:"#aaa",marginBottom:2}}>Active orders</div><div style={{fontWeight:600}}>{activeOrds.length}</div></div>
                        <div><div style={{color:"#aaa",marginBottom:2}}>Total meters active</div><div style={{fontWeight:600}}>{activeOrds.reduce((s,o)=>s+o.quantity,0).toLocaleString()}m</div></div>
                        <div><div style={{color:"#aaa",marginBottom:2}}>High priority active</div><div style={{fontWeight:600,color:"#E24B4A"}}>{activeOrds.filter(o=>o.priority==="High").length}</div></div>
                        <div><div style={{color:"#aaa",marginBottom:2}}>Overdue active</div><div style={{fontWeight:600,color:"#E24B4A"}}>{activeOrds.filter(o=>o.deadline&&new Date(o.deadline)<new Date()).length}</div></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── THREAD VELOCITY ───────────────────────── */}
                {threadVelocity.length>0&&(
                  <div style={S.card}>
                    <div style={S.cHead} className="dtx-chead">
                      <span style={S.cTitle}>Thread consumption</span>
                      <span style={S.cSub}>last 30 days</span>
                    </div>
                    <div style={S.cBody}>
                      {threadVelocity.map((t,i)=>{
                        const pc=Math.round(t.outKg/Math.max(...threadVelocity.map(x=>x.outKg))*100)
                        return (
                          <div key={t.label} style={{marginBottom:10}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                              <span dir="auto">{t.label}</span><span style={{color:"#888"}}>{t.outKg}kg</span>
                            </div>
                            <Bar pct={pc} color={`hsl(${30+i*15},70%,50%)`} h={6}/>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── TEXTILE STOCK VELOCITY ────────────────── */}
                {tsVelocity.length>0&&(
                  <div style={S.card}>
                    <div style={S.cHead} className="dtx-chead">
                      <span style={S.cTitle}>Finished textile outflow</span>
                      <span style={S.cSub}>delivered last 30 days</span>
                    </div>
                    <div style={S.cBody}>
                      {tsVelocity.map((t,i)=>{
                        const pc=Math.round(t.outM/Math.max(...tsVelocity.map(x=>x.outM))*100)
                        return (
                          <div key={t.label} style={{marginBottom:10}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                              <span dir="auto">{t.label}</span><span style={{color:"#888"}}>{t.outM}m</span>
                            </div>
                            <Bar pct={pc} color={`hsl(${140+i*15},60%,45%)`} h={6}/>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── ORDERS PER MACHINE CATEGORY ───────────── */}
                <div style={S.card}>
                  <div style={S.cHead} className="dtx-chead">
                    <span style={S.cTitle}>Orders per machine type</span>
                  </div>
                  <div style={S.cBody}>
                    {CATS.map(cat=>{
                      const cnt=allOrders.filter(o=>(o.machineCategories??[]).includes(cat)).length
                      const pc=allOrders.length?Math.round(cnt/allOrders.length*100):0
                      return (
                        <div key={cat} style={{marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                            <span>{cat}</span><span style={{color:"#888"}}>{cnt}</span>
                          </div>
                          <Bar pct={pc} color="#7F77DD" h={6}/>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* ── STORE ANALYTICS ───────────────────────── */}
                {(()=>{
                  const storeData = STORES.map(s=>{
                    const ords   = allOrders.filter(o=>o.store===s)
                    const meters = ords.reduce((sum,o)=>sum+o.quantity,0)
                    const done   = ords.filter(o=>o.warpStatus==="done").length
                    const high   = ords.filter(o=>o.priority==="High").length
                    const overdue= ords.filter(o=>o.warpStatus!=="done"&&o.deadline&&new Date(o.deadline)<new Date()).length
                    const avgSize= ords.length?Math.round(meters/ords.length):0
                    return {store:s, count:ords.length, meters, done, high, overdue, avgSize}
                  }).filter(s=>s.count>0).sort((a,b)=>b.meters-a.meters)
                  const maxM=Math.max(...storeData.map(s=>s.meters),1)
                  const noStore=allOrders.filter(o=>!o.store).length
                  if(storeData.length===0) return (
                    <div style={{...S.card,gridColumn:"1 / -1"}}>
                      <div style={S.cHead} className="dtx-chead"><span style={S.cTitle}>🏪 Store analytics</span></div>
                      <div style={S.cBody}><div style={S.empty}>No store data yet.</div></div>
                    </div>
                  )
                  return (
                    <div style={{...S.card,gridColumn:"1 / -1"}}>
                      <div style={S.cHead} className="dtx-chead">
                        <span style={S.cTitle}>🏪 Store analytics</span>
                        <span style={S.cSub}>orders, meters, urgency per branch</span>
                      </div>
                      <div style={S.cBody}>
                        {/* summary strip */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}} className="dtx-metrics">
                          <div style={{background:"#F3F2FD",borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:11,color:"#534AB7",marginBottom:2}}>Active branches</div>
                            <div style={{fontSize:20,fontWeight:700,color:"#534AB7"}}>{storeData.length}</div>
                          </div>
                          <div style={{background:"#EDFBEE",borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:11,color:"#166534",marginBottom:2}}>Top branch</div>
                            <div style={{fontSize:14,fontWeight:700,color:"#166534"}} dir="auto">{storeData[0]?.store||"—"}</div>
                          </div>
                          <div style={{background:"#FEF3C7",borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:11,color:"#92400E",marginBottom:2}}>Total overdue</div>
                            <div style={{fontSize:20,fontWeight:700,color:"#92400E"}}>{storeData.reduce((s,d)=>s+d.overdue,0)}</div>
                          </div>
                          <div style={{background:"#f5f5f5",borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:11,color:"#555",marginBottom:2}}>No store assigned</div>
                            <div style={{fontSize:20,fontWeight:700,color:"#555"}}>{noStore}</div>
                          </div>
                        </div>
                        {/* per-store bars */}
                        {storeData.map((s,i)=>(
                          <div key={s.store} style={{marginBottom:14}}>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4,alignItems:"center",flexWrap:"wrap",gap:6}}>
                              <span style={{fontWeight:i<3?600:400}} dir="auto">
                                {i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":""}{s.store}
                              </span>
                              <div style={{display:"flex",gap:10,fontSize:11,flexWrap:"wrap"}}>
                                <span style={{color:"#555"}}>{s.count} orders</span>
                                <span style={{color:"#534AB7",fontWeight:600}}>{s.meters.toLocaleString()}m</span>
                                <span style={{color:"#166534"}}>✓ {s.done} done</span>
                                {s.high>0&&<span style={{color:"#E24B4A"}}>⚡ {s.high} urgent</span>}
                                {s.overdue>0&&<span style={{color:"#92400E",fontWeight:600}}>⚠ {s.overdue} overdue</span>}
                                <span style={{color:"#aaa"}}>avg {s.avgSize}m/order</span>
                              </div>
                            </div>
                            <Bar pct={Math.round(s.meters/maxM*100)} color={i===0?"#534AB7":i===1?"#7F77DD":"#c4c0f0"} h={8}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* ── OVERDUE ANALYSIS ──────────────────────── */}
                {(()=>{
                  const today=new Date(); today.setHours(0,0,0,0)
                  const overdueOrds=allOrders.filter(o=>
                    o.warpStatus!=="done"&&o.deadline&&new Date(o.deadline)<today
                  ).map(o=>{
                    const days=Math.round((today.getTime()-new Date(o.deadline).getTime())/86400000)
                    return {...o, daysLate:days}
                  }).sort((a,b)=>b.daysLate-a.daysLate)

                  const [showAll, setShowAll] = [overdueShowAll, setOverdueShowAll]
                  const visible = showAll ? overdueOrds : overdueOrds.slice(0,10)

                  // Group by how late
                  const critical = overdueOrds.filter(o=>o.daysLate>14).length
                  const warning  = overdueOrds.filter(o=>o.daysLate>7&&o.daysLate<=14).length
                  const mild     = overdueOrds.filter(o=>o.daysLate<=7).length

                  return (
                    <div style={{...S.card,gridColumn:"1 / -1"}}>
                      <div style={S.cHead} className="dtx-chead">
                        <span style={S.cTitle}>⚠️ Overdue orders</span>
                        <span style={S.cSub}>active orders past their deadline</span>
                        {overdueOrds.length>0&&<span style={{marginLeft:"auto",padding:"3px 10px",borderRadius:20,background:"#FEEBEB",color:"#A32D2D",fontSize:11,fontWeight:600}}>{overdueOrds.length} overdue</span>}
                      </div>
                      <div style={S.cBody}>
                        {overdueOrds.length===0?(
                          <div style={{textAlign:"center",padding:"20px 0",color:"#166534",fontWeight:500}}>✅ No overdue orders right now</div>
                        ):(
                          <>
                            {/* severity strip */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:16}} className="dtx-metrics">
                              <div style={{background:"#FEEBEB",borderRadius:8,padding:"10px 14px"}}>
                                <div style={{fontSize:11,color:"#A32D2D",marginBottom:2}}>Critical (&gt;14 days)</div>
                                <div style={{fontSize:22,fontWeight:700,color:"#A32D2D"}}>{critical}</div>
                              </div>
                              <div style={{background:"#FEF3C7",borderRadius:8,padding:"10px 14px"}}>
                                <div style={{fontSize:11,color:"#92400E",marginBottom:2}}>Warning (8–14 days)</div>
                                <div style={{fontSize:22,fontWeight:700,color:"#92400E"}}>{warning}</div>
                              </div>
                              <div style={{background:"#f5f5f5",borderRadius:8,padding:"10px 14px"}}>
                                <div style={{fontSize:11,color:"#555",marginBottom:2}}>Mild (1–7 days)</div>
                                <div style={{fontSize:22,fontWeight:700,color:"#555"}}>{mild}</div>
                              </div>
                            </div>
                            {/* list */}
                            <div style={{border:"0.5px solid #e5e5e5",borderRadius:8,overflow:"hidden"}}>
                              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                                <thead>
                                  <tr style={{background:"#f5f5f5"}}>
                                    {["Days late","Code","Name","Qty","Deadline","Store","Priority"].map(h=>(
                                      <th key={h} style={{padding:"7px 10px",textAlign:"right",fontWeight:500,color:"#555"}}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {visible.map(o=>{
                                    const bg=o.daysLate>14?"#fff8f8":o.daysLate>7?"#fffbf0":"transparent"
                                    const dc=o.daysLate>14?"#A32D2D":o.daysLate>7?"#92400E":"#555"
                                    return (
                                      <tr key={o.id} style={{background:bg,borderBottom:"0.5px solid #f5f5f5"}}>
                                        <td style={{padding:"7px 10px",fontWeight:700,color:dc}}>{o.daysLate}d</td>
                                        <td style={{padding:"7px 10px",fontWeight:600}}>{o.textileCode}</td>
                                        <td style={{padding:"7px 10px",color:"#555"}} dir="auto">{o.textileName||"—"}</td>
                                        <td style={{padding:"7px 10px",color:"#534AB7",fontWeight:600}}>{o.quantity}m</td>
                                        <td style={{padding:"7px 10px",color:"#aaa"}}>{o.deadline}</td>
                                        <td style={{padding:"7px 10px"}} dir="auto">{o.store||"—"}</td>
                                        <td style={{padding:"7px 10px"}}><span style={{padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:500,background:priColor(o.priority)+"22",color:priColor(o.priority)}}>{o.priority}</span></td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {overdueOrds.length>10&&(
                              <button style={{...S.btnSm,marginTop:10}} onClick={()=>setShowAll(v=>!v)}>
                                {showAll?`Show less ▲`:`Show all ${overdueOrds.length} ▼`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── SEASONAL DEMAND ───────────────────────── */}
                {(()=>{
                  // Date range from preset
                  const now=new Date()
                  let fromDate: Date|null=null
                  let toDate: Date|null=null
                  if(seasonPreset==="month"){
                    fromDate=new Date(now); fromDate.setDate(now.getDate()-30)
                  } else if(seasonPreset==="3months"){
                    fromDate=new Date(now); fromDate.setDate(now.getDate()-90)
                  } else if(seasonPreset==="custom"){
                    if(seasonFrom) fromDate=new Date(seasonFrom)
                    if(seasonTo)   toDate=new Date(seasonTo)
                  }

                  const filtered=allOrders.filter(o=>{
                    if(!o.orderDate) return false
                    const d=new Date(o.orderDate)
                    if(fromDate&&d<fromDate) return false
                    if(toDate&&d>toDate) return false
                    return true
                  })

                  // Group by baseCode+name
                  const grouped: Record<string,{baseCode:string;name:string;meters:number;orders:number;variants:Record<string,number>}>={}
                  for(const o of filtered){
                    const base=o.textileCode.split("/")[0]
                    if(!grouped[base]) grouped[base]={baseCode:base,name:o.textileName||"",meters:0,orders:0,variants:{}}
                    grouped[base].meters+=o.quantity
                    grouped[base].orders++
                    grouped[base].variants[o.textileCode]=(grouped[base].variants[o.textileCode]||0)+o.quantity
                  }
                  const sorted=Object.values(grouped).sort((a,b)=>b.meters-a.meters).slice(0,15)
                  const maxM=Math.max(...sorted.map(g=>g.meters),1)

                  const presetLabel=seasonPreset==="month"?"Last 30 days":
                    seasonPreset==="3months"?"Last 3 months":
                    seasonPreset==="custom"&&(seasonFrom||seasonTo)?`${seasonFrom||"…"} → ${seasonTo||"…"}`:"All time"

                  return (
                    <div style={{...S.card,gridColumn:"1 / -1"}}>
                      <div style={S.cHead} className="dtx-chead">
                        <span style={S.cTitle}>📅 Textile demand by period</span>
                        <span style={S.cSub}>{presetLabel} · {filtered.length} orders · {filtered.reduce((s,o)=>s+o.quantity,0).toLocaleString()}m</span>
                      </div>
                      <div style={S.cBody}>
                        {/* period selector */}
                        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
                          {(["all","month","3months","custom"] as const).map(p=>(
                            <button key={p} onClick={()=>setSeasonPreset(p)}
                              style={{padding:"5px 14px",borderRadius:20,border:"0.5px solid",cursor:"pointer",fontSize:12,fontWeight:500,
                                borderColor:seasonPreset===p?"#534AB7":"#e5e5e5",
                                background:seasonPreset===p?"#534AB7":"#fff",
                                color:seasonPreset===p?"#fff":"#555"}}>
                              {p==="all"?"All time":p==="month"?"Last 30 days":p==="3months"?"Last 3 months":"Custom range"}
                            </button>
                          ))}
                          {seasonPreset==="custom"&&(
                            <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:4}}>
                              <input type="date" value={seasonFrom} onChange={e=>setSeasonFrom(e.target.value)}
                                style={{padding:"4px 8px",border:"0.5px solid #e5e5e5",borderRadius:6,fontSize:12}}/>
                              <span style={{color:"#aaa",fontSize:12}}>→</span>
                              <input type="date" value={seasonTo} onChange={e=>setSeasonTo(e.target.value)}
                                style={{padding:"4px 8px",border:"0.5px solid #e5e5e5",borderRadius:6,fontSize:12}}/>
                            </div>
                          )}
                        </div>
                        {sorted.length===0?(
                          <div style={S.empty}>No orders in this period.</div>
                        ):(
                          sorted.map((g,i)=>{
                            const isOpen=expandedBase===`season_${g.baseCode}`
                            const varSorted=Object.entries(g.variants).sort((a,b)=>b[1]-a[1])
                            const maxV=Math.max(...varSorted.map(v=>v[1]),1)
                            return (
                              <div key={g.baseCode} style={{marginBottom:6}}>
                                <div onClick={()=>setExpandedBase(isOpen?null:`season_${g.baseCode}`)}
                                  style={{cursor:"pointer",padding:"8px 10px",borderRadius:8,
                                    background:isOpen?"#F3F2FD":"transparent",
                                    border:`0.5px solid ${isOpen?"#c4c0f0":"transparent"}`}}>
                                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                                      <span style={{fontSize:12,color:"#888",minWidth:20}}>{i+1}</span>
                                      <span style={{fontWeight:i<3?700:500,color:i===0?"#534AB7":i<3?"#1a1a1a":"#333",fontSize:13}} dir="auto">
                                        {i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":""}{g.baseCode} — {g.name}
                                      </span>
                                    </div>
                                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                                      <span style={{fontSize:12,color:"#534AB7",fontWeight:600}}>{g.meters.toLocaleString()}m</span>
                                      <span style={{fontSize:11,color:"#aaa"}}>{g.orders} orders · {varSorted.length} variants</span>
                                      <span style={{fontSize:11,color:"#7F77DD"}}>{isOpen?"▲":"▼"}</span>
                                    </div>
                                  </div>
                                  <Bar pct={Math.round(g.meters/maxM*100)} color={i===0?"#534AB7":i<3?"#7F77DD":"#c4c0f0"} h={5}/>
                                </div>
                                {isOpen&&(
                                  <div style={{marginLeft:28,marginTop:4,padding:"10px 12px",background:"#faf9ff",borderRadius:8,border:"0.5px solid #e8e6ff"}}>
                                    {varSorted.map(([code,meters],j)=>(
                                      <div key={code} style={{marginBottom:j<varSorted.length-1?8:0}}>
                                        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                                          <span style={{fontFamily:"monospace",color:"#534AB7",fontWeight:500}}>{code}</span>
                                          <span style={{fontWeight:600}}>{meters.toLocaleString()}m</span>
                                        </div>
                                        <Bar pct={Math.round(meters/maxV*100)} color="#7F77DD" h={4}/>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )
                })()}

              </div>
            </div>
          )
        })()}

        {/* ── HISTORY VIEW ──────────────────────────────── */}
        {view==="history" && (()=>{
          const doneOrders = orders.filter(o => o.warpStatus === "done")
          const filtered = historySearch.trim()
            ? doneOrders.filter(o =>
                o.textileCode.toLowerCase().includes(historySearch.toLowerCase()) ||
                (o.textileName ?? "").toLowerCase().includes(historySearch.toLowerCase()) ||
                o.color.toLowerCase().includes(historySearch.toLowerCase()) ||
                o.fabricType.toLowerCase().includes(historySearch.toLowerCase())
              )
            : doneOrders
          const totalDoneMeters = doneOrders.reduce((s,o)=>s+o.quantity,0)
          return (
            <div style={S.viewPad} className="dtx-viewpad">
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
                <div style={S.cHead} className="dtx-chead">
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
                            textDecoration:"line-through",color:"#666"}}>{orderLabel(o)}</div>
                          <div style={{fontSize:12,color:"#aaa",marginTop:2}}>
                            {o.fabricType} · {o.color} · {(o.machineCategories??[]).join(", ")}
                          </div>
                          {o.deadline&&(
                            <div style={{fontSize:11,marginTop:3,
                              color:warn==="urgent"?"#E24B4A":warn==="soon"?"#BA7517":"#aaa"}}>
                              {warn==="urgent"?"⚠️ Late — ":""}Due {o.deadline}
                            </div>
                          )}
                          {o.orderDate&&<div style={{fontSize:11,color:"#bbb",marginTop:2}}>📅 Ordered: {o.orderDate}</div>}
                          {o.store&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>🏪 {o.store}</div>}
                          {o.notes&&<div style={{fontSize:11,color:"#bbb",marginTop:2,fontStyle:"italic"}}>{o.notes}</div>}
                          {o.orderNumber&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2,fontWeight:500}}>#{o.orderNumber}</div>}
                          {o.completedAt&&(
                            <div style={{fontSize:11,marginTop:3,color:"#639922",fontWeight:500}}>
                              ✓ Completed {new Date(o.completedAt).toLocaleDateString("en-GB",{
                                day:"2-digit", month:"short", year:"numeric",
                                hour:"2-digit", minute:"2-digit"
                              })}
                            </div>
                          )}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                          <Badge text="Done" color="#639922"/>
                          <span style={{fontSize:13,color:"#aaa"}}>{o.quantity}m</span>
                          <Badge text={o.priority} color={priColor(o.priority)}/>
                          {/* restore button — move back to active if marked done by mistake */}
                          <button
                            onClick={async ()=>{
                              const restored = {...o, warpStatus:"not-started" as WarpStatus, completedAt:undefined}
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
                title: `Move "${orderLabel(o)}" off overloaded ${m.name}`,
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
                title: `Urgent order "${orderLabel(o)}" is queued behind lower-priority work`,
                detail: `"${orderLabel(o)}" (High priority, due in ${Math.round(diff)} days) is position ${i+1} in ${m.name}'s queue. There are ${aheadLow.length} lower-priority order${aheadLow.length>1?"s":""} ahead of it.`,
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
            <div style={S.viewPad} className="dtx-viewpad">
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

        {/* ── IMPORT VIEW ───────────────────────────────── */}
        {view==="import" && (()=>{
          // Column indices (from row 6 header in XLS):
          // 0=orderNum, 5=due, 7=ordered, 9=qty, 13=colorCode, 17=patCode, 18=texName, 24=itemCode

          async function parseXLS(file:File):Promise<ImportRow[]> {
            // Load SheetJS from CDN
            if(!(window as unknown as Record<string,unknown>).XLSX){
              await new Promise<void>((res,rej)=>{
                const s=document.createElement("script")
                s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
                s.onload=()=>res(); s.onerror=()=>rej(new Error("Failed to load SheetJS"))
                document.head.appendChild(s)
              })
            }
            const XLSX=(window as unknown as Record<string,unknown>).XLSX as {
              read:(data:ArrayBuffer,opts:{type:string;cellDates:boolean})=>{
                SheetNames:string[]
                Sheets:Record<string,unknown>
              }
              utils:{
                sheet_to_json:<T>(ws:unknown,opts:{header:number;raw:boolean;dateNF:string})=>T[]
              }
            }
            const ab = await file.arrayBuffer()
            const wb = XLSX.read(ab, {type:"array", cellDates:true})
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rawRows = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws, {header:1, raw:false, dateNF:"yyyy-mm-dd"})
            const raw = rawRows as unknown as unknown[][]

            const texMap:Record<string,Textile>={}
            for(const t of textiles) texMap[t.code]=t

            // Build TWO lookup sets from existing orders:
            // 1. With order number (for orders that have one)
            // 2. Without order number (fallback for manually entered orders)
            const exKeysWithOn=new Set(
              orders.filter(o=>o.orderNumber).map(o=>`${o.textileCode}||${o.orderDate||""}||${o.quantity}||${o.orderNumber}`)
            )
            const exKeysNoOn=new Set(
              orders.filter(o=>!o.orderNumber).map(o=>`${o.textileCode}||${o.orderDate||""}||${o.quantity}`)
            )

            function fmtDate(v:unknown):string {
              if(!v) return ""
              const s=String(v).trim()
              // Already YYYY-MM-DD
              if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
              // YYYY/MM/DD
              if(/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g,'-')
              // M/D/YYYY or MM/DD/YYYY (US format SheetJS sometimes outputs)
              const us=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
              if(us) return `${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`
              // D/M/YYYY
              const eu=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
              if(eu) return `${eu[3]}-${eu[2].padStart(2,'0')}-${eu[1].padStart(2,'0')}`
              // JS Date object (when cellDates:true)
              if(v instanceof Date){
                const d=v as Date
                const y=d.getFullYear()
                const m=String(d.getMonth()+1).padStart(2,'0')
                const day=String(d.getDate()).padStart(2,'0')
                return `${y}-${m}-${day}`
              }
              return s
            }

            const rows:ImportRow[]=[]
            const seen=new Set<string>()

            for(const row of raw){
              const on   = String(row[0]||"").trim()
              const ic   = String(row[24]||"").trim()

              // Data row: col 0 = 6-digit orderNum, col 24 = 6-digit itemCode starting with 0
              if(!/^\d{6}$/.test(on)) continue
              if(!/^0\d{5}$/.test(ic)) continue

              const due     = fmtDate(row[5])
              const ordered = fmtDate(row[7])
              const qtyRaw  = parseFloat(String(row[9]||"0").replace(/[^\d.]/g,""))
              if(!qtyRaw||qtyRaw<=0) continue
              const qty     = Math.ceil(qtyRaw)

              const pc = String(row[17]||"01").trim().padStart(2,"0")
              const cc = String(row[13]||"01").trim().padStart(2,"0")
              const appCode = `${parseInt(ic,10)}/${pc}/${cc}`

              // Smart duplicate check:
              // - If Excel order has an order number → match on code+date+qty+orderNum
              // - If no order number → fall back to code+date+qty
              const dkFull = `${appCode}||${ordered}||${qty}||${on}`
              const dkBase = `${appCode}||${ordered}||${qty}`
              if(seen.has(dkFull)) continue
              seen.add(dkFull)

              const isDup = exKeysWithOn.has(dkFull) || exKeysNoOn.has(dkBase)

              const tex = texMap[appCode]||null
              const status:ImportRow["status"] = !tex?"no-textile":isDup?"duplicate":"new"

              rows.push({
                appCode, textileName:tex?tex.name:String(row[18]||"").trim(),
                qty, ordered, due, orderNum:on,
                store:String(row[2]||"").trim(), status, tex
              })
            }
            return rows
          }

          async function handleFile(e:React.ChangeEvent<HTMLInputElement>){
            const file=e.target.files?.[0]; if(!file)return
            setImportStatus("parsing"); setImportLog([`Reading ${file.name}...`])
            try{
              const rows=await parseXLS(file)
              if(!rows.length) throw new Error("No orders found. Check this is the correct file.")
              setImportRows(rows)
              setImportSelected(new Set(rows.map((_,i)=>i).filter(i=>rows[i].status==="new")))
              setImportStatus("preview")
              const nN=rows.filter(r=>r.status==="new").length
              const nD=rows.filter(r=>r.status==="duplicate").length
              const nNo=rows.filter(r=>r.status==="no-textile").length
              setImportLog([`✓ Found ${rows.length} orders — ${nN} new, ${nD} duplicates, ${nNo} no textile`])
            }catch(err){
              setImportStatus("idle")
              setImportLog([`❌ Error: ${String(err)}`])
            }
            e.target.value=""
          }

          async function doImport(){
            const sel=[...importSelected].map(i=>importRows[i]).filter(r=>r.status==="new"&&r.tex)
            if(!sel.length)return
            setImportStatus("importing")
            const log:string[]=[]
            for(let i=0;i<sel.length;i++){
              const r=sel[i]; const t=r.tex!
              const newOrder:Order={
                id:Date.now()+i, textileCode:r.appCode, textileName:t.name,
                color:t.color, fabricType:t.fabricType, quantity:r.qty,
                deadline:r.due, orderDate:r.ordered, priority:"Normal",
                machineCategories:t.machineCategories, warpStatus:"not-started",
                notes:"", orderNumber:r.orderNum, store:r.store, warpClosed:false,
              }
              setOrders(p=>[...p,newOrder])
              await dbUpsert("orders",newOrder as unknown as Record<string,unknown>)
              log.push(`✓ ${r.appCode} · ${t.name} · ${r.qty}m`)
              setImportProgress(Math.round((i+1)/sel.length*100))
              setImportLog([...log])
            }
            setImportStatus("done")
            setImportLog([...log,"",`✅ Done: ${sel.length} orders imported`])
          }

          const nNew  = importRows.filter(r=>r.status==="new").length
          const nDup  = importRows.filter(r=>r.status==="duplicate").length
          const nNoTex= importRows.filter(r=>r.status==="no-textile").length
          const pdfKeysFull=new Set(importRows.map(r=>`${r.appCode}||${r.ordered}||${r.qty}||${r.orderNum}`))
          const pdfKeysBase=new Set(importRows.map(r=>`${r.appCode}||${r.ordered}||${r.qty}`))
          const possiblyDone=(importStatus==="preview"||importStatus==="done")
            ?orders.filter(o=>{
              if(o.warpStatus==="done") return false
              const full=`${o.textileCode}||${o.orderDate||""}||${o.quantity}||${(o.orderNumber||"").trim()}`
              const base=`${o.textileCode}||${o.orderDate||""}||${o.quantity}`
              // An order is "possibly done" only if it doesn't appear in the PDF at all
              // If it has an order number, check full key; otherwise check base key
              if(o.orderNumber) return !pdfKeysFull.has(full)
              return !pdfKeysBase.has(base)
            })
            :[]

          return (
            <div style={S.viewPad} className="dtx-viewpad">
              <div style={S.card}>
                <div style={S.cHead} className="dtx-chead">
                  <span style={S.cTitle}>📥 Import orders from Excel</span>
                  <span style={S.cSub}>عرض حجوزات الفروع للتصنيع (.xls / .xlsx)</span>
                  {importStatus!=="idle"&&<button style={{...S.btnSm,marginLeft:"auto"}} onClick={()=>{setImportStatus("idle");setImportRows([]);setImportLog([]);setImportProgress(0)}}>← Start over</button>}
                </div>
                <div style={S.cBody}>

                  {importStatus==="idle"&&(
                    <div>
                      <div style={{border:"2px dashed #c4c0f0",borderRadius:12,padding:40,textAlign:"center",cursor:"pointer",marginBottom:16}}
                        onClick={()=>document.getElementById("xls-inp")?.click()}>
                        <div style={{fontSize:40,marginBottom:12}}>📊</div>
                        <div style={{fontSize:14,color:"#555",marginBottom:4}}>Click to upload your Excel file</div>
                        <div style={{fontSize:12,color:"#aaa"}}>.xls or .xlsx · عرض حجوزات الفروع للتصنيع</div>
                      </div>
                      <input id="xls-inp" type="file" accept=".xls,.xlsx" style={{display:"none"}} onChange={handleFile}/>
                      {importLog.length>0&&<div style={{background:"#FEEBEB",borderRadius:8,padding:"12px 14px",fontSize:12,color:"#A32D2D",marginBottom:12}}>{importLog.map((l,i)=><div key={i}>{l}</div>)}</div>}
                      <div style={{fontSize:12,color:"#888",padding:"10px 14px",background:"#f9f9f9",borderRadius:8,lineHeight:1.8}}>
                        <strong>Duplicate check:</strong> textile code + order date + quantity + order number
                      </div>
                    </div>
                  )}

                  {importStatus==="parsing"&&(
                    <div style={{textAlign:"center",padding:40}}>
                      <div style={{fontSize:32,marginBottom:12}}>⏳</div>
                      <div style={{fontSize:14,color:"#555"}}>Reading Excel file...</div>
                    </div>
                  )}

                  {(importStatus==="preview"||importStatus==="importing"||importStatus==="done")&&(
                    <div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}} className="dtx-metrics">
                        {[{l:"New",v:nNew,c:"#166534",b:"#EDFBEE"},{l:"Duplicates",v:nDup,c:"#aaa",b:"#f5f5f5"},
                          {l:"No textile",v:nNoTex,c:"#92400E",b:"#FEF3C7"},{l:"Check if done",v:possiblyDone.length,c:"#A32D2D",b:"#FEEBEB"}
                        ].map(({l,v,c,b})=>(
                          <div key={l} style={{background:b,borderRadius:8,padding:"10px 14px"}}>
                            <div style={{fontSize:11,color:c,marginBottom:2}}>{l}</div>
                            <div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {importLog.length>0&&(
                        <div style={{background:"#f5f5f5",borderRadius:8,padding:"10px 14px",marginBottom:12,fontFamily:"monospace",fontSize:12,maxHeight:120,overflowY:"auto"}}>
                          {importLog.map((l,i)=><div key={i} style={{color:l.startsWith("✓")||l.startsWith("✅")?"#166534":"#555"}}>{l}</div>)}
                        </div>
                      )}

                      {importStatus==="importing"&&(
                        <div style={{height:6,background:"#e5e5e5",borderRadius:3,marginBottom:12,overflow:"hidden"}}>
                          <div style={{height:"100%",background:"#7F77DD",borderRadius:3,width:`${importProgress}%`,transition:"width 0.2s"}}/>
                        </div>
                      )}

                      <div style={{maxHeight:340,overflowY:"auto",border:"0.5px solid #e5e5e5",borderRadius:8,marginBottom:12}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed"}}>
                          <thead>
                            <tr style={{background:"#f5f5f5",position:"sticky" as const,top:0}}>
                              <th style={{padding:"7px 8px",width:28}}>
                                <input type="checkbox" onChange={e=>{
                                  if(e.target.checked)setImportSelected(new Set(importRows.map((_,i)=>i).filter(i=>importRows[i].status==="new")))
                                  else setImportSelected(new Set())
                                }}/>
                              </th>
                              {["Status","Code","Name","Qty","Order date","Due","Store","Order no."].map(h=>(
                                <th key={h} style={{padding:"7px 8px",textAlign:"right",color:"#555",fontWeight:500,fontSize:11}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importRows.map((r,i)=>(
                              <tr key={i} style={{background:r.status==="duplicate"?"#fafafa":r.status==="no-textile"?"#FFFBEB":"transparent",borderBottom:"0.5px solid #f5f5f5"}}>
                                <td style={{padding:"6px 8px"}}>
                                  <input type="checkbox" checked={importSelected.has(i)} disabled={r.status!=="new"}
                                    onChange={e=>{const s=new Set(importSelected);e.target.checked?s.add(i):s.delete(i);setImportSelected(s)}}/>
                                </td>
                                <td style={{padding:"6px 8px"}}>
                                  <span style={{background:r.status==="new"?"#EDFBEE":r.status==="duplicate"?"#f5f5f5":"#FEF3C7",
                                    color:r.status==="new"?"#166534":r.status==="duplicate"?"#aaa":"#92400E",
                                    borderRadius:20,padding:"2px 7px",fontSize:11,fontWeight:500}}>
                                    {r.status==="no-textile"?"no textile":r.status}
                                  </span>
                                </td>
                                <td style={{padding:"6px 8px",fontWeight:600,fontSize:11}}>{r.appCode}</td>
                                <td style={{padding:"6px 8px",color:"#555"}} dir="auto">{r.textileName}</td>
                                <td style={{padding:"6px 8px",fontWeight:600,color:"#534AB7"}}>{r.qty}m</td>
                                <td style={{padding:"6px 8px",color:"#aaa",fontSize:11}}>{r.ordered}</td>
                                <td style={{padding:"6px 8px",color:"#aaa",fontSize:11}}>{r.due}</td>
                                <td style={{padding:"6px 8px",fontSize:11}} dir="auto">{r.store}</td>
                                <td style={{padding:"6px 8px",fontSize:10,color:"#bbb"}}>{r.orderNum}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {possiblyDone.length>0&&(
                        <div style={{background:"#FEEBEB",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
                            <span style={{fontWeight:600,color:"#A32D2D",fontSize:13}}>🔴 Check if done — {possiblyDone.length} active orders not in this file</span>
                            <button
                              style={{marginLeft:"auto",padding:"5px 12px",borderRadius:6,border:"0.5px solid #A32D2D",background:"#A32D2D",color:"#fff",fontSize:11,fontWeight:600,cursor:"pointer"}}
                              onClick={async()=>{
                                if(!window.confirm(`Mark all ${possiblyDone.length} orders as done? This cannot be undone.`)) return
                                for(const o of possiblyDone){
                                  const updated={...o,warpStatus:"done" as const,completedAt:new Date().toISOString()}
                                  setOrders(p=>p.map(x=>x.id===o.id?updated:x))
                                  await dbUpsert("orders",updated as unknown as Record<string,unknown>)
                                }
                              }}>
                              ✓ Mark all {possiblyDone.length} as done
                            </button>
                          </div>
                          <div style={{fontSize:12,color:"#A32D2D",marginBottom:8}}>These are active in your app but missing from this Excel. They were likely completed — mark them done to move them to History.</div>
                          <div style={{maxHeight:300,overflowY:"auto",background:"rgba(0,0,0,0.03)",borderRadius:6,padding:"6px 8px"}}>
                            {possiblyDone.map(o=>(
                              <div key={o.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"3px 0",borderBottom:"0.5px solid rgba(163,45,45,0.1)"}}>
                                <span style={{fontSize:11,fontFamily:"monospace"}} dir="auto">
                                  {o.textileCode} · {o.textileName||""} · {o.quantity}m · ordered {o.orderDate||"—"}
                                </span>
                                <button
                                  style={{flexShrink:0,marginLeft:8,padding:"2px 8px",borderRadius:4,border:"0.5px solid #A32D2D",background:"transparent",color:"#A32D2D",fontSize:10,cursor:"pointer"}}
                                  onClick={async()=>{
                                    const updated={...o,warpStatus:"done" as const,completedAt:new Date().toISOString()}
                                    setOrders(p=>p.map(x=>x.id===o.id?updated:x))
                                    await dbUpsert("orders",updated as unknown as Record<string,unknown>)
                                  }}>
                                  ✓ done
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {nNoTex>0&&(
                        <div style={{background:"#FEF3C7",borderRadius:8,padding:"12px 14px",marginBottom:12}}>
                          <div style={{fontWeight:600,color:"#92400E",marginBottom:6,fontSize:13}}>⚠️ {nNoTex} orders skipped — add these textiles first</div>
                          {importRows.filter(r=>r.status==="no-textile").map((r,i)=>(
                            <div key={i} style={{fontSize:11,color:"#92400E",fontFamily:"monospace"}}>Code: {r.appCode} · {r.qty}m</div>
                          ))}
                        </div>
                      )}

                      {importStatus==="preview"&&(
                        <div style={{display:"flex",gap:8}}>
                          <button style={{...S.btnPrimary,opacity:importSelected.size===0?0.5:1}} onClick={doImport} disabled={importSelected.size===0}>
                            ✓ Import {importSelected.size} selected orders
                          </button>
                          <input id="xls-inp2" type="file" accept=".xls,.xlsx" style={{display:"none"}} onChange={handleFile}/>
                          <button style={S.btnSm} onClick={()=>document.getElementById("xls-inp2")?.click()}>Upload different file</button>
                        </div>
                      )}
                      {importStatus==="done"&&(
                        <div>
                          <input id="xls-inp3" type="file" accept=".xls,.xlsx" style={{display:"none"}} onChange={handleFile}/>
                          <button style={{...S.btnSm,background:"#EDFBEE",color:"#166534",border:"0.5px solid #86EFAC"}}
                            onClick={()=>document.getElementById("xls-inp3")?.click()}>📊 Import another file</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── THREADS VIEW ──────────────────────────────── */}
        {view==="threads" && (
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.card}>
              <div style={S.cHead} className="dtx-chead">
                <span style={S.cTitle}>Thread stock</span>
                <span style={S.cSub}>{threads.length} threads</span>
                <button style={{...S.btnSm,marginLeft:"auto"}} onClick={()=>{resetThF();setShowThM(true)}}>+ Add thread</button>
                <button style={{...S.btnSm,background:"#F3F2FD",color:"#534AB7",border:"0.5px solid #c4c0f0"}}
                  onClick={()=>{setLogType("thread");setShowLogM(true)}}>📋 Log movement</button>
              </div>
              <div style={S.cBody}>
                {threads.length===0&&<div style={S.empty}>No threads yet. Add your first thread above.</div>}
                {[...threads].sort((a,b)=>a.code.localeCompare(b.code,"ar")).map(t=>{
                  const isLow = t.minThreshold>0 && t.stockKg<=t.minThreshold
                  const tLogs = stockLog.filter(l=>l.itemId===t.id && l.itemType==="thread")
                  return (
                    <div key={t.id} style={{padding:"14px 0",borderBottom:"0.5px solid #f5f5f5"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{width:36,height:36,borderRadius:8,
                          background:isLow?"#FEEBEB":"#F3F2FD",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:20,flexShrink:0}}>🪡</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:14,fontWeight:600}} dir="auto">{t.code}{t.name?` — ${t.name}`:""}</span>
                            {isLow&&<span style={{background:"#FEEBEB",color:"#A32D2D",borderRadius:4,padding:"1px 7px",fontSize:11,fontWeight:600}}>⚠ LOW</span>}
                          </div>
                          <div style={{fontSize:12,color:"#888",marginTop:2}} dir="auto">{t.color}</div>
                          <div style={{display:"flex",gap:16,marginTop:6}}>
                            <div>
                              <div style={{fontSize:11,color:"#aaa"}}>Current stock</div>
                              <div style={{fontSize:18,fontWeight:600,color:isLow?"#E24B4A":"#1a1a1a"}}>{t.stockKg}kg</div>
                            </div>
                            {t.minThreshold>0&&<div>
                              <div style={{fontSize:11,color:"#aaa"}}>Min threshold</div>
                              <div style={{fontSize:18,fontWeight:500,color:"#888"}}>{t.minThreshold}kg</div>
                            </div>}
                          </div>
                          {/* recent log entries */}
                          {tLogs.length>0&&(
                            <div style={{marginTop:8,borderTop:"0.5px solid #f0f0f0",paddingTop:8}}>
                              <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>Recent movements</div>
                              {tLogs.slice(-5).reverse().map(l=>(
                                <div key={l.id} style={{display:"flex",gap:8,fontSize:12,padding:"3px 0"}}>
                                  <span style={{color:l.direction==="in"?"#639922":"#E24B4A",fontWeight:600,width:28}}>
                                    {l.direction==="in"?"+":"-"}{l.quantityKg}kg
                                  </span>
                                  <span style={{color:"#aaa"}}>{l.date}</span>
                                  <span style={{color:"#555",flex:1}}>{l.note||"—"}</span>
                                  {l.autoDeducted&&<span style={{fontSize:10,color:"#7F77DD"}}>auto</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button style={{...S.btnSm,fontSize:11,padding:"4px 10px",background:"#EDFBEE",color:"#166534",border:"0.5px solid #86EFAC"}}
                            onClick={()=>{setLogType("thread");setLogItemId(t.id);setLogDir("in");setShowLogM(true)}}>+ In</button>
                          <button style={{...S.btnSm,fontSize:11,padding:"4px 10px",background:"#FEEBEB",color:"#A32D2D",border:"0.5px solid #fca5a5"}}
                            onClick={()=>{setLogType("thread");setLogItemId(t.id);setLogDir("out");setShowLogM(true)}}>− Out</button>
                          <button style={S.btnIcon} onClick={()=>openEditThread(t)}>✏️</button>
                          <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>delThread(t.id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TEXTILE STOCK VIEW ────────────────────────── */}
        {view==="textile-stock" && (
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.card}>
              <div style={S.cHead} className="dtx-chead">
                <span style={S.cTitle}>Finished textile stock</span>
                <span style={S.cSub}>{textileStock.length} items</span>
                <button style={{...S.btnSm,marginLeft:"auto"}} onClick={()=>{resetTsF();setShowTSM(true)}}>+ Add stock item</button>
                <button style={{...S.btnSm,background:"#F3F2FD",color:"#534AB7",border:"0.5px solid #c4c0f0"}}
                  onClick={()=>{setLogType("textile-stock");setShowLogM(true)}}>📋 Log movement</button>
              </div>
              <div style={S.cBody}>
                {textileStock.length===0&&<div style={S.empty}>No textile stock yet. Add items above.</div>}
                {[...textileStock].sort((a,b)=>a.textileCode.localeCompare(b.textileCode,"ar")).map(ts=>{
                  const isLow = ts.minThreshold>0 && ts.stockM<=ts.minThreshold
                  const tsLogs = stockLog.filter(l=>l.itemId===ts.id && l.itemType==="textile-stock")
                  return (
                    <div key={ts.id} style={{padding:"14px 0",borderBottom:"0.5px solid #f5f5f5"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                        <div style={{width:36,height:36,borderRadius:8,
                          background:isLow?"#FEEBEB":"#EDFBEE",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:20,flexShrink:0}}>📦</div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:14,fontWeight:600}} dir="auto">
                              {ts.textileCode}{ts.textileName?` — ${ts.textileName}`:""}
                            </span>
                            {isLow&&<span style={{background:"#FEEBEB",color:"#A32D2D",borderRadius:4,padding:"1px 7px",fontSize:11,fontWeight:600}}>⚠ LOW</span>}
                          </div>
                          <div style={{display:"flex",gap:16,marginTop:6}}>
                            <div>
                              <div style={{fontSize:11,color:"#aaa"}}>In stock</div>
                              <div style={{fontSize:18,fontWeight:600,color:isLow?"#E24B4A":"#1a1a1a"}}>{ts.stockM}m</div>
                            </div>
                            {ts.minThreshold>0&&<div>
                              <div style={{fontSize:11,color:"#aaa"}}>Min threshold</div>
                              <div style={{fontSize:18,fontWeight:500,color:"#888"}}>{ts.minThreshold}m</div>
                            </div>}
                          </div>
                          {tsLogs.length>0&&(
                            <div style={{marginTop:8,borderTop:"0.5px solid #f0f0f0",paddingTop:8}}>
                              <div style={{fontSize:11,color:"#aaa",marginBottom:4}}>Recent movements</div>
                              {tsLogs.slice(-5).reverse().map(l=>(
                                <div key={l.id} style={{display:"flex",gap:8,fontSize:12,padding:"3px 0"}}>
                                  <span style={{color:l.direction==="in"?"#639922":"#E24B4A",fontWeight:600,width:36}}>
                                    {l.direction==="in"?"+":"-"}{l.quantityM}m
                                  </span>
                                  <span style={{color:"#aaa"}}>{l.date}</span>
                                  <span style={{color:"#555",flex:1}}>{l.note||"—"}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button style={{...S.btnSm,fontSize:11,padding:"4px 10px",background:"#EDFBEE",color:"#166534",border:"0.5px solid #86EFAC"}}
                            onClick={()=>{setLogType("textile-stock");setLogItemId(ts.id);setLogDir("in");setShowLogM(true)}}>+ In</button>
                          <button style={{...S.btnSm,fontSize:11,padding:"4px 10px",background:"#FEEBEB",color:"#A32D2D",border:"0.5px solid #fca5a5"}}
                            onClick={()=>{setLogType("textile-stock");setLogItemId(ts.id);setLogDir("out");setShowLogM(true)}}>− Out</button>
                          <button style={S.btnIcon} onClick={()=>openEditTextileStock(ts)}>✏️</button>
                          <button style={{...S.btnIcon,color:"#E24B4A"}} onClick={()=>delTextileStock(ts.id)}>🗑</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TEXTILES VIEW ─────────────────────────────── */}
        {view==="textiles" && (
          <div style={S.viewPad} className="dtx-viewpad">
            <div style={S.card}>
              <div style={S.cHead} className="dtx-chead">
                <span style={S.cTitle}>Textile database</span>
                <span style={S.cSub}>{filteredTextiles.length} / {textiles.length}</span>
                {/* search */}
                <div style={{position:"relative",display:"flex",alignItems:"center",margin:"0 8px"}}>
                  <span style={{position:"absolute",left:9,fontSize:12,pointerEvents:"none",color:"#aaa"}}>🔍</span>
                  <input
                    style={{...S.search,width:160,marginBottom:0,paddingLeft:28,fontSize:12}}
                    placeholder="Search textiles…"
                    value={textileSearch}
                    onChange={e=>setTextileSearch(e.target.value)}
                    dir="auto"
                  />
                </div>
                {/* sort */}
                <div style={{display:"flex",gap:6}}>
                  <button
                    onClick={()=>setTextileSort("name")}
                    style={{...S.btnSm,fontSize:11,padding:"3px 10px",
                      background:textileSort==="name"?"#7F77DD":"transparent",
                      color:textileSort==="name"?"#fff":"#888",
                      border:textileSort==="name"?"none":"0.5px solid #d5d5d5"}}>
                    A→Z name
                  </button>
                  <button
                    onClick={()=>setTextileSort("fabricType")}
                    style={{...S.btnSm,fontSize:11,padding:"3px 10px",
                      background:textileSort==="fabricType"?"#7F77DD":"transparent",
                      color:textileSort==="fabricType"?"#fff":"#888",
                      border:textileSort==="fabricType"?"none":"0.5px solid #d5d5d5"}}>
                    A→Z fabric
                  </button>
                </div>
                <button style={S.btnSm} onClick={()=>{resetTF();setShowTM(true)}}>+ Add textile</button>
              </div>
              <div style={S.cBody}>
                {textiles.length===0 && (
                  <div style={{...S.empty,textAlign:"center",padding:"32px 0"}}>
                    <div style={{fontSize:32,marginBottom:8}}>🧵</div>
                    <div style={{fontWeight:500,marginBottom:4}}>No textiles yet</div>
                    <div style={{fontSize:12,color:"#bbb",marginBottom:16}}>
                      Save your textiles here once — then pick them when adding orders instead of typing everything each time.
                    </div>
                    <button style={S.btnPrimary} onClick={()=>{resetTF();setShowTM(true)}}>Add first textile</button>
                  </div>
                )}
                {textiles.length>0 && filteredTextiles.length===0 && (
                  <div style={S.empty}>No textiles match "{textileSearch}"</div>
                )}
                {filteredTextiles.map(t=>(
                  <div key={t.id} style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"0.5px solid #f5f5f5"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:"#EEEDFE",display:"flex",
                      alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🧵</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:500,direction:"auto" as CSSProperties["direction"]}}>{t.code}{t.name ? ` — ${t.name}` : ""}</div>
                      <div style={{fontSize:12,color:"#888",marginTop:2,direction:"auto" as CSSProperties["direction"]}}>{t.fabricType} · {t.color}</div>
                      {(t.pattern||t.weave)&&(
                        <div style={{fontSize:11,color:"#aaa",marginTop:2}} dir="auto">
                          {[t.pattern,t.weave].filter(Boolean).join(" · ")}
                        </div>
                      )}
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
        <Modal title={`Force switch: ${forceSwitchOrder.textileCode}`} onClose={()=>setForceSwitchOrder(null)}>
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

      {/* ── THREAD MODAL ──────────────────────────────── */}
      {showThM&&(
        <Modal title="New thread" onClose={()=>{setShowThM(false);resetThF()}}>
          <Field label="Thread code"><input style={S.input} value={thCode} onChange={e=>setThCode(e.target.value)} placeholder="e.g. THR-001" dir="auto"/></Field>
          <Field label="Thread name"><input style={S.input} value={thName} onChange={e=>setThName(e.target.value)} placeholder="e.g. Cotton 60/2" dir="auto"/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Color"><input style={S.input} value={thColor} onChange={e=>setThColor(e.target.value)} placeholder="e.g. White" dir="auto"/></Field>
            <Field label="Current stock (kg)"><input style={S.input} type="number" value={thStock} onChange={e=>setThStock(e.target.value)} placeholder="0"/></Field>
            <Field label="Min threshold (kg)"><input style={S.input} type="number" value={thMin} onChange={e=>setThMin(e.target.value)} placeholder="0"/></Field>
          </div>
          <Field label="Notes (optional)"><input style={S.input} value={thNotes} onChange={e=>setThNotes(e.target.value)} placeholder="Supplier, specs…"/></Field>
          <button style={S.btnPrimary} onClick={saveThread}>Save thread</button>
        </Modal>
      )}
      {editTh&&(
        <Modal title="Edit thread" onClose={()=>{setEditTh(null);resetThF()}}>
          <Field label="Thread code"><input style={S.input} value={thCode} onChange={e=>setThCode(e.target.value)} dir="auto"/></Field>
          <Field label="Thread name"><input style={S.input} value={thName} onChange={e=>setThName(e.target.value)} dir="auto"/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Color"><input style={S.input} value={thColor} onChange={e=>setThColor(e.target.value)} dir="auto"/></Field>
            <Field label="Current stock (kg)"><input style={S.input} type="number" value={thStock} onChange={e=>setThStock(e.target.value)}/></Field>
            <Field label="Min threshold (kg)"><input style={S.input} type="number" value={thMin} onChange={e=>setThMin(e.target.value)}/></Field>
          </div>
          <Field label="Notes"><input style={S.input} value={thNotes} onChange={e=>setThNotes(e.target.value)}/></Field>
          <button style={S.btnPrimary} onClick={saveThread}>Save changes</button>
        </Modal>
      )}

      {/* ── TEXTILE STOCK MODAL ───────────────────────── */}
      {showTSM&&(
        <Modal title="New stock item" onClose={()=>{setShowTSM(false);resetTsF()}}>
          <Field label="Textile">
            <TextileStockPicker
              textiles={textiles}
              selectedCode={tsCode}
              selectedName={tsName}
              onPick={(code,name)=>{ setTsCode(code); setTsName(name) }}
              onClear={()=>{ setTsCode(""); setTsName("") }}
            />
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:4}}>
            <Field label="Current stock (m)">
              <input style={S.input} type="number" value={tsStock} onChange={e=>setTsStock(e.target.value)} placeholder="0"/>
            </Field>
            <Field label="Min threshold (m)">
              <input style={S.input} type="number" value={tsMin} onChange={e=>setTsMin(e.target.value)} placeholder="0"/>
            </Field>
          </div>
          <Field label="Notes (optional)">
            <input style={S.input} value={tsNotes} onChange={e=>setTsNotes(e.target.value)} placeholder="e.g. Warehouse shelf B3"/>
          </Field>
          <button
            style={{...S.btnPrimary, opacity:(!tsCode.trim()||!tsStock)?0.5:1}}
            onClick={saveTextileStockItem}>
            Save item
          </button>
        </Modal>
      )}
      {editTS&&(
        <Modal title="Edit stock item" onClose={()=>{setEditTS(null);resetTsF()}}>
          <Field label="Textile">
            <TextileStockPicker
              textiles={textiles}
              selectedCode={tsCode}
              selectedName={tsName}
              onPick={(code,name)=>{ setTsCode(code); setTsName(name) }}
              onClear={()=>{ setTsCode(""); setTsName("") }}
            />
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:4}}>
            <Field label="Current stock (m)">
              <input style={S.input} type="number" value={tsStock} onChange={e=>setTsStock(e.target.value)}/>
            </Field>
            <Field label="Min threshold (m)">
              <input style={S.input} type="number" value={tsMin} onChange={e=>setTsMin(e.target.value)}/>
            </Field>
          </div>
          <Field label="Notes">
            <input style={S.input} value={tsNotes} onChange={e=>setTsNotes(e.target.value)}/>
          </Field>
          <button style={S.btnPrimary} onClick={saveTextileStockItem}>Save changes</button>
        </Modal>
      )}

      {/* ── MANUAL STOCK LOG MODAL ────────────────────── */}
      {showLogM&&(
        <Modal title="Log stock movement" onClose={()=>{setShowLogM(false);setLogItemId(null);setLogQty("");setLogNote("")}}>
          <Field label="Type">
            <div style={{display:"flex",gap:8}}>
              {(["thread","textile-stock"] as const).map(t=>(
                <button key={t} onClick={()=>setLogType(t)}
                  style={{...S.btnSm,flex:1,background:logType===t?"#7F77DD":"transparent",
                    color:logType===t?"#fff":"#888",border:logType===t?"none":"0.5px solid #d5d5d5"}}>
                  {t==="thread"?"🪡 Thread":"📦 Textile"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={logType==="thread"?"Thread":"Textile stock item"}>
            <select style={S.input} value={logItemId??""} onChange={e=>setLogItemId(Number(e.target.value)||null)}>
              <option value="">— select —</option>
              {logType==="thread"
                ? threads.map(t=><option key={t.id} value={t.id}>{t.code}{t.name?" — "+t.name:""}</option>)
                : textileStock.map(t=><option key={t.id} value={t.id}>{t.textileCode}{t.textileName?" — "+t.textileName:""}</option>)
              }
            </select>
          </Field>
          <Field label="Direction">
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setLogDir("in")} style={{...S.btnSm,flex:1,
                background:logDir==="in"?"#639922":"transparent",color:logDir==="in"?"#fff":"#888",
                border:logDir==="in"?"none":"0.5px solid #d5d5d5"}}>+ In (received)</button>
              <button onClick={()=>setLogDir("out")} style={{...S.btnSm,flex:1,
                background:logDir==="out"?"#E24B4A":"transparent",color:logDir==="out"?"#fff":"#888",
                border:logDir==="out"?"none":"0.5px solid #d5d5d5"}}>− Out (used/delivered)</button>
            </div>
          </Field>
          <Field label={logType==="thread"?"Quantity (kg)":"Quantity (m)"}>
            <input style={S.input} type="number" value={logQty} onChange={e=>setLogQty(e.target.value)} placeholder="0"/>
          </Field>
          <Field label="Note (optional)">
            <input style={S.input} value={logNote} onChange={e=>setLogNote(e.target.value)} placeholder="e.g. Received from supplier / Delivered to client"/>
          </Field>
          <button style={S.btnPrimary} onClick={submitManualLog}>Log movement</button>
        </Modal>
      )}

      {/* ── DELETE ORDER CONFIRMATION ─────────────────── */}
      {confirmDeleteOrder&&(
        <Modal title="Delete order?" onClose={()=>setConfirmDeleteOrder(null)}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:13,color:"#555",marginBottom:12,lineHeight:1.6}}>
              Are you sure you want to permanently delete this order?
            </div>
            <div style={{background:"#fafafa",border:"0.5px solid #e5e5e5",borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}} dir="auto">
                {confirmDeleteOrder.textileCode}
                {confirmDeleteOrder.textileName ? ` — ${confirmDeleteOrder.textileName}` : ""}
              </div>
              <div style={{fontSize:12,color:"#888",marginBottom:2}} dir="auto">
                {confirmDeleteOrder.fabricType} · {confirmDeleteOrder.color}
              </div>
              <div style={{fontSize:12,color:"#888",marginBottom:2}}>
                {confirmDeleteOrder.quantity}m · {confirmDeleteOrder.priority} priority
              </div>
              {confirmDeleteOrder.deadline&&(
                <div style={{fontSize:12,color:"#888",marginBottom:2}}>
                  Due: {confirmDeleteOrder.deadline}
                </div>
              )}
              {confirmDeleteOrder.orderNumber&&(
                <div style={{fontSize:12,color:"#7F77DD"}}>#{confirmDeleteOrder.orderNumber}</div>
              )}
              {confirmDeleteOrder.store&&(
                <div style={{fontSize:12,color:"#888"}} dir="auto">🏪 {confirmDeleteOrder.store}</div>
              )}
            </div>
            <div style={{marginTop:10,fontSize:12,color:"#E24B4A",fontWeight:500}}>
              ⚠️ This action cannot be undone.
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button
              style={{...S.btnPrimary,background:"#E24B4A",flex:1}}
              onClick={async ()=>{
                await delOrder(confirmDeleteOrder.id)
                setConfirmDeleteOrder(null)
              }}>
              Yes, delete
            </button>
            <button
              style={{...S.btnSm,flex:1,padding:"10px",fontSize:13}}
              onClick={()=>setConfirmDeleteOrder(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── WARP DONE DEDUCTION MODAL ─────────────────── */}
      {warpDoneGroup&&(
        <Modal title="🔒 Warp done — log thread usage" onClose={()=>setWarpDoneGroup(null)}>
          <div style={{fontSize:13,color:"#555",marginBottom:16,lineHeight:1.6}}>
            Warp <strong>{warpDoneGroup.label}</strong> on <strong>{warpDoneGroup.machine}</strong> is being sealed.<br/>
            Optionally log how much thread was consumed for this warp.
          </div>
          <Field label="Thread used (optional)">
            <select style={S.input} value={warpDoneThreadId??""} onChange={e=>setWarpDoneThreadId(Number(e.target.value)||null)}>
              <option value="">— skip thread logging —</option>
              {threads.map(t=>(
                <option key={t.id} value={t.id}>{t.code}{t.name?" — "+t.name:""} ({t.stockKg}kg in stock)</option>
              ))}
            </select>
          </Field>
          {warpDoneThreadId&&(
            <Field label="Amount consumed (kg)">
              <input style={S.input} type="number" value={warpDoneKg} onChange={e=>setWarpDoneKg(e.target.value)} placeholder="e.g. 12.5"/>
            </Field>
          )}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button style={S.btnPrimary} onClick={confirmWarpDone}>
              {warpDoneThreadId&&warpDoneKg?"✓ Seal warp & deduct thread":"✓ Seal warp"}
            </button>
            <button style={S.btnSm} onClick={()=>setWarpDoneGroup(null)}>Cancel</button>
          </div>
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
  search:     {padding:"6px 10px 6px 28px",border:"0.5px solid #d5d5d5",borderRadius:8,fontSize:13,background:"#f7f7f7",width:180,outline:"none",minWidth:0,flex:"0 1 180px"},
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
