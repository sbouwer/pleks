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
import { classifyPurgeWarning } from "@/lib/subscriptions/purgeWarningGate"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"
import { fmtDateLongZA } from "@/lib/dates"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"

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

/**
 * true = the org has active leases · false = it provably has none · null = COULD NOT TELL.
 *
 * The third state is load-bearing. This gate is what stops a purge warning — and the
 * `purge_eligible_at` stamp that starts a 30-day data-destruction countdown — from reaching an org
 * that is still trading. The previous body ended `return (count ?? 0) > 0`, so a timeout or an RLS
 * fault answered "no active leases" and the countdown began on a query error. Every caller treats
 * anything other than a definite `false` as "do not warn": an org wrongly left alone is a cron run
 * that retries tomorrow, an org wrongly warned is a customer told their data will be deleted.
 */
async function hasActiveLeases(supabase: SupabaseClient, orgId: string): Promise<boolean | null> {
  const { count, error } = await supabase
    .from("leases")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active")
  if (error) {
    console.error("subscription-purge-warnings: active-lease check failed for", orgId, error.message)
    return null
  }
  return (count ?? 0) > 0
}

async function processWarn30dSub(
  supabase: SupabaseClient,
  sub: { id: string; org_id: string; cancelled_at: string | null },
  now: Date,
): Promise<boolean> {
  const active = await hasActiveLeases(supabase, sub.org_id)
  if (active !== false) return false   // true = still trading; null = unreadable — never warn on an unknown

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
    const cancelledDateStr = fmtDateLongZA(sub.cancelled_at ?? "")
    const purgeEligibleStr = fmtDateLongZA(purgeEligibleAt)
    await sendPurgeWarning30d(contact, {
      cancelledDate:   cancelledDateStr,
      purgeEligibleAt: purgeEligibleStr,
      daysUntilPurge:  30,
      exportUrl:       absoluteUrl("/reports"),
      settingsUrl:     absoluteUrl("/settings/subscription"),
    }).catch((e) => console.error("[subscription-purge-warnings] 30d warning send failed for", sub.org_id, e instanceof Error ? e.message : String(e)))
  }
  await recordAudit(supabase, { orgId: sub.org_id, table: "subscriptions", recordId: sub.org_id, action: "UPDATE", after: { action: "subscription_purge_warned", purge_eligible_at: purgeEligibleAt.toISOString() } })
  return true
}

async function processFinalWarnSub(
  supabase: SupabaseClient,
  sub: { id: string; org_id: string; cancelled_at: string | null; purge_eligible_at: string | null },
): Promise<boolean> {
  const active = await hasActiveLeases(supabase, sub.org_id)
  if (active !== false) return false   // true = still trading; null = unreadable — never warn on an unknown

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
      ? fmtDateLongZA(sub.cancelled_at)
      : ""
    const purgeEligibleStr = fmtDateLongZA(sub.purge_eligible_at ?? "")
    await sendPurgeWarningFinal(contact, {
      cancelledDate:   cancelledDateStr,
      purgeEligibleAt: purgeEligibleStr,
      daysUntilPurge:  1,
      exportUrl:       absoluteUrl("/reports"),
      settingsUrl:     absoluteUrl("/settings/subscription"),
    }).catch((e) => console.error("[subscription-purge-warnings] final warning send failed for", sub.org_id, e instanceof Error ? e.message : String(e)))
  }
  await recordAudit(supabase, { orgId: sub.org_id, table: "subscriptions", recordId: sub.org_id, action: "UPDATE", after: { action: "subscription_purge_final_warned" } })
  return true
}

/**
 * M-074 — purge is gated on the 30-day warning having actually been delivered.
 *
 * `purge_eligible_at` is set by processWarn30dSub BEFORE the send is attempted, and is set even
 * when the org has no contact and no send happens at all. Reaching the date therefore says nothing
 * about whether the org was warned. Counsel's ruling made the warning a condition of the Day-0
 * notice being sufficient, so purging unwarned collapses a two-stage disclosure into one stage
 * after the fact.
 *
 * Returns "purged" | "deferred" | "skipped" rather than a boolean, because the caller has to COUNT
 * deferrals separately to get them in front of a human. A deferral that only increments nothing is
 * the log-and-continue this entry was filed against.
 */
async function processPurgeDueSub(
  supabase: SupabaseClient,
  sub: { id: string; org_id: string },
): Promise<"purged" | "deferred" | "skipped"> {
  const active = await hasActiveLeases(supabase, sub.org_id)
  // A definite "no active leases" is the only state that may proceed to a purge. `null` is DEFERRED,
  // not skipped: skipped is a quiet no-op, and an unreadable lease state on a destructive path is
  // exactly the thing the deferral channel exists to put in front of a human.
  if (active === true) return "skipped"
  if (active === null) return "deferred"

  // Most recent first: a re-send after a bounce should be able to open the gate the bounce closed.
  const { data: warningRows, error: warningErr } = await supabase
    .from("communication_log")
    .select("status, created_at")
    .eq("org_id", sub.org_id)
    .eq("template_key", "subscription.purge_warning_30d")
    .order("created_at", { ascending: false })
    .limit(1)
  logQueryError("processPurgeDueSub communication_log", warningErr)

  // A FAILED QUERY IS NOT AN ABSENT WARNING. Treating the error case as "no row" would defer every
  // org on a transient DB blip, and a deferral is not a free no-op — it is an item a human chases.
  if (warningErr) return "skipped"

  const warning = warningRows?.[0] ?? null
  const { contact } = warning ? { contact: null } : await fetchOrgContact(supabase, sub.org_id)
  const gate = classifyPurgeWarning(warning, contact !== null)

  if (!gate.ok) {
    const { error: deferErr } = await supabase
      .from("subscriptions")
      .update({ purge_deferred_at: new Date().toISOString(), purge_deferred_reason: gate.reason })
      .eq("id", sub.id)
      .eq("org_id", sub.org_id)
    logQueryError("processPurgeDueSub defer update", deferErr)
    await recordAudit(supabase, {
      orgId: sub.org_id, table: "subscriptions", recordId: sub.org_id, action: "UPDATE",
      after: { action: "subscription_purge_deferred", reason: gate.reason },
    })
    console.error(`[subscription-purge-warnings] purge DEFERRED for ${sub.org_id} — ${gate.reason}`)
    return "deferred"
  }

  // Clear any stale deferral: the warning has since been established, so the item is resolved and
  // must stop being reported. A deferral flag nobody ever clears trains its reader to ignore it.
  const { error: clearErr } = await supabase
    .from("subscriptions")
    .update({ purge_deferred_at: null, purge_deferred_reason: null })
    .eq("id", sub.id)
    .eq("org_id", sub.org_id)
  logQueryError("processPurgeDueSub clear deferral", clearErr)

  await purgeOrg(sub.org_id, "cancelled_tail")
  return "purged"
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

async function runCancelledPurgeScan(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ purged: number; deferred: number }> {
  const { data: purgeDue, error: purgeErr } = await supabase
    .from("subscriptions")
    .select("id, org_id, cancelled_at")
    .eq("status", "cancelled")
    .not("purge_eligible_at", "is", null)
    .lt("purge_eligible_at", now.toISOString())

  if (purgeErr) {
    console.error("subscription-purge-warnings: purge-due query failed:", purgeErr.message)
    return { purged: 0, deferred: 0 }
  }
  let purged = 0
  let deferred = 0
  for (const sub of purgeDue ?? []) {
    const outcome = await processPurgeDueSub(supabase, sub)
    if (outcome === "purged") purged++
    else if (outcome === "deferred") deferred++
  }
  return { purged, deferred }
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
  const cancelledTail  = await runCancelledPurgeScan(supabase, now)
  const purgeTriggered = cancelledTail.purged + (await runDormancyPurgeScan(supabase, now))

  // `deferred` is read by the daily orchestrator's runJob and lands in the cron digest (M-074
  // part 3). It is NOT folded into `failed`: a deferral is a held-back purge needing a human, not
  // an email that failed to send, and a digest that cannot tell them apart cannot be acted on.
  return Response.json({
    ok: true,
    warned_30d:      warned30d,
    warned_final:    warnedFinal,
    purge_triggered: purgeTriggered,
    deferred:        cancelledTail.deferred,
  })
}
