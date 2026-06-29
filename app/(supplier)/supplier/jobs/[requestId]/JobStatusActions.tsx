"use client"

/**
 * app/(supplier)/supplier/jobs/[requestId]/JobStatusActions.tsx — supplier job status-transition actions
 *
 * Auth:   rendered inside the session-guarded supplier portal; status writes go via the browser client
 * Data:   maintenance_requests status updates; the completion report sets pending_completion + notes
 * Notes:  Canon DetailCard + forms/fields + ActionButton (door style) — presentation only.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ActionButton } from "@/components/ui/actions"
import { TextareaField } from "@/components/forms/fields"
import { DetailCard } from "@/components/detail/DetailCard"
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
        <ActionButton asChild tone="primary" className="w-full h-12 text-base font-semibold">
          <Link href={`/supplier/jobs/${requestId}/quote`}>
            Submit Quote
          </Link>
        </ActionButton>
      )}

      {/* Quote rejected — can resubmit */}
      {status === "quote_rejected" && (
        <ActionButton asChild tone="primary" className="w-full h-12">
          <Link href={`/supplier/jobs/${requestId}/quote`}>
            Submit Revised Quote
          </Link>
        </ActionButton>
      )}

      {/* New job — acknowledge */}
      {status === "work_order_sent" && (
        <ActionButton tone="primary" className="w-full h-12" onClick={() => updateStatus("acknowledged")} disabled={submitting}>
          {submitting ? "Updating..." : "Acknowledge Job"}
        </ActionButton>
      )}

      {/* Quote approved or acknowledged — start work */}
      {(status === "quote_approved" || status === "acknowledged") && (
        <div className="flex gap-3">
          <ActionButton tone="primary" className="flex-1 h-12" onClick={() => updateStatus("in_progress")} disabled={submitting}>
            Start Work
          </ActionButton>
        </div>
      )}

      {/* In progress — complete */}
      {status === "in_progress" && (
        <>
          {!showCompletion ? (
            <ActionButton tone="primary" className="w-full h-12" onClick={() => setShowCompletion(true)}>
              Mark Complete
            </ActionButton>
          ) : (
            <DetailCard title="Completion report">
              <div className="space-y-3">
                <TextareaField
                  label="What was done"
                  value={completionNotes}
                  onChange={setCompletionNotes}
                  placeholder="Describe the work completed..."
                  rows={4}
                />
                <div className="flex gap-3">
                  <ActionButton tone="primary" className="flex-1" onClick={handleComplete} disabled={submitting}>
                    {submitting ? "Submitting..." : "Submit completion"}
                  </ActionButton>
                  <ActionButton tone="secondary" onClick={() => setShowCompletion(false)}>Cancel</ActionButton>
                </div>
              </div>
            </DetailCard>
          )}
        </>
      )}

      {/* Completed — submit invoice */}
      {(status === "pending_completion" || status === "completed") && (
        <ActionButton asChild tone="secondary" className="w-full h-12">
          <Link href={`/supplier/invoices`}>
            Submit Invoice
          </Link>
        </ActionButton>
      )}
    </div>
  )
}
