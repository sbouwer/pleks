"use client"

/**
 * app/(admin)/admin/subscriptions/SetStateWidget.tsx — QA fixture: force subscription state
 *
 * Auth:   Admin session cookie forwarded automatically (same origin)
 * Data:   POST /api/admin/subscription/set-state
 * Notes:  Dev/QA only — lets admin force an org into any subscription state to test
 *         lockdown banners, dunning emails, and cron behaviour without waiting for real events.
 */
import { useState, useTransition } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "pending_cancellation",
  "cancelled",
] as const

type Status = typeof STATUSES[number]

interface OrgOption {
  orgId: string
  orgName: string
  currentStatus: string
}

export function SetStateWidget({ orgs }: Readonly<{ orgs: OrgOption[] }>) {
  const [orgId, setOrgId] = useState(orgs[0]?.orgId ?? "")
  const [status, setStatus] = useState<Status>("active")
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    setResult(null)
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/subscription/set-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, status }),
        })
        const data = await res.json() as Record<string, unknown>
        if (res.ok) {
          setResult({ ok: true, msg: `${orgId} → ${status}` })
        } else {
          setResult({ ok: false, msg: String(data.error ?? "Unknown error") })
        }
      } catch (err) {
        setResult({ ok: false, msg: err instanceof Error ? err.message : "Request failed" })
      }
    })
  }

  return (
    <Card className="border-violet-300/50">
      <CardHeader>
        <CardTitle className="text-sm text-violet-700">QA — Force subscription state</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-muted-foreground mb-1">Organisation</label>
            <select
              className="w-full rounded-md border border-border bg-background text-sm p-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
              value={orgId}
              onChange={e => setOrgId(e.target.value)}
            >
              {orgs.map(o => (
                <option key={o.orgId} value={o.orgId}>
                  {o.orgName} ({o.currentStatus})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Target status</label>
            <select
              className="rounded-md border border-border bg-background text-sm p-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
              value={status}
              onChange={e => setStatus(e.target.value as Status)}
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={pending || !orgId}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {pending ? "Applying…" : "Force state"}
          </Button>
        </div>

        {result && (
          <p className={`text-xs font-mono ${result.ok ? "text-green-700" : "text-destructive"}`}>
            {result.ok ? "✓" : "✗"} {result.msg}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          Sets status + lifecycle timestamps. Refuses <code>purged</code> (irreversible). Logs to audit_log.
        </p>
      </CardContent>
    </Card>
  )
}
