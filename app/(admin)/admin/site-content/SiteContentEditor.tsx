"use client"

import { useState, useTransition } from "react"
import { saveContentRow } from "./actions"

interface Row {
  key: string
  label: string
  section: string
  sort_order: number
  value: string
}

export function SiteContentEditor({ rows }: { rows: Row[] }) {
  return (
    <div className="space-y-3">
      {rows.map(row => <ContentRow key={row.key} row={row} />)}
    </div>
  )
}

function ContentRow({ row }: { row: Row }) {
  const [value, setValue] = useState(row.value)
  const [saved, setSaved]  = useState(false)
  const [err, setErr]      = useState<string | null>(null)
  const [pending, start]   = useTransition()

  const isLong = row.value.length > 80

  function handleSave() {
    setErr(null)
    setSaved(false)
    start(async () => {
      const res = await saveContentRow(row.key, value)
      if (res.error) setErr(res.error)
      else setSaved(true)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {row.label}
        <span className="ml-2 text-xs text-muted-foreground font-mono">{row.key}</span>
      </label>
      {isLong ? (
        <textarea
          rows={4}
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false) }}
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setSaved(false) }}
          className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || value === row.value}
          className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-40 transition-opacity"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-xs text-success">Saved</span>}
        {err   && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </div>
  )
}
