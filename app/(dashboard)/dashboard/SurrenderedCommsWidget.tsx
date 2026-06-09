"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsWidget.tsx — surrendered mandatory comms list (grouped)
 *
 * Auth:   agent session (rendered inside the dashboard alerts bell modal, data from page.tsx)
 * Data:   mandatory_comm_retries (surrendered, undispatched) via props; message body fetched on demand
 *         from communication_log via getSurrenderedCommContent.
 * Notes:  Identical notices (same template + recipient) collapse into one card with a ×count badge. "View"
 *         loads the original failed message so the agent can read it before printing; "Mark dispatched"
 *         clears the whole group (markManuallyDispatchedBulk). BUILD_63 Phase 8.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { markManuallyDispatchedBulk, getSurrenderedCommContent } from "@/lib/actions/surrendered-comms"

export interface SurrenderedCommRow {
  id: string
  template_key: string
  surrender_reason: string | null
  surrendered_at: string
  recipient_email: string | null
  recipient_name: string | null
  attempt_count: number
}

interface CommGroup {
  key: string
  templateLabel: string
  recipient: string
  ids: string[]
  latest: string
  firstId: string
}

/** "lease.expiry_reminder" → "Lease expiry reminder" */
function humanizeTemplate(key: string): string {
  const s = key.replace(/[._]/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key
}

/** Strip HTML to readable plain text for the in-modal preview (linear scan — no backtracking regex). */
function toPlainText(html: string | null): string {
  if (!html) return ""
  let out = ""
  let inTag = false
  for (const ch of html) {
    if (ch === "<") inTag = true
    else if (ch === ">") inTag = false
    else if (!inTag) out += ch
  }
  return out.replace(/\s+/g, " ").trim()
}

/** Collapse identical notices (same template + recipient) into one group. */
function groupItems(items: SurrenderedCommRow[]): CommGroup[] {
  const map = new Map<string, CommGroup>()
  for (const it of items) {
    const recipient = it.recipient_email ?? it.recipient_name ?? "—"
    const gkey = `${it.template_key}|${recipient}`
    const g = map.get(gkey)
    if (g) {
      g.ids.push(it.id)
      if (it.surrendered_at > g.latest) g.latest = it.surrendered_at
    } else {
      map.set(gkey, { key: gkey, templateLabel: humanizeTemplate(it.template_key), recipient, ids: [it.id], latest: it.surrendered_at, firstId: it.id })
    }
  }
  return [...map.values()]
}

export function SurrenderedCommsWidget({ items }: Readonly<{ items: SurrenderedCommRow[] }>) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [content, setContent] = useState<{ subject: string | null; body: string | null } | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  async function handleDispatch(g: CommGroup) {
    const notes = window.prompt(`Dispatch notes for ${g.ids.length} notice${g.ids.length === 1 ? "" : "s"} (optional — e.g. 'Registered mail ref 12345'):`)
    if (notes === null) return
    setBusy(g.key)
    const res = await markManuallyDispatchedBulk(g.ids, notes)
    setBusy(null)
    if (res.error) {
      toast.error(res.error)
    } else {
      toast.success(`Marked ${res.dispatched} dispatched`)
      router.refresh()
    }
  }

  async function handleView(g: CommGroup) {
    if (viewing === g.key) {
      setViewing(null)
      setContent(null)
      return
    }
    setViewing(g.key)
    setContent(null)
    setLoadingContent(true)
    const res = await getSurrenderedCommContent(g.firstId)
    setLoadingContent(false)
    if (res.error) {
      toast.error(res.error)
      setViewing(null)
    } else {
      setContent({ subject: res.subject, body: res.body })
    }
  }

  if (items.length === 0) return null

  const groups = groupItems(items)

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const dispatchLabel = g.ids.length > 1 ? "Mark all dispatched" : "Mark dispatched"
        return (
        <div key={g.key} className="overflow-hidden rounded-[var(--r-button)] border border-border">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
                {g.templateLabel}
                {g.ids.length > 1 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">×{g.ids.length}</span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {g.recipient}
                {" · "}{g.ids.length} notice{g.ids.length === 1 ? "" : "s"}
                {" · "}latest {new Date(g.latest).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className="pa-link text-[11px]" onClick={() => handleView(g)}>
                {viewing === g.key ? "Hide" : "View"}
              </button>
              <ActionButton tone="secondary" disabled={busy === g.key} onClick={() => handleDispatch(g)}>
                {busy === g.key ? "Saving…" : dispatchLabel}
              </ActionButton>
            </div>
          </div>
          {viewing === g.key && (
            <div className="border-t border-border bg-muted/20 px-3 py-2.5 text-xs">
              {loadingContent && <p className="text-muted-foreground">Loading message…</p>}
              {!loadingContent && content && (
                <>
                  {content.subject && <p className="mb-1 font-medium text-foreground">{content.subject}</p>}
                  <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{toPlainText(content.body) || "No message body."}</p>
                </>
              )}
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
