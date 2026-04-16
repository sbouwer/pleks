import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildWelcomePackData } from "@/lib/reports/welcomePack"
import { generateWelcomePackRecommendations } from "@/lib/reports/welcomePackRecommendations"
import { buildWelcomePackHTML, type WelcomePackToolbar } from "@/lib/reports/generateWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"
import { sendEmail } from "@/lib/comms/send-email"

// ── Shared auth + tier check ──────────────────────────────────────────────────

async function verifyAccess(user: { id: string }, orgId: string) {
  const supabase = await createClient()
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  if (!membership) return { error: "Forbidden" }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS["landlord_welcome_pack"]
  if (!allowed?.includes(tier)) return { error: "Not available on your plan" }

  return { ok: true }
}

// ── GET — render HTML in browser ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const params = req.nextUrl.searchParams
  const orgId = params.get("orgId") ?? ""
  const landlordId = params.get("landlordId") ?? ""

  if (!orgId || !landlordId) {
    return Response.json({ error: "Missing orgId or landlordId" }, { status: 400 })
  }

  const access = await verifyAccess(user, orgId)
  if (access.error) return Response.json({ error: access.error }, { status: 403 })

  const service = await createServiceClient()
  const { data: landlordRow } = await service
    .from("landlord_view")
    .select("email")
    .eq("id", landlordId)
    .maybeSingle()

  const [data, orgInfo] = await Promise.all([
    buildWelcomePackData(orgId, landlordId),
    getReportBranding(orgId),
  ])

  const recs = await generateWelcomePackRecommendations(data)

  const toolbar: WelcomePackToolbar = {
    orgId,
    landlordId,
    landlordName: data.landlord_name,
    landlordEmail: (landlordRow?.email as string | null | undefined) ?? null,
  }

  const html = buildWelcomePackHTML(data, recs, orgInfo, toolbar)

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

// ── POST /send — email the pack to the owner ──────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as { orgId?: string; landlordId?: string }
  const orgId = body.orgId ?? ""
  const landlordId = body.landlordId ?? ""

  if (!orgId || !landlordId) {
    return Response.json({ error: "Missing orgId or landlordId" }, { status: 400 })
  }

  const access = await verifyAccess(user, orgId)
  if (access.error) return Response.json({ error: access.error }, { status: 403 })

  const service = await createServiceClient()
  const { data: landlordRow } = await service
    .from("landlord_view")
    .select("email, first_name, last_name, company_name")
    .eq("id", landlordId)
    .maybeSingle()

  const landlordEmail = (landlordRow?.email as string | null | undefined) ?? null
  if (!landlordEmail) {
    return Response.json({ error: "Owner has no email address on file" }, { status: 422 })
  }

  const companyName = (landlordRow?.company_name as string | null | undefined) ?? null
  const firstName = (landlordRow?.first_name as string | null | undefined) ?? ""
  const lastName  = (landlordRow?.last_name  as string | null | undefined) ?? ""
  const landlordName = companyName ?? (`${firstName} ${lastName}`.trim() || "Owner")

  const [data, orgInfo] = await Promise.all([
    buildWelcomePackData(orgId, landlordId),
    getReportBranding(orgId),
  ])

  const recs = await generateWelcomePackRecommendations(data)
  // Generate without toolbar so the email contains only the report content
  const rawHtml = buildWelcomePackHTML(data, recs, orgInfo)

  const result = await sendEmail({
    orgId,
    templateKey: "reports.welcome_pack",
    to: { email: landlordEmail, name: landlordName },
    subject: `Your Pleks Portfolio Welcome Pack — ${data.landlord_name}`,
    rawHtml,
    bodyPreview: `Portfolio overview for ${data.landlord_name}: ${data.totals.properties} propert${data.totals.properties === 1 ? "y" : "ies"}, ${data.totals.occupied} occupied.`,
    entityType: "landlord",
    entityId: landlordId,
    triggeredBy: user.id,
  })

  if (!result.success) {
    return Response.json({ error: result.error ?? "Failed to send email" }, { status: 500 })
  }

  return Response.json({ success: true })
}
