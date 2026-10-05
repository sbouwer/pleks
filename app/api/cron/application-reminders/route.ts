/**
 * app/api/cron/application-reminders/route.ts — daily application-reminder emails
 *
 * Route:  GET /api/cron/application-reminders
 * Auth:   x-cron-secret header (cPanel curl; Authorization Bearer fallback)
 * Data:   applications, organisations, user_orgs (service client)
 * Notes:  Daily. Triggered by a cPanel curl cron (Vercel Cron removed). Reminds the agent of applications unreviewed
 *         for 24h. The applicant branch (a 3-day nudge to a shortlisted lead, clocked off updated_at) retired into the
 *         14X schedule: the lead is reminded at N2/N4 from its own stage2_invited_at by screening-portal-reminders,
 *         and every attempt is on the trail (ADDENDUM_14X §7, row 32).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendReviewReminder } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { getUserEmail } from "@/lib/auth/userEmail"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { trackSend, settleSends } from "@/lib/cron/settleSends"
import { withCronRun } from "@/lib/cron/withCronRun"
import { SUPABASE_URL, requireEnv } from "@/lib/env"
import { SA_TIMEZONE } from "@/lib/dates"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"

function getServiceClient() {
  return createClient(
    SUPABASE_URL,
    requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  )
}

export const GET = withCronRun("application_reminders", handler)

async function handler(_req: NextRequest): Promise<Response> {

  const service = getServiceClient()
  const now = new Date()
  const sends: Promise<unknown>[] = []   // C-1 belt: collect sends, await + surface failures before return
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // ── 1. Agent review reminders (unreviewed 24h+) ───────────────────────────
  const { data: unreviewedApps, error: unreviewedAppsError } = await service
    .from("applications")
    .select("id, first_name, last_name, prescreen_score, created_at, org_id, listings(public_slug, units(unit_number, properties(name)))")
    .eq("stage1_status", "pre_screen_complete")
    .is("prescreened_at", null)
    .lt("created_at", cutoff24h)
    logQueryError("GET applications", unreviewedAppsError)

  // Group by org
  const byOrg = new Map<string, typeof unreviewedApps>()
  for (const app of (unreviewedApps ?? [])) {
    const existing = byOrg.get(app.org_id as string) ?? []
    existing.push(app)
    byOrg.set(app.org_id as string, existing)
  }

  for (const [orgId, apps] of byOrg.entries()) {
    // Fetch org + agent
    const { data: org, error: orgError } = await service
      .from("organisations")
      .select("name, email, phone, brand_accent_color")
      .eq("id", orgId)
      .single()
    logQueryError("GET organisations", orgError)

    const { data: agentRow, error: agentRowError } = await service
      .from("user_orgs")
      .select("user_id, user_profiles(full_name)")
      .eq("org_id", orgId)
      .eq("role", "agent")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle()
    logQueryError("GET user_orgs", agentRowError)

    const agentProfile = agentRow?.user_profiles as unknown as { full_name: string } | null
    const agentEmail = await getUserEmail(service, agentRow?.user_id as string | null)
    if (!agentEmail) continue

    const branding = buildBranding(await fetchOrgSettings(orgId))
    const pending = (apps ?? []).map((a) => {
      const listing = a.listings as unknown as { units: { unit_number: string; properties: { name: string } } } | null
      const unit = listing?.units
      return {
        name: `${a.first_name} ${a.last_name}`,
        listing: formatPropertyLabel(unit, { fallback: "—" }),
        score: (a.prescreen_score as number) ?? 0,
        appliedAt: new Date(a.created_at as string).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }),
      }
    })

    trackSend(sends, `application-reminders ${orgId}`, sendReviewReminder(
      { orgId, orgName: org?.name ?? "Pleks", agentEmail, agentName: agentProfile?.full_name, branding },
      pending
    ))
  }

  const { sent, failed } = await settleSends(sends)

  return NextResponse.json({
    ok: true,
    reviewReminders: byOrg.size,
    sent, failed,
  })
}
