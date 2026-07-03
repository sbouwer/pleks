/**
 * app/api/reports/welcome-pack/route.ts — render / email a landlord (owner) portfolio welcome pack
 *
 * Route:  GET (HTML preview) / POST (email the pack) /api/reports/welcome-pack
 * Auth:   gateway() (agent session + org membership); tier-gated (landlord_welcome_pack)
 * Data:   landlord_view (org-scoped), buildWelcomePackData/getReportBranding by gateway orgId; POST sends
 *         the pack via sendEmail.
 * Notes:  gateway(), intentionally NOT requireAgentWriteAccess — the send is a comm about the org's own
 *         existing data ("your data, always"), not net-new value creation, so no subscription lockdown.
 *         landlordId is caller-supplied → the landlord is org-scoped before anything is built/sent.
 */
import { NextRequest } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { buildWelcomePackData } from "@/lib/reports/welcomePack"
import { generateWelcomePackRecommendations } from "@/lib/reports/welcomePackRecommendations"
import { buildWelcomePackHTML, type WelcomePackToolbar } from "@/lib/reports/generateWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"
import { sendEmail } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"

function tierAllowsWelcomePack(tier: string | null | undefined): boolean {
  const allowed = REPORT_TIER_ACCESS["landlord_welcome_pack"]
  return !!allowed?.includes(tier ?? "owner")
}

// ── GET — render HTML in browser ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId, tier } = gw

  if (!tierAllowsWelcomePack(tier)) {
    return Response.json({ error: "Not available on your plan" }, { status: 403 })
  }

  const landlordId = req.nextUrl.searchParams.get("landlordId") ?? ""
  if (!landlordId) return Response.json({ error: "Missing landlordId" }, { status: 400 })

  // Org-scope the landlord (landlordId is caller-supplied)
  const { data: landlordRow, error: landlordError } = await db
    .from("landlord_view")
    .select("email")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .maybeSingle()
  logQueryError("GET landlord_view", landlordError)
  if (!landlordRow) return Response.json({ error: "Owner not found" }, { status: 404 })

  const [data, orgInfo] = await Promise.all([
    buildWelcomePackData(orgId, landlordId),
    getReportBranding(orgId),
  ])

  const recs = await generateWelcomePackRecommendations(data)

  const toolbar: WelcomePackToolbar = {
    orgId,
    landlordId,
    landlordName: data.landlord_name,
    landlordEmail: (landlordRow.email as string | null | undefined) ?? null,
  }

  const html = buildWelcomePackHTML(data, recs, orgInfo, toolbar)

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

// ── POST /send — email the pack to the owner ──────────────────────────────────

export async function POST(req: NextRequest) {
  const gw = await gateway()
  if (!gw) return Response.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId, tier } = gw

  if (!tierAllowsWelcomePack(tier)) {
    return Response.json({ error: "Not available on your plan" }, { status: 403 })
  }

  const body = await req.json() as { landlordId?: string }
  const landlordId = body.landlordId ?? ""
  if (!landlordId) return Response.json({ error: "Missing landlordId" }, { status: 400 })

  // Org-scope the landlord (landlordId is caller-supplied)
  const { data: landlordRow, error: landlordError } = await db
    .from("landlord_view")
    .select("email, first_name, last_name, company_name")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .maybeSingle()
  logQueryError("POST landlord_view", landlordError)
  if (!landlordRow) return Response.json({ error: "Owner not found" }, { status: 404 })

  const landlordEmail = (landlordRow.email as string | null | undefined) ?? null
  if (!landlordEmail) {
    return Response.json({ error: "Owner has no email address on file" }, { status: 422 })
  }

  const companyName = (landlordRow.company_name as string | null | undefined) ?? null
  const firstName = (landlordRow.first_name as string | null | undefined) ?? ""
  const lastName  = (landlordRow.last_name  as string | null | undefined) ?? ""
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
    triggeredBy: userId,
  })

  if (!result.success) {
    return Response.json({ error: result.error ?? "Failed to send email" }, { status: 500 })
  }

  return Response.json({ success: true })
}
