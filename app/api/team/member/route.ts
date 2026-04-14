import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"

const ALLOWED_PROFILE_FIELDS = ["title", "first_name", "last_name", "mobile", "emergency_phone", "emergency_contact_name"] as const
const ALLOWED_ORG_FIELDS = ["role", "additional_roles"] as const

// System role slugs — these are never added to org custom_roles
const SYSTEM_ROLE_SLUGS = new Set(["owner", "property_manager", "agent", "accountant", "maintenance_manager"])

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

// If the role is a custom label (not a system slug), append it to org's
// custom_roles library so it appears in the picker for future members.
// Fails silently if the column doesn't exist yet (migration pending).
async function appendOrgCustomRole(service: SupabaseClient, orgId: string, roleValue: string): Promise<void> {
  if (SYSTEM_ROLE_SLUGS.has(roleValue)) return
  const { data } = await service.from("organisations").select("custom_roles").eq("id", orgId).single()
  const existing = (data as unknown as { custom_roles: string[] } | null)?.custom_roles ?? []
  if (existing.includes(roleValue)) return
  const { error } = await service.from("organisations")
    .update({ custom_roles: [...existing, roleValue] }).eq("id", orgId)
  if (error) console.warn("appendOrgCustomRole:", error.message)
}

// Apply role/additional_roles patch and persist custom role labels. Returns error string or null.
async function applyOrgFieldPatch(
  service: SupabaseClient,
  targetOrgRowId: string,
  orgId: string,
  body: Record<string, unknown>
): Promise<string | null> {
  const orgPatch = buildOrgPatch(body)
  if (Object.keys(orgPatch).length === 0) return null
  const { error } = await service.from("user_orgs").update(orgPatch).eq("id", targetOrgRowId)
  if (error) return `roles: ${error.message}`
  if (typeof orgPatch.role === "string") {
    await appendOrgCustomRole(service, orgId, orgPatch.role)
  }
  return null
}

// PATCH /api/team/member
// Body: { userId, orgId, ...profileFields, ...orgFields, is_admin? }
// Own profile fields (title, name, mobile, emergency): any authenticated org member
// Role changes / editing others: requires isAdmin
// is_admin toggle: owner only
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

  const service = await createServiceClient()

  // Resolve caller membership
  const { data: callerRaw } = await service
    .from("user_orgs")
    .select("role, is_admin")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!callerRaw) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const caller = callerRaw as unknown as { role: string; is_admin: boolean }
  const callerIsOwner = caller.role === "owner"
  const callerIsAdmin = callerIsOwner || caller.is_admin === true
  const isSelfEdit = userId === user.id

  // Non-admin can only edit their own profile fields (no role changes)
  if (!callerIsAdmin && !isSelfEdit) {
    return NextResponse.json({ error: "Admin access required to edit other members" }, { status: 403 })
  }

  // is_admin toggle: owner only
  if ("is_admin" in body && !callerIsOwner) {
    return NextResponse.json({ error: "Only the owner can grant or revoke admin status" }, { status: 403 })
  }

  // Verify target user is a member of the same org
  const { data: targetRaw } = await service
    .from("user_orgs")
    .select("id, role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!targetRaw) {
    return NextResponse.json({ error: "Member not found in org" }, { status: 404 })
  }

  const target = targetRaw as unknown as { id: string; role: string }

  // Prevent changing owner role
  if (target.role === "owner" && body.role && body.role !== "owner") {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 403 })
  }

  const errors: string[] = []

  const profilePatch = buildProfilePatch(body)
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("user_profiles").update(profilePatch).eq("id", userId)
    if (error) errors.push(`profile: ${error.message}`)
  }

  if (callerIsAdmin) {
    const orgErr = await applyOrgFieldPatch(service, target.id, orgId, body)
    if (orgErr) errors.push(orgErr)
  }

  if (callerIsOwner && "is_admin" in body) {
    const { error } = await service
      .from("user_orgs").update({ is_admin: body.is_admin === true }).eq("id", target.id)
    if (error) errors.push(`is_admin: ${error.message}`)
  }

  if (errors.length > 0) return NextResponse.json({ error: errors.join("; ") }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/team/member
// Body: { memberOrgId, orgId }
// Requires: isAdmin (owner or admin)
// Cannot remove self or owner
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { memberOrgId, orgId } = body as { memberOrgId?: string; orgId?: string }
  if (!memberOrgId || !orgId) {
    return NextResponse.json({ error: "memberOrgId and orgId required" }, { status: 400 })
  }

  const service = await createServiceClient()

  // Resolve caller
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
    return NextResponse.json({ error: "Admin access required to remove members" }, { status: 403 })
  }

  // Resolve target
  const { data: targetRaw } = await service
    .from("user_orgs")
    .select("id, role, user_id")
    .eq("id", memberOrgId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!targetRaw) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const target = targetRaw as unknown as { id: string; role: string; user_id: string }

  if (target.user_id === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 })
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 })
  }

  const { error } = await service
    .from("user_orgs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberOrgId)
    .eq("org_id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
