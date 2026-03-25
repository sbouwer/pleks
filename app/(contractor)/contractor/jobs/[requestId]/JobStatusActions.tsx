"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface JobStatusActionsProps {
  readonly requestId: string
  readonly status: string
}

export function JobStatusActions({ requestId, status }: JobStatusActionsProps) {
  const router = useRouter()
  const [showCompletion, setShowCompletion] = useState(false)
  const [completionNotes, setCompletionNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function updateStatus(newStatus: string) {
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from("maintenance_requests").update({
      status: newStatus,
    }).eq("id", requestId)
    toast.success(`Status updated: ${newStatus.replace(/_/g, " ")}`)
    setSubmitting(false)
    router.refresh()
  }

  async function handleComplete() {
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from("maintenance_requests").update({
      status: "pending_completion",
      completion_notes: completionNotes,
      completed_at: new Date().toISOString(),
    }).eq("id", requestId)
    toast.success("Completion report submitted")
    setSubmitting(false)
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {/* Quote requested */}
      {status === "pending_quote" && (
        <Button className="w-full h-12 text-base font-semibold" render={<Link href={`/contractor/jobs/${requestId}/quote`} />}>
          Submit Quote
        </Button>
      )}

      {/* Quote rejected — can resubmit */}
      {status === "quote_rejected" && (
        <Button className="w-full h-12" render={<Link href={`/contractor/jobs/${requestId}/quote`} />}>
          Submit Revised Quote
        </Button>
      )}

      {/* New job — acknowledge */}
      {status === "work_order_sent" && (
        <Button className="w-full h-12" onClick={() => updateStatus("acknowledged")} disabled={submitting}>
          {submitting ? "Updating..." : "Acknowledge Job"}
        </Button>
      )}

      {/* Quote approved or acknowledged — start work */}
      {(status === "quote_approved" || status === "acknowledged") && (
        <div className="flex gap-3">
          <Button className="flex-1 h-12" onClick={() => updateStatus("in_progress")} disabled={submitting}>
            Start Work
          </Button>
        </div>
      )}

      {/* In progress — complete */}
      {status === "in_progress" && (
        <>
          {!showCompletion ? (
            <Button className="w-full h-12" onClick={() => setShowCompletion(true)}>
              Mark Complete
            </Button>
          ) : (
            <Card>
              <CardHeader><CardTitle className="text-sm">Completion Report</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Describe the work completed..."
                  rows={4}
                />
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={handleComplete} disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit Completion"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCompletion(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Completed — submit invoice */}
      {(status === "pending_completion" || status === "completed") && (
        <Button variant="outline" className="w-full h-12" render={<Link href={`/contractor/invoices`} />}>
          Submit Invoice
        </Button>
      )}
    </div>
  )
}
