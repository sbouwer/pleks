"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsWidget.tsx — surrendered mandatory comms widget
 *
 * Auth:   agent session (rendered inside dashboard, data passed from page.tsx server component)
 * Data:   mandatory_comm_retries (surrendered, undispatched) via props from page
 * Notes:  Each surrendered comm requires physical dispatch — print, post, deliver, then mark here.
 *         "Mark dispatched" writes an audit row to communication_log. BUILD_63 Phase 8.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
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

interface SurrenderedCommsWidgetProps {
  items: SurrenderedCommRow[]
  /** render just the list (no Card chrome / header) — for embedding in the header bell's modal */
  bare?: boolean
}

export function SurrenderedCommsWidget({ items, bare = false }: SurrenderedCommsWidgetProps) {
  const router = useRouter()
  const [dispatching, setDispatching] = useState<string | null>(null)

  async function handleDispatch(retryId: string) {
    const notes = window.prompt("Enter dispatch notes (optional — e.g. 'Registered mail ref 12345'):")
    if (notes === null) return  // cancelled

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

  const list = (
    <div className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-amber-200 bg-white px-3 py-3 flex items-start justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge className="bg-red-100 text-red-700 text-xs">Surrendered</Badge>
                <span className="text-xs text-muted-foreground font-mono">{item.template_key}</span>
              </div>
              {item.recipient_email && (
                <p className="text-xs text-foreground">To: {item.recipient_email}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                Surrendered {new Date(item.surrendered_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                {" "}after {item.attempt_count} attempt{item.attempt_count !== 1 ? "s" : ""}
              </p>
              {item.surrender_reason && (
                <p className="text-xs text-muted-foreground">Reason: {item.surrender_reason}</p>
              )}
            </div>
            <ActionButton
              tone="secondary"
              disabled={dispatching === item.id}
              onClick={() => handleDispatch(item.id)}
            >
              {dispatching === item.id ? (
                "Saving…"
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Mark dispatched
                </>
              )}
            </ActionButton>
          </div>
        ))}
    </div>
  )

  if (bare) return list

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Surrendered notices requiring manual dispatch ({items.length})
        </CardTitle>
        <p className="text-xs text-amber-700 mt-1">
          These mandatory communications failed all delivery attempts. Print and dispatch physically,
          then mark as dispatched below to complete the audit trail.
        </p>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  )
}
