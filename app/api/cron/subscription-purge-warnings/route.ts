/**
 * app/api/cron/subscription-purge-warnings/route.ts — Purge-warning step (ADDENDUM_57G §11.3)
 *
 * Route:  GET /api/cron/subscription-purge-warnings
 * Auth:   x-cron-secret header
 * Data:   subscriptions table; service client (bypasses RLS)
 * Notes:  Called from daily orchestrator. Handles the cancelled-tail track:
 *           month 11 → 30-day warning + set purge_eligible_at
 *           day before purge_eligible_at → final warning
 *           purge_eligible_at passed → delegate to purgeOrg() (Step 8)
 *         Hard gate: zero active leases blocks all transitions.
 *         Dormancy purge (owner-free) also triggered here for orgs past final notice.
 *         Idempotent via purge_warning_sent_at column.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { getUserEmail } from "@/lib/auth/userEmail"
import {
  sendPurgeWarning30d,
  sendPurgeWarningFinal,
} from "@/lib/subscriptions/emails"
import { purgeOrg } from "@/lib/subscriptions/purge"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"
const ELEVEN_MONTHS_MS = 11 * 30 * 24 * 60 * 60 * 1000

type SupabaseClient = Awaited<ReturnType<typeof createServiceClient>>

async function fetchOrgContact(supabase: SupabaseClient, orgId: string) {
  const [{ data: org }, { data: adminRow }] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, email, phone, brand_accent_color")
      .eq("id", orgId)
      .single(),
    supabase
      .from("user_orgs")
      .select("user_id, user_profiles(full_name)")
      .eq("org_id", orgId)
      .in("role", ["owner", "agent"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const profile = adminRow?.user_profiles as unknown as { full_name?: string } | null
  const adminEmail = await getUserEmail(supabase, adminRow?.user_id as string | null)
  if (!adminEmail) return { contact: null, org }
  return {
    contact: {
      orgId,
      orgName: org?.name ?? "Pleks",
      adminEmail,
      adminName: profile?.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(orgId)),
    },
    org,
  }
}

async function hasActiveLeases(supabase: SupabaseClient, orgId: string): Promise<boolean> {
  const { count } = await supabase
    .from("leases")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active")
  return (count ?? 0) > 0
}

async function processWarn30dSub(
  supabase: SupabaseClient,
  sub: { id: string; org_id: string; cancelled_at: string | null },
  now: Date,
): Promise<boolean> {
  if (await hasActiveLeases(supabase, sub.org_id)) return false

  const purgeEligibleAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const { error: updateErr } = await supabase
    .from("subscriptions")
    .update({
      purge_warning_sent_at: now.toISOString(),
      purge_eligible_at:     purgeEligibleAt.toISOString(),
    })
    .eq("id", sub.id)
  if (updateErr) {
    console.error("subscription-purge-warnings: warn update failed for", sub.org_id, updateErr.message)
    return false
  }

  const { contact } = await fetchOrgContact(supabase, sub.org_id)
  if (contact) {
    const cancelledDateStr = new Date(sub.cancelled_at ?? "").toLocaleDateString("en-ZA", {
      day: "numeric", month: "long", year: "numeric",
    })
    const purgeEligibleStr = purgeEligibleAt.toLocaleDateString("en-ZA", {
      day: "numeric", month: "long", year: "numeric",
    })
    await sendPurgeWarning30d(contact, {
      cancelledDate:   cancelledDateStr,
      purgeEligibleAt: purgeEligibleStr,
      daysUntilPurge:  30,
      exportUrl:       `${APP_URL}/reports`,
      settingsUrl:     `${APP_URL}/settings/subscription`,
    }).catch((e) => console.error("[subscription-purge-warnings] 30d warning send failed for", sub.org_id, e instanceof Error ? e.message : String(e)))
  }
  await supabase.from("audit_log").insert({
    org_id: sub.org_id,
    table_name: "subscriptions",
    record_id: sub.org_id,
    action: "UPDATE",
    new_values: { action: "subscription_purge_warned", purge_eligible_at: purgeEligibleAt.toISOString() },
  })
  return true
}

async function processFinalWarnSub(
  supabase: SupabaseClient,
  sub: { id: string; org_id: string; cancelled_at: string | null; purge_eligible_at: string | null },
): Promise<boolean> {
  if (await hasActiveLeases(supabase, sub.org_id)) return false

  const { data: prior, error: priorError } = await supabase
    .from("communication_log")
    .select("id")
    .eq("org_id", sub.org_id)
    .eq("template_key", "subscription.purge_warning_final")
    .limit(1)
    logQueryError("processFinalWarnSub communication_log", priorError)
  if (prior && prior.length > 0) return false

  const { contact } = await fetchOrgContact(supabase, sub.org_id)
  if (contact) {
    const cancelledDateStr = sub.cancelled_at
      ? new Date(sub.cancelled_at).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      : ""
    const purgeEligibleStr = new Date(sub.purge_eligible_at ?? "").toLocaleDateString("en-ZA", {
      day: "numeric", month: "long", year: "numeric",
    })
    await sendPurgeWarningFinal(contact, {
      cancelledDate:   cancelledDateStr,
      purgeEligibleAt: purgeEligibleStr,
      daysUntilPurge:  1,
      exportUrl:       `${APP_URL}/reports`,
      settingsUrl:     `${APP_URL}/settings/subscription`,
    }).catch((e) => console.error("[subscription-purge-warnings] final warning send failed for", sub.org_id, e instanceof Error ? e.message : String(e)))
  }
  await supabase.from("audit_log").insert({
    org_id: sub.org_id,
    table_name: "subscriptions",
    record_id: sub.org_id,
    action: "UPDATE",
    new_values: { action: "subscription_purge_final_warned" },
  })
  return true
}

async function processPurgeDueSub(supabase: SupabaseClient, sub: { org_id: string }): Promise<boolean> {
  if (await hasActiveLeases(supabase, sub.org_id)) return false
  await purgeOrg(sub.org_id, "cancelled_tail")
  return true
}

function dormancyPurgeIsBlocked(lastLogin: Date | null, dormancyWarningSentAt: string | null): boolean {
  const warnedAt = new Date(dormancyWarningSentAt ?? "")
  return !!(lastLogin && lastLogin > warnedAt)
}

/**
 * Org last-active = MAX(auth.users.last_sign_in_at) across its members (ADDENDUM_PHANTOM_COLUMN_TAIL:
 * derive, don't denormalise a last_login_at column). organisations has no last_login_at.
 */
async function orgLastActive(supabase: SupabaseClient, orgId: string): Promise<Date | null> {
  const { data: members, error } = await supabase.from("user_orgs").select("user_id").eq("org_id", orgId).is("deleted_at", null)
  if (error) console.error("orgLastActive user_orgs:", error.message)
  let latest: Date | null = null
  for (const m of members ?? []) {
    const { data } = await supabase.auth.admin.getUserById(m.user_id as string)
    const ts = data.user?.last_sign_in_at
    if (ts) {
      const d = new Date(ts)
      if (!latest || d > latest) latest = d
    }
  }
  return latest
}

async function runFinalWarnScan(supabase: SupabaseClient, now: Date): Promise<number> {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const { data: finalSubs, error: finalErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, cancelled_at, purge_eligible_at")
    .eq("status", "cancelled")
    .not("purge_warning_sent_at", "is", null)
    .gte("purge_eligible_at", now.toISOString())
    .lte("purge_eligible_at", tomorrow.toISOString())

  if (finalErr) {
    console.error("subscription-purge-warnings: final query failed:", finalErr.message)
    return 0
  }
  let count = 0
  for (const sub of finalSubs ?? []) {
    if (await processFinalWarnSub(supabase, sub)) count++
  }
  return count
}

async function runCancelledPurgeScan(supabase: SupabaseClient, now: Date): Promise<number> {
  const { data: purgeDue, error: purgeErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, cancelled_at")
    .eq("status", "cancelled")
    .not("purge_eligible_at", "is", null)
    .lt("purge_eligible_at", now.toISOString())

  if (purgeErr) {
    console.error("subscription-purge-warnings: purge-due query failed:", purgeErr.message)
    return 0
  }
  let count = 0
  for (const sub of purgeDue ?? []) {
    if (await processPurgeDueSub(supabase, sub)) count++
  }
  return count
}

async function runDormancyPurgeScan(supabase: SupabaseClient, now: Date): Promise<number> {
  const { data: dormancyPurgeDue, error: dormErr } = await supabase
    .from("organisations")
    .select("id, dormancy_warning_sent_at, dormancy_final_sent_at")
    .not("dormancy_final_sent_at", "is", null)
    .lt("dormancy_final_sent_at", now.toISOString())
    .is("deleted_at", null)  // skip already-purged / claim-slot-reserved orgs

  if (dormErr) {
    console.error("subscription-purge-warnings: dormancy purge query failed:", dormErr.message)
    return 0
  }
  let count = 0
  for (const org of dormancyPurgeDue ?? []) {
    const lastLogin = await orgLastActive(supabase, org.id)
    if (dormancyPurgeIsBlocked(lastLogin, org.dormancy_warning_sent_at)) continue
    await purgeOrg(org.id, "dormancy")
    count++
  }
  return count
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  const now = new Date()
  let warned30d = 0

  // §11.3 — Cancelled orgs at month 11: send 30-day warning + set purge_eligible_at
  const elevenMonthsAgo = new Date(now.getTime() - ELEVEN_MONTHS_MS)
  const { data: cancelledSubs, error: cancelErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, cancelled_at")
    .eq("status", "cancelled")
    .is("purge_warning_sent_at", null)
    .lt("cancelled_at", elevenMonthsAgo.toISOString())

  if (cancelErr) {
    console.error("subscription-purge-warnings: cancelled query failed:", cancelErr.message)
    return Response.json({ ok: false, error: cancelErr.message }, { status: 500 })
  }

  for (const sub of cancelledSubs ?? []) {
    if (await processWarn30dSub(supabase, sub, now)) warned30d++
  }

  // §11.3 — Final warning + purge-due + dormancy purge delegated to scan helpers
  const warnedFinal    = await runFinalWarnScan(supabase, now)
  const purgeTriggered = (await runCancelledPurgeScan(supabase, now))
                       + (await runDormancyPurgeScan(supabase, now))

  return Response.json({
    ok: true,
    warned_30d:      warned30d,
    warned_final:    warnedFinal,
    purge_triggered: purgeTriggered,
  })
}
