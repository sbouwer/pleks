"use client"

import { Button } from "@/components/ui/button"
import { sendShortlistInvitation } from "@/lib/screening/sendShortlistInvitation"
import { declineStage1Action, approveAction, declineStage2Action } from "@/lib/applications/applicationActions"
import { createTenantFromApplication } from "@/lib/applications/createTenantFromApplication"
import { useUser } from "@/hooks/useUser"
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
  const router = useRouter()

  async function handleShortlist() {
    if (isForeignNational && !immigrationConfirmed) {
      toast.error("Immigration compliance must be confirmed before shortlisting a foreign national.")
      return
    }
    if (!user) return
    const result = await sendShortlistInvitation(applicationId, user.id)
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

  async function handleDeclineStage2() {
    const result = await declineStage2Action(applicationId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Application declined"); router.refresh() }
  }

  async function handleConfirmImmigration() {
    const supabase = createClient()
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
        <Button size="sm" variant="outline" onClick={handleConfirmImmigration}>
          Confirm Immigration Docs
        </Button>
      )}
      {stage1Status === "pre_screen_complete" && !stage2Status && (
        <>
          <Button size="sm" onClick={handleShortlist}>Invite to Credit Check</Button>
          <Button size="sm" variant="outline" onClick={handleDecline}>Decline</Button>
        </>
      )}
      {stage2Status === "screening_complete" && (
        <>
          <Button size="sm" onClick={handleApprove}>Approve</Button>
          <Button size="sm" variant="outline" onClick={handleDeclineStage2}>Decline</Button>
        </>
      )}
    </div>
  )
}
