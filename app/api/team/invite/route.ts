import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// DELETE /api/team/invite
// Body: { inviteId, orgId }
// Requires: isAdmin (owner or admin)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { inviteId, orgId } = body as { inviteId?: string; orgId?: string }
  if (!inviteId || !orgId) {
    return NextResponse.json({ error: "inviteId and orgId required" }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: callerRaw } = await service
    .from("user_orgs")
    .select("role, is_admin")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!callerRaw) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const caller = callerRaw as unknown as { role: string; is_admin: boolean }
  if (caller.role !== "owner" && !caller.is_admin) {
    return NextResponse.json({ error: "Admin access required to revoke invites" }, { status: 403 })
  }

  const { error } = await service
    .from("invites")
    .delete()
    .eq("id", inviteId)
    .eq("org_id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
