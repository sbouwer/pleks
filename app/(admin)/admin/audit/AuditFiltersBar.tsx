/**
 * app/(admin)/admin/audit/AuditFiltersBar.tsx — Filter rail for the audit log viewer
 *
 * Auth:   Rendered inside admin layout (auth-gated)
 * Notes:  Client component — manages URL search params for filter state.
 *         Saved presets stored in localStorage (D-ADMIN-14).
 *         Export button queues an async job; does NOT block the UI.
 */
"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useEffect, useTransition } from "react"
import { addCalendarDays, saDateISO, saTodayISO } from "@/lib/dates"

interface Props {
  readonly tableNames: string[]
}

interface Preset {
  name: string
  start: string
  end: string
  action: string[]
  table: string[]
  severity: string[]
  search: string
}

const DATE_PRESETS = [
  { label: "Today", days: 0 },
  { label: "7d",    days: 7 },
  { label: "30d",   days: 30 },
  { label: "90d",   days: 90 },
]

const ACTIONS   = ["INSERT", "UPDATE", "DELETE"]
const SEVERITIES = ["high", "medium", "low"]

const SEVERITY_COLORS: Record<string, string> = {
  high:   "var(--critical)",
  medium: "var(--caution)",
  low:    "var(--slate)",
}

const DEFAULT_PRESETS: Preset[] = [
  { name: "Last 7 days",               start: "",          end: "", action: [], table: [], severity: [],       search: "" },
  { name: "High severity — 30d",        start: daysAgo(30), end: "", action: [], table: [], severity: ["high"], search: "" },
  { name: "Trust-account actions — 90d",start: daysAgo(90), end: "", action: [], table: ["trust_transactions", "deposit_refunds"], severity: [], search: "" },
]

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]
}

const EXPORT_LABELS: Record<"idle" | "queuing" | "queued", string> = {
  idle:    "Export CSV (async)",
  queuing: "Queuing…",
  queued:  "✓ Queued — check email",
}

const PRESET_KEY = "pleks-admin-audit-presets"

function daysAgo(n: number): string {
  // setDate/getDate are LOCAL-time accessors; slicing the result in UTC mixed coordinates.
  return addCalendarDays(saTodayISO(), -n)
}

function isoDateStr(d: Date) {
  return saDateISO(d)
}

function presetStart(days: number): string {
  if (days === 0) return isoDateStr(new Date())
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoDateStr(d)
}

export function AuditFiltersBar({ tableNames }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const sp       = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [exportStatus, setExportStatus] = useState<"idle" | "queuing" | "queued">("idle")

  // Saved presets (localStorage)
  const [presets, setPresets]       = useState<Preset[]>(DEFAULT_PRESETS)
  const [presetName, setPresetName] = useState("")
  const [showSaveRow, setShowSaveRow] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRESET_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Preset[]
        if (Array.isArray(parsed)) setPresets([...DEFAULT_PRESETS, ...parsed])
      }
    } catch { /* ignore */ }
  }, [])

  // Current URL values
  const currentStart    = sp.get("start")    ?? ""
  const currentEnd      = sp.get("end")      ?? ""
  const currentAction   = sp.getAll("action")
  const currentTable    = sp.getAll("table")
  const currentSeverity = sp.getAll("severity")
  const currentSearch   = sp.get("search")   ?? ""

  // Local form state
  const [start,    setStart]    = useState(currentStart)
  const [end,      setEnd]      = useState(currentEnd)
  const [action,   setAction]   = useState<string[]>(currentAction)
  const [table,    setTable]    = useState<string[]>(currentTable)
  const [severity, setSeverity] = useState<string[]>(currentSeverity)
  const [search,   setSearch]   = useState(currentSearch)

  function buildParams(overrides?: Partial<{ start: string; end: string; action: string[]; table: string[]; severity: string[]; search: string }>) {
    const s   = overrides?.start    ?? start
    const e   = overrides?.end      ?? end
    const a   = overrides?.action   ?? action
    const t   = overrides?.table    ?? table
    const sev = overrides?.severity ?? severity
    const q   = overrides?.search   ?? search
    const params = new URLSearchParams()
    if (s)   params.set("start", s)
    if (e)   params.set("end", e)
    a.forEach((x) => params.append("action", x))
    t.forEach((x) => params.append("table", x))
    sev.forEach((x) => params.append("severity", x))
    if (q) params.set("search", q)
    return params
  }

  function apply(overrides?: Parameters<typeof buildParams>[0]) {
    startTransition(() => {
      router.replace(`${pathname}?${buildParams(overrides).toString()}`)
    })
  }

  function reset() {
    setStart(""); setEnd(""); setAction([]); setTable([]); setSeverity([]); setSearch("")
    startTransition(() => { router.replace(pathname) })
  }

  function applyPreset(p: Preset) {
    setStart(p.start); setEnd(p.end); setAction(p.action); setTable(p.table); setSeverity(p.severity); setSearch(p.search)
    apply({ start: p.start, end: p.end, action: p.action, table: p.table, severity: p.severity, search: p.search })
  }

  function savePreset() {
    const name = presetName.trim()
    if (!name) return
    const newPreset: Preset = { name, start, end, action, table, severity, search }
    const userPresets = presets.filter((p) => !DEFAULT_PRESETS.some((d) => d.name === p.name))
    const updated = [...userPresets, newPreset]
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
    setPresets([...DEFAULT_PRESETS, ...updated])
    setPresetName("")
    setShowSaveRow(false)
  }

  function deletePreset(name: string) {
    const userPresets = presets.filter((p) => !DEFAULT_PRESETS.some((d) => d.name === p.name) && p.name !== name)
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(userPresets)) } catch { /* ignore */ }
    setPresets([...DEFAULT_PRESETS, ...userPresets])
  }

  async function handleExport() {
    setExportStatus("queuing")
    const body = { start: currentStart || undefined, end: currentEnd || undefined, action: currentAction, table: currentTable }
    await fetch("/api/admin/audit/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setExportStatus("queued")
  }

  const RAIL: React.CSSProperties = {
    width: 280,
    flexShrink: 0,
    borderRight: "1px solid var(--rule)",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
    overflowY: "auto",
    background: "var(--paper-raised)",
  }

  const SECTION_TITLE: React.CSSProperties = {
    fontFamily: "var(--mono)",
    fontSize: 9.5,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "var(--ink-mute)",
    marginBottom: 8,
  }

  const INPUT: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    fontSize: 12,
    border: "1px solid var(--rule-strong)",
    borderRadius: "var(--r-sm)",
    background: "var(--paper)",
    color: "var(--ink)",
    fontFamily: "var(--mono)",
    boxSizing: "border-box",
  }

  const CHECKBOX_ROW: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12.5,
    color: "var(--ink-soft)",
    cursor: "pointer",
    padding: "2px 0",
  }

  return (
    <aside style={RAIL}>
      {/* Saved presets */}
      <div>
        <p style={SECTION_TITLE}>Presets</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {presets.map((p) => {
            const isDefault = DEFAULT_PRESETS.some((d) => d.name === p.name)
            return (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => applyPreset(p)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "4px 8px",
                    fontSize: 11.5,
                    fontFamily: "var(--mono)",
                    border: "1px solid var(--rule)",
                    borderRadius: "var(--r-sm)",
                    background: "var(--paper)",
                    color: "var(--ink-soft)",
                    cursor: "pointer",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.name}
                </button>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => deletePreset(p.name)}
                    title="Delete preset"
                    style={{ padding: "2px 6px", fontSize: 10, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {showSaveRow ? (
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && savePreset()}
              placeholder="Preset name…"
              style={{ ...INPUT, flex: 1 }}
              autoFocus
            />
            <button type="button" onClick={savePreset} style={{ padding: "4px 8px", fontSize: 11, border: "1px solid var(--rule-strong)", borderRadius: "var(--r-sm)", background: "var(--ink)", color: "var(--paper)", cursor: "pointer" }}>Save</button>
            <button type="button" onClick={() => setShowSaveRow(false)} style={{ padding: "4px 6px", fontSize: 11, border: "none", background: "transparent", color: "var(--ink-faint)", cursor: "pointer" }}>✕</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveRow(true)}
            style={{ marginTop: 6, fontSize: 11, fontFamily: "var(--mono)", border: "none", background: "transparent", color: "var(--ink-mute)", cursor: "pointer", padding: 0, textDecoration: "underline" }}
          >
            + Save current as preset
          </button>
        )}
      </div>

      {/* Date presets */}
      <div>
        <p style={SECTION_TITLE}>Date range</p>
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => { setStart(presetStart(p.days)); setEnd("") }}
              style={{
                padding: "3px 8px",
                fontSize: 11,
                fontFamily: "var(--mono)",
                border: "1px solid var(--rule-strong)",
                borderRadius: "var(--r-sm)",
                background: "var(--paper)",
                color: "var(--ink-soft)",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={INPUT} />
          <input type="date" value={end}   onChange={(e) => setEnd(e.target.value)}   style={INPUT} />
        </div>
      </div>

      {/* Severity */}
      <div>
        <p style={SECTION_TITLE}>Severity</p>
        {SEVERITIES.map((s) => (
          <label key={s} style={CHECKBOX_ROW}>
            <input
              type="checkbox"
              checked={severity.includes(s)}
              onChange={() => setSeverity(toggle(severity, s))}
              style={{ accentColor: "var(--amber)" }}
            />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: SEVERITY_COLORS[s], fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s}</span>
          </label>
        ))}
      </div>

      {/* Action */}
      <div>
        <p style={SECTION_TITLE}>Action</p>
        {ACTIONS.map((a) => (
          <label key={a} style={CHECKBOX_ROW}>
            <input
              type="checkbox"
              checked={action.includes(a)}
              onChange={() => setAction(toggle(action, a))}
              style={{ accentColor: "var(--amber)" }}
            />
            <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{a}</span>
          </label>
        ))}
      </div>

      {/* Table */}
      {tableNames.length > 0 && (
        <div>
          <p style={SECTION_TITLE}>Table</p>
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {tableNames.map((t) => (
              <label key={t} style={CHECKBOX_ROW}>
                <input
                  type="checkbox"
                  checked={table.includes(t)}
                  onChange={() => setTable(toggle(table, t))}
                  style={{ accentColor: "var(--amber)" }}
                />
                <span style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{t}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div>
        <p style={SECTION_TITLE}>Search</p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Search new values…"
          style={INPUT}
        />
      </div>

      {/* Apply / Reset */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => apply()}
          disabled={isPending}
          style={{
            flex: 1,
            padding: "7px 0",
            fontSize: 12.5,
            fontWeight: 600,
            background: "var(--ink)",
            color: "var(--paper)",
            border: "none",
            borderRadius: "var(--r-sm)",
            cursor: isPending ? "wait" : "pointer",
          }}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: "7px 12px",
            fontSize: 12.5,
            background: "transparent",
            color: "var(--ink-soft)",
            border: "1px solid var(--rule-strong)",
            borderRadius: "var(--r-sm)",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {/* Export */}
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
        <p style={SECTION_TITLE}>Export</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exportStatus !== "idle"}
          style={{
            width: "100%",
            padding: "7px 0",
            fontSize: 12,
            background: "transparent",
            color: exportStatus === "queued" ? "var(--positive)" : "var(--ink-soft)",
            border: "1px solid var(--rule-strong)",
            borderRadius: "var(--r-sm)",
            cursor: exportStatus === "idle" ? "pointer" : "default",
          }}
        >
          {EXPORT_LABELS[exportStatus]}
        </button>
        <p style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 6, lineHeight: 1.4 }}>
          Applies current date &amp; action filters. Email link when ready.
        </p>
      </div>
    </aside>
  )
}
