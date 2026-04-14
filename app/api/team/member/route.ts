import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

const ALLOWED_PROFILE_FIELDS = ["title", "first_name", "last_name", "mobile", "emergency_phone", "emergency_contact_name"] as const
const ALLOWED_ORG_FIELDS = ["role", "additional_roles"] as const

function buildProfilePatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const field of ALLOWED_PROFILE_FIELDS) {
    if (!(field in body)) continue
    patch[field] = body[field] ?? null
    if (field === "first_name" || field === "last_name") {
      const first = (field === "first_name" ? body[field] : body.first_name) as string | null
      const last  = (field === "last_name"  ? body[field] : body.last_name)  as string | null
      patch.full_name = [first, last].filter(Boolean).join(" ") || null
    }
  }
  return patch
}

function buildOrgPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const field of ALLOWED_ORG_FIELDS) {
    if (field in body) patch[field] = body[field]
  }
  return patch
}

// PATCH /api/team/member
// Body: { userId, orgId, ...profileFields, ...orgFields }
// Requires: caller must be owner or property_manager of the org
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { userId, orgId } = body as { userId?: string; orgId?: string }
  if (!userId || !orgId) {
    return NextResponse.json({ error: "userId and orgId required" }, { status: 400 })
  }

  // Verify caller is owner or property_manager in this org
  const { data: callerMembership } = await supabase
    .from("user_orgs")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!callerMembership || !["owner", "property_manager"].includes(callerMembership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Verify target user is a member of the same org
  const { data: targetMembership } = await supabase
    .from("user_orgs")
    .select("id, role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!targetMembership) {
    return NextResponse.json({ error: "Member not found in org" }, { status: 404 })
  }

  // Prevent demoting or changing owner role
  if (targetMembership.role === "owner" && body.role && body.role !== "owner") {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 403 })
  }

  const service = await createServiceClient()
  const errors: string[] = []

  const profilePatch = buildProfilePatch(body)
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("user_profiles").update(profilePatch).eq("id", userId)
    if (error) errors.push(`profile: ${error.message}`)
  }

  const orgPatch = buildOrgPatch(body)
  if (Object.keys(orgPatch).length > 0) {
    const { error } = await service.from("user_orgs").update(orgPatch).eq("id", targetMembership.id)
    if (error) errors.push(`roles: ${error.message}`)
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
