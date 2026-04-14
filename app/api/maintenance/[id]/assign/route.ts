import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No org" }, { status: 403 })
  }

  const orgId = membership.org_id as string

  const body = await req.json() as { contractorId?: string }
  const contractorId = body.contractorId?.trim()
  if (!contractorId) {
    return NextResponse.json({ error: "contractorId is required" }, { status: 400 })
  }

  const { error: updateError } = await service
    .from("maintenance_requests")
    .update({ contractor_id: contractorId })
    .eq("id", requestId)
    .eq("org_id", orgId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: auditError } = await service.from("audit_log").insert({
    org_id: orgId,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { contractor_id: contractorId },
  })

  if (auditError) {
    return NextResponse.json({ error: auditError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
