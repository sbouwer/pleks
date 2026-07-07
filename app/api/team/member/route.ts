/**
 * app/api/team/member/route.ts — team member role / profile edit (PATCH) + removal (DELETE)
 *
 * Route:  /api/team/member
 * Auth:   authenticated; role/admin changes + removal require caller isAdmin (owner for is_admin)
 * Data:   user_orgs (role/additional_roles/is_admin, soft-delete on removal), user_profiles, audit_log
 * Notes:  Access-control changes (role/admin/removal) are audited via recordAudit — user_orgs is too
 *         broadly mutated for the require-audit ESLint rule, so these are hand-placed. See ADDENDUM_AUDIT_HARDENING.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getMembership } from "@/lib/supabase/getMembership"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { assignableRoleSlugs } from "@/lib/auth/orgRoles"
import { requireStepUp } from "@/lib/auth/step-up"

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

// Apply role/additional_roles patch. Returns error string or null. Role validity (assignable slug) is
// checked by the caller against assignableRoleSlugs — this never mints a role label (custom roles
// originate only from the owner-only Roles tab via saveOrgRole; organisations.custom_roles is deprecated).
async function applyOrgFieldPatch(
  service: SupabaseClient,
  targetOrgRowId: string,
  body: Record<string, unknown>
): Promise<string | null> {
  const orgPatch = buildOrgPatch(body)
  if (Object.keys(orgPatch).length === 0) return null
  const { error } = await service.from("user_orgs").update(orgPatch).eq("id", targetOrgRowId)
  if (error) return `roles: ${error.message}`
  return null
}

// Role change guard (admin-only path): reject owner (transfer-only) and any slug outside the org's
// tier-gated assignable set. Returns an error string (→ 400) or null.
async function validateRoleChange(
  orgId: string, body: Record<string, unknown>, callerIsAdmin: boolean,
): Promise<string | null> {
  if (!callerIsAdmin) return null
  if (!("role" in body) && !("additional_roles" in body)) return null
  const assignable = await assignableRoleSlugs(orgId)

  if (typeof body.role === "string") {
    if (body.role === "owner") return "Ownership transfers via the transfer-ownership flow, not here"
    if (!assignable.has(body.role)) return "That role isn't assignable on this plan"
  }

  // additional_roles was written straight through from the body (ALLOWED_ORG_FIELDS) without validation — an admin
  // could grant a member any slug (incl. "owner" or a higher-tier role) by editing the array. Validate every entry
  // against the org's tier-gated assignable set, same as the single role.
  if ("additional_roles" in body) {
    const extra = body.additional_roles
    if (!Array.isArray(extra) || !extra.every((r) => typeof r === "string")) {
      return "additional_roles must be an array of role slugs"
    }
    if (extra.includes("owner")) return "Ownership transfers via the transfer-ownership flow, not here"
    const invalid = (extra as string[]).find((r) => !assignable.has(r))
    if (invalid) return `Role '${invalid}' isn't assignable on this plan`
  }

  return null
}

// Apply profile + (admin) org-role + (owner) is_admin patches; collect non-fatal errors.
async function applyMemberPatches(
  service: SupabaseClient, target: { id: string }, userId: string,
  body: Record<string, unknown>, callerIsAdmin: boolean, callerIsOwner: boolean,
): Promise<string[]> {
  const errors: string[] = []
  const profilePatch = buildProfilePatch(body)
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("user_profiles").update(profilePatch).eq("id", userId)
    if (error) errors.push(`profile: ${error.message}`)
  }
  if (callerIsAdmin) {
    const orgErr = await applyOrgFieldPatch(service, target.id, body)
    if (orgErr) errors.push(orgErr)
  }
  if (callerIsOwner && "is_admin" in body) {
    const { error } = await service.from("user_orgs").update({ is_admin: body.is_admin === true }).eq("id", target.id)
    if (error) errors.push(`is_admin: ${error.message}`)
  }
  return errors
}

// Reactivate a soft-deleted member: clear deleted_at (owner-only). Re-granting access → audited.
async function handleReactivate(
  service: SupabaseClient, actorId: string, orgId: string, callerIsOwner: boolean, body: Record<string, unknown>,
): Promise<NextResponse> {
  const { memberOrgId } = body as { memberOrgId?: string }
  if (!memberOrgId) return NextResponse.json({ error: "memberOrgId required" }, { status: 400 })
  if (!callerIsOwner) return NextResponse.json({ error: "Only the owner can reactivate members" }, { status: 403 })
  const { data: inactiveRaw, error: inactiveErr } = await service
    .from("user_orgs").select("id, role, user_id")
    .eq("id", memberOrgId).eq("org_id", orgId).not("deleted_at", "is", null).single()
  logQueryError("PATCH reactivate user_orgs", inactiveErr)
  if (!inactiveRaw) return NextResponse.json({ error: "Inactive member not found" }, { status: 404 })
  const t = inactiveRaw as unknown as { id: string; role: string; user_id: string }
  const { error } = await service.from("user_orgs").update({ deleted_at: null }).eq("id", memberOrgId).eq("org_id", orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recordAudit(service, {
    orgId, actorId, action: "UPDATE", table: "user_orgs", recordId: memberOrgId,
    after: { action: "member_reactivated", target_user_id: t.user_id, role: t.role },
  })
  return NextResponse.json({ ok: true })
}

// Access-control changes (role / additional_roles / is_admin / member removal) are re-auth-gated
// (ADDENDUM_AUTH_HARDENING Finding 1.2) — additive to the isAdmin/owner checks. Returns a 401 challenge when
// step-up is needed and unverified; null to proceed.
async function teamRoleStepUp(userId: string, resourceId: string, token: unknown): Promise<NextResponse | null> {
  const stepUp = await requireStepUp({
    userId, action: "team_role_change", resourceId, providedToken: typeof token === "string" ? token : undefined,
  })
  return stepUp.verified ? null : NextResponse.json({ challengeToken: stepUp.challengeToken }, { status: 401 })
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
  if (!orgId) {
    return NextResponse.json({ error: "orgId required" }, { status: 400 })
  }

  const service = await createServiceClient()

  // Resolve caller membership (resilient — works before and after is_admin migration)
  const caller = await getMembership(service, user.id, orgId)
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const callerIsOwner = caller.role === "owner"
  const callerIsAdmin = caller.isAdmin

  // Reactivate a soft-deleted member (owner-only) — re-granting access is audited, like role-change/removal.
  if (body.reactivate === true) {
    return handleReactivate(service, user.id, orgId, callerIsOwner, body)
  }

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })
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
  const { data: targetRaw, error: targetRawError } = await service
    .from("user_orgs")
    .select("id, role")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
    logQueryError("PATCH user_orgs", targetRawError)

  if (!targetRaw) {
    return NextResponse.json({ error: "Member not found in org" }, { status: 404 })
  }

  const target = targetRaw as unknown as { id: string; role: string }

  // Prevent changing owner role
  if (target.role === "owner" && body.role && body.role !== "owner") {
    return NextResponse.json({ error: "Cannot change owner role" }, { status: 403 })
  }

  // Role change: validate against the org's assignable set (tier-gated, enabled, owner excluded) server-side.
  // The client picker is tier-gated for convenience; this is the actual guard against a forged/free-typed slug.
  const roleErr = await validateRoleChange(orgId, body, callerIsAdmin)
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 400 })

  // Step-up on access-control changes (not pure profile self-edits).
  if ("role" in body || "additional_roles" in body || "is_admin" in body) {
    const challenge = await teamRoleStepUp(user.id, target.id, body.stepUpToken)
    if (challenge) return challenge
  }

  const errors = await applyMemberPatches(service, target, userId, body, callerIsAdmin, callerIsOwner)
  if (errors.length > 0) return NextResponse.json({ error: errors.join("; ") }, { status: 500 })

  // Audit access-control changes (role / additional_roles / is_admin) — not pure profile edits.
  const accessChanged = "role" in body || "additional_roles" in body || "is_admin" in body
  if (accessChanged) {
    await recordAudit(service, {
      orgId, actorId: user.id, action: "UPDATE", table: "user_orgs", recordId: target.id,
      after: {
        action: "member_access_updated", target_user_id: userId,
        role: body.role, additional_roles: body.additional_roles, is_admin: body.is_admin,
      },
    })
  }

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

  const caller = await getMembership(service, user.id, orgId)
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!caller.isAdmin) {
    return NextResponse.json({ error: "Admin access required to remove members" }, { status: 403 })
  }

  // Resolve target
  const { data: targetRaw, error: targetRawError } = await service
    .from("user_orgs")
    .select("id, role, user_id")
    .eq("id", memberOrgId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
    logQueryError("DELETE user_orgs", targetRawError)

  if (!targetRaw) return NextResponse.json({ error: "Member not found" }, { status: 404 })

  const target = targetRaw as unknown as { id: string; role: string; user_id: string }

  if (target.user_id === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 })
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 })
  }

  const challenge = await teamRoleStepUp(user.id, memberOrgId, body.stepUpToken)
  if (challenge) return challenge

  const { error } = await service
    .from("user_orgs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", memberOrgId)
    .eq("org_id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit(service, {
    orgId, actorId: user.id, action: "DELETE", table: "user_orgs", recordId: memberOrgId,
    after: { action: "member_removed", target_user_id: target.user_id, role: target.role },
  })

  return NextResponse.json({ ok: true })
}
