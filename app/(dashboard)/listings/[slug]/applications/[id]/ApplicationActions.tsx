"use client"

/**
 * app/(dashboard)/listings/[slug]/listings/[slug]/applications/[id]/ApplicationActions.tsx — Approve, decline, and shortlist actions for a rental application
 *
 * Route:  /listings/[slug]/applications/[id]
 * Auth:   gateway (dashboard layout)
 * Data:   applicationActions server actions; createTenantFromApplication; sendShortlistInvitation; Supabase client for immigration confirmation
 * Notes:  Foreign national applications require immigration compliance confirmed before shortlisting
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { sendShortlistInvitation } from "@/lib/screening/sendShortlistInvitation"
import { declineStage1Action, approveAction, declineStage2Action, deleteApplicationAction } from "@/lib/applications/applicationActions"
import { createTenantFromApplication } from "@/lib/applications/createTenantFromApplication"
import { DeclineDecisionModal, type DeclineSubmission } from "./DeclineDecisionModal"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useUser } from "@/hooks/useUser"
import { usePermissions } from "@/hooks/usePermissions"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"

interface ApplicationActionsProps {
  readonly applicationId: string
  readonly orgId: string
  readonly stage1Status: string
  readonly stage2Status: string | null
  readonly isForeignNational: boolean
  readonly immigrationConfirmed: boolean
}

export function ApplicationActions({
  applicationId,
  orgId,
  stage1Status,
  stage2Status,
  isForeignNational,
  immigrationConfirmed,
}: ApplicationActionsProps) {
  const { user } = useUser()
  const { isAdmin } = usePermissions()
  const router = useRouter()
  const [declineModalOpen, setDeclineModalOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    const r = await deleteApplicationAction(applicationId)
    if (r?.error) { toast.error(r.error); setDeleting(false); return }
    toast.success("Application removed")
    router.push("/listings")
  }

  async function handleShortlist() {
    if (isForeignNational && !immigrationConfirmed) {
      toast.error("Immigration compliance must be confirmed before shortlisting a foreign national.")
      return
    }
    if (!user) return
    const result = await sendShortlistInvitation(applicationId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Shortlist invitation sent"); router.refresh() }
  }

  async function handleDecline() {
    const result = await declineStage1Action(applicationId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Application declined"); router.refresh() }
  }

  async function handleApprove() {
    if (!user) return

    // Create tenant record from application first
    const result = await createTenantFromApplication(applicationId, user.id)
    if ("error" in result) {
      toast.error(result.error)
      return
    }

    // Update status + send email
    const actionResult = await approveAction(applicationId, user.id, result.tenantId)
    if (actionResult?.error) {
      toast.error(actionResult.error)
      return
    }

    toast.success("Application approved — tenant record created")
    router.push(`/tenants/${result.tenantId}`)
  }

  async function handleDeclineStage2(decision: DeclineSubmission) {
    const result = await declineStage2Action(applicationId, decision)
    if (result?.error) { toast.error(result.error); return }
    toast.success("Application declined")
    setDeclineModalOpen(false)
    router.refresh()
  }

  async function handleConfirmImmigration() {
    const supabase = createClient()
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- client component: browser supabase client (@/lib/supabase/client), RLS-enforced — cross-org blocked by policy, not a service-role write
    await supabase.from("applications").update({
      immigration_compliance_confirmed: true,
      immigration_compliance_confirmed_by: user?.id,
      immigration_compliance_confirmed_at: new Date().toISOString(),
    }).eq("id", applicationId)

    await supabase.from("audit_log").insert({
      org_id: orgId,
      table_name: "applications",
      record_id: applicationId,
      action: "UPDATE",
      changed_by: user?.id,
      new_values: {
        immigration_compliance_confirmed: true,
        declaration: "agent_confirmed_original_documents_inspected",
      },
    })
    toast.success("Immigration compliance confirmed")
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isForeignNational && !immigrationConfirmed && (
        <ActionButton tone="secondary" onClick={handleConfirmImmigration}>
          Confirm Immigration Docs
        </ActionButton>
      )}
      {stage1Status === "pre_screen_complete" && !stage2Status && (
        <>
          <ActionButton tone="primary" onClick={handleShortlist}>Invite to Credit Check</ActionButton>
          <ActionButton tone="secondary" onClick={handleDecline}>Decline</ActionButton>
        </>
      )}
      {stage2Status === "screening_complete" && (
        <>
          <ActionButton tone="primary" onClick={handleApprove}>Approve</ActionButton>
          <ActionButton tone="destructive" onClick={() => setDeclineModalOpen(true)}>Decline</ActionButton>
        </>
      )}
      {isAdmin && <ActionButton tone="destructive" onClick={() => setDeleteOpen(true)}>Delete</ActionButton>}
      <DeclineDecisionModal
        open={declineModalOpen}
        onClose={() => setDeclineModalOpen(false)}
        onSubmit={handleDeclineStage2}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this application?"
        description="It's removed from your lists, but the record, documents, consent and audit trail are retained — a submitted application is an evidentiary record (FitScore replay, proof of consent)."
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  )
}
