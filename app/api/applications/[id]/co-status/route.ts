/**
 * app/api/applications/[id]/co-status/route.ts — live completion status of an application's co-applicants.
 *
 * Route:  GET /api/applications/[id]/co-status?token=...
 * Auth:   the primary's application token (the capability) — public/unauthenticated applicant flow.
 * Data:   application_co_applicants (stage1_consent_given per co) for the primary's own application.
 * Notes:  ADDENDUM_14Q — the status hub polls this so a co-applicant's card flips to Completed once THEY finish
 *         their own per-link session. The server is authoritative; the hub's all-green is only an affordance.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { logQueryError } from "@/lib/supabase/logQueryError"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Props { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Props) {
  if (!rateLimit(`co-status:${getClientIp(req)}`, { limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { id } = await params
  const token = new URL(req.url).searchParams.get("token")
  const service = getServiceClient()

  if (!token) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
  const { data: tokenRow, error: tokenErr } = await service
    .from("application_tokens").select("application_id")
    .eq("token", token).eq("application_id", id).gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("co-status token", tokenErr)
  if (!tokenRow) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  const { data: rows, error } = await service
    .from("application_co_applicants")
    .select("applicant_email, first_name, last_name, co_applicant_index, stage1_consent_given, started_at")
    .eq("primary_application_id", id)
    .order("co_applicant_index", { ascending: true })
  logQueryError("co-status load", error)

  // Tri-state for the 14Q hub: completed (consented) → started (clicked their link) → invited (emailed, not opened).
  const coApplicants = (rows ?? []).map((c) => {
    let status: "invited" | "started" | "completed" = "invited"
    if (c.stage1_consent_given === true) status = "completed"
    else if (c.started_at) status = "started"
    return {
      email: (c.applicant_email as string | null) ?? "",
      name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
      completed: status === "completed", // back-compat for any older reader
      status,
    }
  })
  return NextResponse.json({ coApplicants })
}
