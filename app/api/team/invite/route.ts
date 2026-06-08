/**
 * app/api/team/invite/route.ts — create (POST) + revoke (DELETE) team-member invites
 *
 * Route:  /api/team/invite
 * Auth:   authenticated org member; both create + revoke require caller isAdmin (owner/admin)
 * Data:   invites (insert with token + 7-day expiry / delete), audit_log; email via the comm sender
 * Notes:  An invite is an access-control GRANT — audited (no PII in audit values; the email lives on the
 *         row). Accept link points at /invite/[token] (lib/actions/invite.ts handles acceptance).
 */
import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getMembership } from "@/lib/supabase/getMembership"
import { recordAudit } from "@/lib/audit/recordAudit"
import { sendEmail } from "@/lib/comms/send-email"

// POST /api/team/invite
// Body: { email, role, orgId }
// Requires: isAdmin (owner or admin). Creates an invite (token + 7-day expiry), audits the grant, emails it.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { email, role, orgId } = body as { email?: string; role?: string; orgId?: string }
  const cleanEmail = email?.trim().toLowerCase()
  if (!cleanEmail || !role || !orgId) {
    return NextResponse.json({ error: "email, role and orgId required" }, { status: 400 })
  }

  const service = await createServiceClient()

  const caller = await getMembership(service, user.id, orgId)
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!caller.isAdmin) {
    return NextResponse.json({ error: "Admin access required to invite members" }, { status: 403 })
  }

  const token = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: invite, error } = await service
    .from("invites")
    .insert({ org_id: orgId, email: cleanEmail, role, token, invited_by: user.id, expires_at: expiresAt })
    .select("id")
    .single()
  if (error || !invite) return NextResponse.json({ error: error?.message ?? "Failed to create invite" }, { status: 500 })

  // Audit the access-control GRANT (no PII in values — the email lives on the invites row).
  await recordAudit(service, {
    orgId, actorId: user.id, action: "INSERT", table: "invites", recordId: invite.id as string,
    after: { action: "invite_sent", role },
  })

  // Email the invitee with the accept link. Best-effort — the invite exists regardless of email outcome.
  const { data: org, error: orgErr } = await service.from("organisations").select("name").eq("id", orgId).single()
  if (orgErr) console.error("[team invite] org name read failed:", orgErr.message)
  const orgName = (org?.name as string | undefined) ?? "your team"
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"
  const acceptUrl = `${base}/invite/${token}`
  const roleLabel = role.replaceAll("_", " ")
  try {
    await sendEmail({
      orgId,
      templateKey: "team.member_invite",
      to: { email: cleanEmail, name: cleanEmail },
      subject: `You've been invited to join ${orgName} on Pleks`,
      rawHtml: `
        <p>Hi,</p>
        <p>You've been invited to join <strong>${orgName}</strong> on Pleks as <strong>${roleLabel}</strong>.</p>
        <p><a href="${acceptUrl}" style="display:inline-block;padding:10px 16px;background:#1a1a1a;color:#fff;border-radius:3px;text-decoration:none;font-weight:600">Accept invitation</a></p>
        <p>Or paste this link into your browser:<br/><a href="${acceptUrl}">${acceptUrl}</a></p>
        <p style="color:#888;font-size:13px">This invitation expires in 7 days.</p>
      `,
    })
  } catch (e) {
    console.error("[team invite] email send failed:", e)
  }

  return NextResponse.json({ ok: true })
}

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

  const caller = await getMembership(service, user.id, orgId)
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!caller.isAdmin) {
    return NextResponse.json({ error: "Admin access required to revoke invites" }, { status: 403 })
  }

  const { error } = await service
    .from("invites")
    .delete()
    .eq("id", inviteId)
    .eq("org_id", orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Revoking a pending invite is an access-control event — audit it.
  await recordAudit(service, {
    orgId, actorId: user.id, action: "DELETE", table: "invites", recordId: inviteId,
    after: { action: "invite_revoked" },
  })

  return NextResponse.json({ ok: true })
}
