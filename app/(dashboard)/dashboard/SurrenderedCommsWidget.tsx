"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsWidget.tsx — surrendered mandatory comms list (compact)
 *
 * Auth:   agent session (rendered inside the dashboard alerts bell modal, data from page.tsx)
 * Data:   mandatory_comm_retries (surrendered, undispatched) via props
 * Notes:  Each surrendered comm failed all delivery attempts and needs physical dispatch — print, post,
 *         deliver, then "Mark dispatched" (writes an audit row to communication_log). BUILD_63 Phase 8.
 *         Compact rows with a humanised template label; rendered inside the DashboardAlertsBell modal.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { markManuallyDispatched } from "@/lib/actions/surrendered-comms"

export interface SurrenderedCommRow {
  id: string
  template_key: string
  surrender_reason: string | null
  surrendered_at: string
  recipient_email: string | null
  recipient_name: string | null
  attempt_count: number
}

/** "lease.expiry_reminder" → "Lease expiry reminder" */
function humanizeTemplate(key: string): string {
  const s = key.replace(/[._]/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key
}

export function SurrenderedCommsWidget({ items }: Readonly<{ items: SurrenderedCommRow[] }>) {
  const router = useRouter()
  const [dispatching, setDispatching] = useState<string | null>(null)

  async function handleDispatch(retryId: string) {
    const notes = window.prompt("Enter dispatch notes (optional — e.g. 'Registered mail ref 12345'):")
    if (notes === null) return // cancelled
    setDispatching(retryId)
    const result = await markManuallyDispatched(retryId, notes)
    setDispatching(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Marked as manually dispatched")
      router.refresh()
    }
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">{humanizeTemplate(item.template_key)}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {item.recipient_email ?? item.recipient_name ?? "—"}
              {" · "}{item.attempt_count} attempt{item.attempt_count === 1 ? "" : "s"}
              {" · "}surrendered {new Date(item.surrendered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
            </p>
          </div>
          <ActionButton tone="secondary" disabled={dispatching === item.id} onClick={() => handleDispatch(item.id)}>
            {dispatching === item.id ? "Saving…" : "Mark dispatched"}
          </ActionButton>
        </div>
      ))}
    </div>
  )
}
