/**
 * app/api/applications/invite-status/[token]/route.ts — the lead's stage-2 status, read for the invite tracker
 *
 * Route:  GET /api/applications/invite-status/[token]
 * Auth:   an unexpired 'shortlist_invite' application_tokens row is the credential (service client — no anon RLS)
 * Data:   application_tokens, applications
 * Notes:  A12. PayFast returns the paying lead to /apply/invite/[token]/status. That page read application_tokens and
 *         applications through the browser client, and both tables carry org-member-only policies, so an applicant
 *         with no session got nothing and the page fell back to "Screening fee paid" for ANY token. This route is the
 *         director-status pattern (../director-status/[token]) for the lead: the same token check as
 *         /api/billing/screening, and only the fields the tracker shows. A deleted or purged application reads as
 *         not found. No screening result and no other party's data leaves here.
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const service = await createServiceClient()

  const { data: tokenRow, error: tokenError } = await service
    .from("application_tokens")
    .select("application_id, expires_at")
    .eq("token", token)
    .eq("token_type", "shortlist_invite")
    .maybeSingle()
  logQueryError("GET application_tokens", tokenError)
  if (tokenError) return NextResponse.json({ error: "Could not load status" }, { status: 503 })
  if (!tokenRow) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (new Date(tokenRow.expires_at) < new Date()) return NextResponse.json({ error: "Token expired" }, { status: 410 })

  const { data: app, error: appError } = await service
    .from("applications")
    .select("id, stage2_status, fee_status, fee_paid_at, fee_amount_cents, deleted_at, pii_purged_at")
    .eq("id", tokenRow.application_id)
    .maybeSingle()
  logQueryError("GET applications", appError)
  if (appError) return NextResponse.json({ error: "Could not load status" }, { status: 503 })
  if (!app || app.deleted_at || app.pii_purged_at) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    reference:    app.id,
    stage2Status: app.stage2_status ?? null,
    // fee_paid_at is the lead line's paid stamp (the ITN writes it); fee_status is the older flag the tracker read.
    feePaid:      !!app.fee_paid_at || app.fee_status === "paid",
    feeCents:     app.fee_amount_cents ?? null,
  })
}
