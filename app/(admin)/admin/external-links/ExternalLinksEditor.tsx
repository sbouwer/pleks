"use client"

/**
 * app/(admin)/admin/external-links/ExternalLinksEditor.tsx — Inline URL editor for external_links rows
 *
 * Route:  /admin/external-links
 * Auth:   rendered only inside requireAdminAuth() page
 * Data:   external_links rows passed from server page; saves via saveExternalLink action
 * Notes:  shows health dot (green/red/gray) + last_checked_at so admin knows which URLs are broken
 */

import { useState, useTransition } from "react"
import { saveExternalLink } from "./actions"

interface LinkRow {
  key:            string
  url:            string
  label:          string
  category:       string
  is_healthy:     boolean | null
  last_status:    number | null
  last_checked_at: string | null
}

export function ExternalLinksEditor({ rows }: Readonly<{ rows: LinkRow[] }>) {
  return (
    <div className="space-y-3">
      {rows.map(row => <LinkRow key={row.key} row={row} />)}
    </div>
  )
}

function LinkRow({ row }: Readonly<{ row: LinkRow }>) {
  const [url, setUrl]     = useState(row.url)
  const [saved, setSaved] = useState(false)
  const [err, setErr]     = useState<string | null>(null)
  const [pending, start]  = useTransition()

  function handleSave() {
    setErr(null)
    setSaved(false)
    start(async () => {
      const res = await saveExternalLink(row.key, url)
      if (res.error) setErr(res.error)
      else setSaved(true)
    })
  }

  let healthColor = "var(--muted-foreground)"
  if (row.is_healthy === true)       healthColor = "var(--success)"
  else if (row.is_healthy === false) healthColor = "var(--destructive)"

  const checkedAt = row.last_checked_at
    ? new Date(row.last_checked_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })
    : "never"

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label className="block text-sm font-medium text-foreground">
            {row.label}
            <span className="ml-2 text-xs text-muted-foreground font-mono">{row.key}</span>
          </label>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: healthColor,
              flexShrink: 0,
            }}
          />
          {row.last_status != null && (
            <span className="font-mono">{row.last_status}</span>
          )}
          <span>checked {checkedAt}</span>
        </div>
      </div>

      <input
        type="url"
        value={url}
        onChange={e => { setUrl(e.target.value); setSaved(false) }}
        className="w-full text-sm bg-background border border-input rounded-md px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || url === row.url}
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
