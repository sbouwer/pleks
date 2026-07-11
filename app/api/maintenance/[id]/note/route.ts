/**
 * app/api/maintenance/[id]/note/route.ts — add an internal note to a maintenance request
 *
 * Route:  POST /api/maintenance/[id]/note
 * Auth:   auth.getUser() + user_orgs membership lookup (service client)
 * Data:   inserts audit_log (action 'NOTE') against maintenance_requests
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordAuditReturningId } from "@/lib/audit/recordAudit"

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

  const body = await req.json() as { note?: string }
  const note = body.note?.trim()
  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400 })
  }

  // The note lives in audit_log — a failed write must surface, so use the returning-id writer.
  const auditId = await recordAuditReturningId(service, { orgId: orgId, table: "maintenance_requests", recordId: requestId, action: "NOTE", actorId: user.id, after: { note } })

  if (!auditId) {
    return NextResponse.json({ error: "Failed to record note" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
