/**
 * app/(admin)/admin/audit/AuditFiltersBar.tsx — Filter rail for the audit log viewer
 *
 * Auth:   Rendered inside admin layout (auth-gated)
 * Notes:  Client component — manages URL search params for filter state.
 *         Export button queues an async job; does NOT block the UI.
 */
"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState, useTransition } from "react"

interface Props {
  readonly tableNames: string[]
}

const DATE_PRESETS = [
  { label: "Today",  days: 0 },
  { label: "7d",     days: 7 },
  { label: "30d",    days: 30 },
  { label: "90d",    days: 90 },
]

const ACTIONS = ["INSERT", "UPDATE", "DELETE"]

function isoDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

const EXPORT_LABELS: Record<"idle" | "queuing" | "queued", string> = {
  idle:    "Export CSV (async)",
  queuing: "Queuing…",
  queued:  "✓ Export queued — check email",
}

function presetStart(days: number): string {
  if (days === 0) return isoDateStr(new Date())
  const d = new Date()
  d.setDate(d.getDate() - days)
  return isoDateStr(d)
}

export function AuditFiltersBar({ tableNames }: Props) {
  const router    = useRouter()
  const pathname  = usePathname()
  const sp        = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [exportStatus, setExportStatus] = useState<"idle" | "queuing" | "queued">("idle")

  // Read current values from URL
  const currentStart  = sp.get("start") ?? ""
  const currentEnd    = sp.get("end") ?? ""
  const currentAction = sp.getAll("action")
  const currentTable  = sp.getAll("table")
  const currentSearch = sp.get("search") ?? ""

  // Local state for the form
  const [start,  setStart]  = useState(currentStart)
  const [end,    setEnd]    = useState(currentEnd)
  const [action, setAction] = useState<string[]>(currentAction)
  const [table,  setTable]  = useState<string[]>(currentTable)
  const [search, setSearch] = useState(currentSearch)

  function apply() {
    const params = new URLSearchParams()
    if (start)  params.set("start", start)
    if (end)    params.set("end", end)
    action.forEach((a) => params.append("action", a))
    table.forEach((t)  => params.append("table", t))
    if (search) params.set("search", search)
    // reset cursor on new filter
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`)
    })
  }

  function reset() {
    setStart(""); setEnd(""); setAction([]); setTable([]); setSearch("")
    startTransition(() => { router.replace(pathname) })
  }

  function toggleAction(a: string) {
    setAction((prev) => prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a])
  }

  function toggleTable(t: string) {
    setTable((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])
  }

  async function handleExport() {
    setExportStatus("queuing")
    const body = { start: currentStart || undefined, end: currentEnd || undefined, action: currentAction, table: currentTable }
    await fetch("/api/admin/audit/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setExportStatus("queued")
  }

  const RAIL: React.CSSProperties = {
    width: 264,
    flexShrink: 0,
    borderRight: "1px solid var(--rule)",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
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
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={INPUT} placeholder="Start" />
          <input type="date" value={end}   onChange={(e) => setEnd(e.target.value)}   style={INPUT} placeholder="End" />
        </div>
      </div>

      {/* Action checkboxes */}
      <div>
        <p style={SECTION_TITLE}>Action</p>
        {ACTIONS.map((a) => (
          <label key={a} style={CHECKBOX_ROW}>
            <input
              type="checkbox"
              checked={action.includes(a)}
              onChange={() => toggleAction(a)}
              style={{ accentColor: "var(--amber)" }}
            />
            {a}
          </label>
        ))}
      </div>

      {/* Table filter */}
      {tableNames.length > 0 && (
        <div>
          <p style={SECTION_TITLE}>Table</p>
          <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
            {tableNames.map((t) => (
              <label key={t} style={CHECKBOX_ROW}>
                <input
                  type="checkbox"
                  checked={table.includes(t)}
                  onChange={() => toggleTable(t)}
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
          onClick={apply}
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
          Export applies current date &amp; action filters. You&apos;ll receive an email link when ready.
        </p>
      </div>
    </aside>
  )
}
