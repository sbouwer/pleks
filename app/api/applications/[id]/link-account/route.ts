/**
 * app/api/applications/[id]/link-account/route.ts — bind a just-created applicant account to the application (14R).
 *
 * Route:  POST /api/applications/[id]/link-account   body: { token?: string; ct?: string }
 * Auth:   the authenticated SESSION (the email-OTP signup just established it — getServerUser) PLUS the fill-phase
 *         credential (the lead's app token / a co's access token), resolved + IDOR-guarded via
 *         resolveApplicationCredential. The token proves WHICH application/subject is being completed; the session is
 *         the new auth user to bind. (The resolver's session branch can't be used yet — the tenant↔auth binding is
 *         exactly what this route creates.)
 * Data:   promoteApplicationToTenant (lead) / createTenantFromCoApplicant (co) on a SERVICE client (an applicant is
 *         not an org member). Sets tenants.auth_user_id + applications.tenant_id / co.tenant_id (§4a). Single-
 *         application-scoped (the IDOR guard ensures the credential only ever resolves this caller's own application).
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/auth/server"
import { resolveApplicationCredential } from "@/lib/applications/applicationCredential"
import { promoteApplicationToTenant } from "@/lib/applications/promoteApplicantToTenant"
import { createTenantFromCoApplicant } from "@/lib/applications/createTenantFromCoApplicant"

interface Props { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { token?: string; ct?: string }
  const service = await createServiceClient()

  // Authorise by the FILL credential, IDOR-guarded to THIS application; the session is the new account to bind.
  const cred = await resolveApplicationCredential(service, { applicationId: id, token: body.token, ct: body.ct })
  if (!cred) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 })

  const result = cred.subjectRef === "primary"
    ? await promoteApplicationToTenant(service, id, user.id, user.id)
    : await createTenantFromCoApplicant(cred.subjectRef.slice("co_".length), user.id)

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true, tenantId: result.tenantId })
}
