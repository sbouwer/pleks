"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { toast } from "sonner"
import { Loader2, CalendarX } from "lucide-react"
import { respondToRescheduleRequest } from "./actions"

export interface RescheduleRequest {
  id: string
  tenant_id: string
  reason: string
  proposed_dates: string[]
  note: string | null
  status: string
  agent_response: string | null
  resolved_date: string | null
  created_at: string
}

interface Props {
  readonly inspectionId: string
  readonly requests: RescheduleRequest[]
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  countered: "Countered",
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning bg-warning/10 border-warning/20",
  approved: "text-success bg-success/10 border-success/20",
  declined: "text-danger bg-danger/10 border-danger/20",
  countered: "text-brand bg-brand/10 border-brand/20",
}

function RequestCard({ req, inspectionId }: Readonly<{ req: RescheduleRequest; inspectionId: string }>) {
  const [responding, setResponding] = useState(false)
  const [action, setAction] = useState<"approved" | "declined" | "countered" | null>(null)
  const [agentResponse, setAgentResponse] = useState("")
  const [counterDate, setCounterDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [resolved, setResolved] = useState(req.status !== "pending")
  const [currentStatus, setCurrentStatus] = useState(req.status)

  async function handleSubmit() {
    if (!action) return
    if (action === "countered" && !counterDate) return
    setSaving(true)
    let resolvedDate: string | null = null
    if (action === "countered") resolvedDate = counterDate
    else if (action === "approved") resolvedDate = req.proposed_dates[0] ?? null
    const result = await respondToRescheduleRequest({
      requestId: req.id,
      inspectionId,
      action,
      agentResponse: agentResponse.trim() || null,
      resolvedDate,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(`Request ${action}`)
    setCurrentStatus(action)
    setResolved(true)
    setResponding(false)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{req.reason}</p>
          {req.note && <p className="text-xs text-muted-foreground mt-0.5">{req.note}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            Submitted {new Date(req.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
          </p>
        </div>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[currentStatus] ?? "text-muted-foreground"}`}>
          {STATUS_LABEL[currentStatus] ?? currentStatus}
        </span>
      </div>

      {req.proposed_dates.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Proposed dates</p>
          <div className="flex flex-wrap gap-1.5">
            {req.proposed_dates.map((d) => (
              <span key={d} className="text-xs bg-surface-elevated border border-border/60 px-2 py-0.5 rounded">
                {new Date(d).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
        </div>
      )}

      {req.agent_response && (
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-2">
          Response: {req.agent_response}
          {req.resolved_date && ` · ${new Date(req.resolved_date).toLocaleDateString("en-ZA")}`}
        </p>
      )}

      {!resolved && (
        responding ? (
          <div className="space-y-3 border-t border-border/40 pt-3">
            <div className="flex gap-2">
              {(["approved", "declined", "countered"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAction(a)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${
                    action === a ? "border-brand bg-brand/10 text-brand font-medium" : "border-border/60 text-muted-foreground hover:border-border"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>

            {action === "countered" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Counter date *</Label>
                <DatePickerInput value={counterDate} onChange={setCounterDate} placeholder="Counter date" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Message to tenant (optional)</Label>
              <Textarea
                value={agentResponse}
                onChange={(e) => setAgentResponse(e.target.value)}
                rows={2}
                className="text-sm resize-none"
                maxLength={500}
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!action || (action === "countered" && !counterDate) || saving}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Confirm
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResponding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setResponding(true)}>
            Respond
          </Button>
        )
      )}
    </div>
  )
}

export function RescheduleRequestsPanel({ inspectionId, requests }: Props) {
  const pending = requests.filter((r) => r.status === "pending")
  const resolved = requests.filter((r) => r.status !== "pending")

  if (requests.length === 0) return null

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarX className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Reschedule requests</h3>
        {pending.length > 0 && (
          <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-warning text-white text-[10px] font-semibold flex items-center justify-center">
            {pending.length}
          </span>
        )}
      </div>
      {pending.map((r) => (
        <RequestCard key={r.id} req={r} inspectionId={inspectionId} />
      ))}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Resolved</p>
          {resolved.map((r) => (
            <RequestCard key={r.id} req={r} inspectionId={inspectionId} />
          ))}
        </div>
      )}
    </div>
  )
}
