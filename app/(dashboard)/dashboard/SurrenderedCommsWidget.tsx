/**
 * app/(dashboard)/dashboard/SurrenderedCommsWidget.tsx — surrendered mandatory comms list (grouped)
 *
 * Auth:   rendered inside the dashboard alerts bell modal (Operations category); data from page.tsx
 * Data:   mandatory_comm_retries (surrendered, undispatched) + the linked lease_id, via props
 * Notes:  Identical notices (same template + recipient + lease) collapse into one card with a ×count badge.
 *         Each operational item uses the standard "Review →" affordance (InlineLink withArrow, same as the
 *         Needs-attention queue) and deep-links to the related lease where the agent reviews + actions it.
 *
 *         TODO(lease-ops-tab): the lease detail page's Operations tab is where this lifecycle completes —
 *         it needs a "manual verify + dispatch" surface so "Review →" lands somewhere actionable
 *         (e.g. /leases/[id]?tab=operations). That surface also owns RESOLUTION: a surrendered notice
 *         should clear when (a) it's verified/dispatched there, (b) the lease is finalised/terminated, or
 *         (c) it's superseded — e.g. a new active lease is already in place, so an old expiry reminder that
 *         was never followed up is no longer applicable. Until then "Review →" lands on the lease detail
 *         page and notices are not auto-resolved (the dispatch server actions in lib/actions/surrendered-comms
 *         are retained for that tab to call).
 */
import { InlineLink } from "@/components/ui/actions"
import { fmtZA } from "@/lib/dates"

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

/**
 * Collapse one notice's repeated delivery failures into a single row. The retry engine writes a row per
 * failed attempt, so 20 rows of the same template→recipient = ONE notice that failed 20×, not 20 notices.
 * Group by template + recipient only; pick up the lease ref from whichever attempt carries it.
 */
function groupItems(items: SurrenderedCommRow[]): CommGroup[] {
  const map = new Map<string, CommGroup>()
  for (const it of items) {
    const recipient = it.recipient_email ?? it.recipient_name ?? "—"
    const gkey = `${it.template_key}|${recipient}`
    const g = map.get(gkey)
    if (g) {
      g.ids.push(it.id)
      if (it.surrendered_at > g.latest) g.latest = it.surrendered_at
      g.leaseId = g.leaseId ?? it.lease_id
    } else {
      map.set(gkey, { key: gkey, templateLabel: humanizeTemplate(it.template_key), recipient, leaseId: it.lease_id, ids: [it.id], latest: it.surrendered_at })
    }
  }
  return [...map.values()]
}

export function SurrenderedCommsWidget({ items }: Readonly<{ items: SurrenderedCommRow[] }>) {
  if (items.length === 0) return null
  const groups = groupItems(items)

  return (
    <div className="space-y-2">
      {groups.map((g) => (
        <div key={g.key} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{g.templateLabel}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {g.recipient}
              {g.ids.length > 1 && <> · failed {g.ids.length}×</>}
              {" · "}latest {fmtZA(g.latest, { day: "numeric", month: "short" })}
            </p>
          </div>
          {g.leaseId && (
            <InlineLink href={`/leases/${g.leaseId}`} withArrow className="shrink-0 text-[12px] font-medium">Review</InlineLink>
          )}
        </div>
      ))}
    </div>
  )
}
