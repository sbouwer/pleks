import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { buildWelcomePackData } from "@/lib/reports/welcomePack"
import { generateWelcomePackRecommendations } from "@/lib/reports/welcomePackRecommendations"
import { buildWelcomePackHTML } from "@/lib/reports/generateWelcomePackHTML"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { REPORT_TIER_ACCESS } from "@/lib/reports/types"

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

  // Verify membership
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  // Verify tier
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier")
    .eq("org_id", orgId)
    .eq("status", "active")
    .single()

  const tier = sub?.tier ?? "owner"
  const allowed = REPORT_TIER_ACCESS["landlord_welcome_pack"]
  if (!allowed?.includes(tier)) {
    return Response.json({ error: "Not available on your plan" }, { status: 403 })
  }

  const [data, orgInfo] = await Promise.all([
    buildWelcomePackData(orgId, landlordId),
    getReportBranding(orgId),
  ])

  const recs = await generateWelcomePackRecommendations(data)
  const html = buildWelcomePackHTML(data, recs, orgInfo)

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}
