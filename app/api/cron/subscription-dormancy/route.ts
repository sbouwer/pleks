/**
 * app/api/cron/subscription-dormancy/route.ts — Owner-free dormancy step (ADDENDUM_57G §11.2)
 *
 * Route:  GET /api/cron/subscription-dormancy
 * Auth:   x-cron-secret header
 * Data:   find_dormant_org_candidates RPC (auth.users join), organisations table; service client
 * Notes:  Called from daily orchestrator. Targets Owner-free orgs (no subscription
 *         or Owner-tier subscription) that have been dormant for ≥60 days with
 *         zero data. Timeline: day 60 → warning, day 90 → final, day 91 → purge.
 *         Purge delegated to purgeOrg() (Step 8) — dormancy step only flags and sends.
 *         Idempotent via dormancy_warning_sent_at / dormancy_final_sent_at columns.
 *         Dormancy determined via find_dormant_org_candidates / find_dormancy_final_candidates
 *         RPCs which join auth.users (inaccessible from JS client directly).
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding } from "@/lib/comms/send-email"
import { sendDormancyWarning, sendDormancyFinal } from "@/lib/subscriptions/emails"

const DORMANCY_DAYS       = parseInt(process.env.DORMANCY_DAYS       ?? "60", 10)
const DORMANCY_WARN_DAYS  = parseInt(process.env.DORMANCY_WARN_DAYS  ?? "30", 10)
const DORMANCY_FINAL_DAYS = parseInt(process.env.DORMANCY_FINAL_DAYS ?? "1",  10)

type SupabaseClient = Awaited<ReturnType<typeof createServiceClient>>
type OrgRow = Record<string, unknown> & { id: string; name: string }

async function fetchOrgContact(supabase: SupabaseClient, orgId: string, orgName: string, orgRow: Record<string, unknown> | null) {
  const { data: adminRow } = await supabase
    .from("user_orgs")
    .select("user_profiles(email, full_name)")
    .eq("org_id", orgId)
    .in("role", ["owner", "agent"])
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  const profile = adminRow?.user_profiles as unknown as { email: string; full_name?: string } | null
  if (!profile?.email) return null

  return {
    orgId,
    orgName,
    adminEmail: profile.email,
    adminName: profile.full_name ?? undefined,
    branding: buildBranding(orgRow as Parameters<typeof buildBranding>[0]),
  }
}

async function processFirstWarningOrg(supabase: SupabaseClient, org: OrgRow, now: Date): Promise<boolean> {
  const [{ count: propCount }, { count: leaseCount }, { count: appCount }] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }).eq("org_id", org.id),
    supabase.from("leases").select("*", { count: "exact", head: true }).eq("org_id", org.id),
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("org_id", org.id),
  ])
  if ((propCount ?? 0) > 0 || (leaseCount ?? 0) > 0 || (appCount ?? 0) > 0) return false

  const purgeDateStr = new Date(now.getTime() + DORMANCY_WARN_DAYS * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

  const contact = await fetchOrgContact(supabase, org.id, org.name, org)
  if (!contact) return false

  const { error: updateErr } = await supabase
    .from("organisations")
    .update({ dormancy_warning_sent_at: now.toISOString() })
    .eq("id", org.id)
  if (updateErr) {
    console.error("subscription-dormancy: warn update failed for", org.id, updateErr.message)
    return false
  }
  await supabase.from("audit_log").insert({
    org_id: org.id,
    table_name: "organisations",
    record_id: org.id,
    action: "UPDATE",
    new_values: { action: "dormancy_warning_sent", purge_date: purgeDateStr },
  })
  void sendDormancyWarning(contact, purgeDateStr)
  return true
}

async function processFinalWarningOrg(
  supabase: SupabaseClient,
  org: OrgRow & { dormancy_warning_sent_at: string; last_member_login: string | null },
  now: Date,
): Promise<boolean> {
  const purgeDateStr = new Date(now.getTime() + DORMANCY_FINAL_DAYS * 24 * 60 * 60 * 1000)
    .toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })

  const contact = await fetchOrgContact(supabase, org.id, org.name, org)
  if (!contact) return false

  const { error: updateErr } = await supabase
    .from("organisations")
    .update({ dormancy_final_sent_at: now.toISOString() })
    .eq("id", org.id)
  if (updateErr) {
    console.error("subscription-dormancy: final update failed for", org.id, updateErr.message)
    return false
  }
  await supabase.from("audit_log").insert({
    org_id: org.id,
    table_name: "organisations",
    record_id: org.id,
    action: "UPDATE",
    new_values: { action: "dormancy_final_sent", purge_date: purgeDateStr },
  })
  void sendDormancyFinal(contact, purgeDateStr)
  return true
}

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const dormancyCutoffIso  = new Date(now.getTime() - DORMANCY_DAYS      * 24 * 60 * 60 * 1000).toISOString()
  const warnPurgeCutoffIso = new Date(now.getTime() - DORMANCY_WARN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  let warned = 0
  let finalSent = 0

  // §11.2 — First dormancy warning (day 60 of no logins + no data)
  // RPC joins auth.users (inaccessible from JS client) to find orgs whose most
  // recent member login is older than the cutoff (or who have never logged in).
  const { data: dormantOrgs, error: dormantErr } = await supabase
    .rpc("find_dormant_org_candidates", { cutoff_iso: dormancyCutoffIso })

  if (dormantErr) {
    console.error("subscription-dormancy: first-warning query failed:", dormantErr.message)
    return Response.json({ ok: false, error: dormantErr.message }, { status: 500 })
  }

  for (const org of dormantOrgs ?? []) {
    if (await processFirstWarningOrg(supabase, org as OrgRow, now)) warned++
  }

  // §11.2 — Final dormancy warning (day 90 — 1 day before purge)
  // RPC returns only orgs whose last member login is on or before the warning date,
  // so the JS side no longer needs to filter on last_login_at.
  const { data: finalOrgs, error: finalErr } = await supabase
    .rpc("find_dormancy_final_candidates", { cutoff_iso: warnPurgeCutoffIso })

  if (finalErr) {
    console.error("subscription-dormancy: final-warning query failed:", finalErr.message)
  } else {
    for (const org of finalOrgs ?? []) {
      const typedOrg = org as OrgRow & { dormancy_warning_sent_at: string; last_member_login: string | null }
      if (await processFinalWarningOrg(supabase, typedOrg, now)) finalSent++
    }
  }

  return Response.json({ ok: true, dormancy_warned: warned, dormancy_final_sent: finalSent })
}
