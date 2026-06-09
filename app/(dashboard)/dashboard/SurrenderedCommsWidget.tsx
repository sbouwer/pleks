"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsWidget.tsx — surrendered mandatory comms list (grouped)
 *
 * Auth:   agent session (rendered inside the dashboard alerts bell modal, data from page.tsx)
 * Data:   mandatory_comm_retries (surrendered, undispatched) + the linked lease_id, via props
 * Notes:  Identical notices (same template + recipient + lease) collapse into one card with a ×count badge.
 *         "View on lease" deep-links to the related lease where the agent verifies + dispatches; "Mark
 *         dispatched" clears the whole group (markManuallyDispatchedBulk). BUILD_63 Phase 8.
 *
 *         TODO(lease-ops-tab): when the lease detail page's Operations tab is redesigned, add a "manual
 *         verify + dispatch" surface there and point this link at it (e.g. /leases/[id]?tab=operations).
 *         Until then the link lands on the lease detail page so the agent has the context to act.
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { markManuallyDispatchedBulk } from "@/lib/actions/surrendered-comms"

export interface SurrenderedCommRow {
  id: string
  template_key: string
  surrender_reason: string | null
  surrendered_at: string
  recipient_email: string | null
  recipient_name: string | null
  attempt_count: number
  lease_id: string | null
}

interface CommGroup {
  key: string
  templateLabel: string
  recipient: string
  leaseId: string | null
  ids: string[]
  latest: string
}

/** "lease.expiry_reminder" → "Lease expiry reminder" */
function humanizeTemplate(key: string): string {
  const s = key.replace(/[._]/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key
}

/** Collapse identical notices (same template + recipient + lease) into one group. */
function groupItems(items: SurrenderedCommRow[]): CommGroup[] {
  const map = new Map<string, CommGroup>()
  for (const it of items) {
    const recipient = it.recipient_email ?? it.recipient_name ?? "—"
    const gkey = `${it.template_key}|${recipient}|${it.lease_id ?? ""}`
    const g = map.get(gkey)
    if (g) {
      g.ids.push(it.id)
      if (it.surrendered_at > g.latest) g.latest = it.surrendered_at
    } else {
      map.set(gkey, { key: gkey, templateLabel: humanizeTemplate(it.template_key), recipient, leaseId: it.lease_id, ids: [it.id], latest: it.surrendered_at })
    }
  }
  return [...map.values()]
}

export function SurrenderedCommsWidget({ items }: Readonly<{ items: SurrenderedCommRow[] }>) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

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

  if (items.length === 0) return null

  const groups = groupItems(items)

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const dispatchLabel = g.ids.length > 1 ? "Mark all dispatched" : "Mark dispatched"
        return (
          <div key={g.key} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border px-3 py-2.5">
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
              {g.leaseId && (
                <Link href={`/leases/${g.leaseId}`} className="pa-link text-[11px]">View on lease →</Link>
              )}
              <ActionButton tone="secondary" disabled={busy === g.key} onClick={() => handleDispatch(g)}>
                {busy === g.key ? "Saving…" : dispatchLabel}
              </ActionButton>
            </div>
          </div>
        )
      })}
    </div>
  )
}
