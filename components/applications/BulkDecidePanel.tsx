"use client"

/**
 * Bulk shortlist/decline panel — shown under each listing group on /applications.
 * Lets the agent radio-select each applicant as shortlist/decline,
 * optionally set a shared decline reason, then apply all decisions in one click.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sendShortlistInvitation } from "@/lib/screening/sendShortlistInvitation"
import { declineStage1Action } from "@/lib/applications/applicationActions"
import { toast } from "sonner"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Decision = "shortlist" | "decline" | null

interface Applicant {
  id: string
  name: string
  prescreenScore: number | null
}

interface Props {
  applicants: Applicant[]
  agentId: string
  onDone?: () => void
}

export function BulkDecidePanel({ applicants, agentId, onDone }: Props) {
  const router = useRouter()
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [declineReason, setDeclineReason] = useState("")
  const [applying, setApplying] = useState(false)

  const decided = Object.values(decisions).filter(Boolean).length
  const shortlistCount = Object.values(decisions).filter((d) => d === "shortlist").length
  const declineCount = Object.values(decisions).filter((d) => d === "decline").length
  const hasAnyDecision = decided > 0

  function setDecision(appId: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [appId]: decision }))
  }

  async function applyDecisions() {
    if (!hasAnyDecision) return
    setApplying(true)

    const results = await Promise.allSettled(
      Object.entries(decisions)
        .filter(([, d]) => d !== null)
        .map(async ([appId, decision]) => {
          if (decision === "shortlist") {
            const res = await sendShortlistInvitation(appId, agentId)
            if (res?.error) throw new Error(res.error)
          } else {
            const res = await declineStage1Action(appId)
            if (res?.error) throw new Error(res.error)
          }
        })
    )

    const failed = results.filter((r) => r.status === "rejected").length
    const succeeded = results.length - failed

    if (failed === 0) {
      toast.success(`${succeeded} decision${succeeded !== 1 ? "s" : ""} applied — emails sent`)
    } else {
      toast.error(`${succeeded} succeeded, ${failed} failed`)
    }

    setApplying(false)
    setDecisions({})
    if (onDone) onDone()
    router.refresh()
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bulk decide</p>

      <div className="space-y-2">
        {applicants.map((app) => (
          <div key={app.id} className="flex items-center gap-3">
            <p className="flex-1 text-sm truncate">
              {app.name}
              {app.prescreenScore !== null && (
                <span className="ml-2 text-xs text-muted-foreground">{app.prescreenScore}/45</span>
              )}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setDecision(app.id, decisions[app.id] === "shortlist" ? null : "shortlist")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors",
                  decisions[app.id] === "shortlist"
                    ? "bg-success/10 border-success text-success"
                    : "border-border text-muted-foreground hover:border-success hover:text-success"
                )}
              >
                <CheckCircle className="size-3.5" />
                Shortlist
              </button>
              <button
                onClick={() => setDecision(app.id, decisions[app.id] === "decline" ? null : "decline")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors",
                  decisions[app.id] === "decline"
                    ? "bg-destructive/10 border-destructive text-destructive"
                    : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                )}
              >
                <XCircle className="size-3.5" />
                Decline
              </button>
            </div>
          </div>
        ))}
      </div>

      {declineCount > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="decline-reason" className="text-xs">Decline reason (optional — sent to all declined)</Label>
          <Input
            id="decline-reason"
            placeholder="e.g. Income does not meet minimum requirement"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            className="text-sm h-9"
          />
        </div>
      )}

      {hasAnyDecision && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {shortlistCount > 0 && `${shortlistCount} invite${shortlistCount !== 1 ? "s" : ""}`}
            {shortlistCount > 0 && declineCount > 0 && " · "}
            {declineCount > 0 && `${declineCount} decline${declineCount !== 1 ? "s" : ""}`}
            {" — emails will be sent"}
          </p>
          <Button size="sm" onClick={applyDecisions} disabled={applying}>
            {applying ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Applying…</> : "Apply decisions"}
          </Button>
        </div>
      )}
    </div>
  )
}
