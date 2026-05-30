"use client"

/**
 * components/feedback/BugReportDialog.tsx — One-line bug report with auto-captured diagnostics
 *
 * Auth:   Any authenticated user — POST /api/feedback/bug handles the auth check.
 * Notes:  ADDENDUM_68 Slice 1. The only required input is one sentence; route, device,
 *         console errors, failed requests and correlation ids are captured automatically
 *         (snapshotContext) and shown collapsed-but-expandable for transparency (POPIA).
 *         No screenshot/offline yet (Slice 2).
 */

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronRight } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { snapshotContext, type BugSnapshot } from "@/lib/feedback/capture-buffer"

interface BugReportDialogProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
}

export function BugReportDialog({ open, onOpenChange }: Readonly<BugReportDialogProps>) {
  const [message,     setMessage]     = useState("")
  const [snapshot,    setSnapshot]    = useState<BugSnapshot | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [done,        setDone]        = useState(false)

  // Snapshot diagnostics when the dialog opens — reflects state at report time.
  useEffect(() => {
    if (open) setSnapshot(snapshotContext())
  }, [open])

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch("/api/feedback/bug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), context: snapshot ?? snapshotContext() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? "Failed to send report.")
        return
      }
      setDone(true)
    } catch {
      toast.error("Failed to send report. Check your connection.")
    } finally {
      setSaving(false)
    }
  }

  function handleClose(value: boolean) {
    if (!value) {
      setTimeout(() => {
        setDone(false)
        setMessage("")
        setShowDetails(false)
      }, 200)
    }
    onOpenChange(value)
  }

  const errCount = snapshot?.consoleErrors.length ?? 0
  const reqCount = snapshot?.failedRequests.length ?? 0

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{done ? "Thanks — report received" : "Report a problem"}</DialogTitle>
          {!done && (
            <DialogDescription>
              Tell us what went wrong in one line. We&apos;ll attach the technical details automatically.
            </DialogDescription>
          )}
        </DialogHeader>

        {done ? (
          <div className="py-4 text-sm text-muted-foreground">
            We&apos;ve received your report and the diagnostics needed to investigate. You may get a
            reply by email if we need more information.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bug-message">What went wrong?</Label>
              <Textarea
                id="bug-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                rows={3}
                placeholder="e.g. I tapped Pay and nothing happened"
                required
                autoFocus
              />
            </div>

            {/* Technical context — collapsed, transparent (POPIA): nothing hidden, never required to read */}
            <div className="rounded-md border border-border bg-muted/30">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={showDetails}
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showDetails ? "rotate-90" : ""}`} />
                Technical details attached
              </button>
              {showDetails && snapshot && (
                <div className="space-y-1 px-3 pb-3 text-[11px] text-muted-foreground">
                  <p>Page: {snapshot.routePath}</p>
                  <p>Device: {snapshot.userAgentParsed} · {snapshot.viewport}</p>
                  <p>Connection: {snapshot.onlineState}{snapshot.pwaMode ? " · installed app" : ""}</p>
                  <p>
                    {errCount} console error{errCount === 1 ? "" : "s"} · {reqCount} failed request
                    {reqCount === 1 ? "" : "s"} captured
                  </p>
                  {snapshot.plekTrace && <p>Trace: {snapshot.plekTrace.slice(0, 12)}…</p>}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || message.trim().length < 10}>
                {saving ? "Sending…" : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
