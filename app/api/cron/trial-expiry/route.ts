/**
 * app/api/cron/trial-expiry/route.ts — daily cron: revert expired trials to Owner + send trial/founding warnings
 *
 * Route:  /api/cron/trial-expiry
 * Auth:   x-cron-secret header
 * Data:   subscriptions, organisations, user_orgs, communication_log via service client
 * Notes:  Expired trials revert to free Owner tier. Sends T-2 trial-ending and ~T-35 founding-expiry
 *         warnings, deduped via communication_log. Branding routed through fetchOrgSettings (real logo+address).
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import {
  sendTrialExpired,
  sendTrialEndingSoon,
  sendFoundingExpiryWarning,
} from "@/lib/subscriptions/emails"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  let expired = 0
  let warned = 0

  // Helper: fetch org branding + admin email for a given orgId
  async function fetchOrgContact(orgId: string) {
    const [{ data: org }, { data: adminRow }] = await Promise.all([
      supabase
        .from("organisations")
        .select("name, email, phone, brand_accent_color")
        .eq("id", orgId)
        .single(),
      supabase
        .from("user_orgs")
        .select("user_profiles(email, full_name)")
        .eq("org_id", orgId)
        .in("role", ["owner", "agent"])
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ])

    const profile = adminRow?.user_profiles as unknown as { email: string; full_name?: string } | null
    if (!profile?.email) return null

    return {
      orgId,
      orgName: org?.name ?? "Pleks",
      adminEmail: profile.email,
      adminName: profile.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(orgId)),
    }
  }

  // 1. Find expired trials
  const { data: expiredTrials, error: expiredTrialsError } = await supabase
    .from("subscriptions")
    .select("id, org_id, trial_tier, trial_ends_at")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .lt("trial_ends_at", now.toISOString())
  if (expiredTrialsError) console.error("trial-expiry expired subscriptions read failed:", expiredTrialsError.message)

  for (const trial of expiredTrials ?? []) {
    // Revert to Owner tier
    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        tier: "owner",
        amount_cents: 0,
      })
      .eq("id", trial.id)

    await supabase.from("audit_log").insert({
      org_id: trial.org_id,
      table_name: "subscriptions",
      record_id: trial.org_id,
      action: "UPDATE",
      new_values: {
        action: "trial_expired",
        previous_trial_tier: trial.trial_tier,
        reverted_to: "owner",
      },
    })

    const contact = await fetchOrgContact(trial.org_id)
    if (contact) {
      void sendTrialExpired(contact, trial.trial_tier ?? "trial")
    }

    expired++
  }

  // 2. Find trials expiring in 2 days — send warning
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  const { data: expiringTrials, error: expiringTrialsError } = await supabase
    .from("subscriptions")
    .select("id, org_id, trial_ends_at")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", twoDaysFromNow.toISOString())
  if (expiringTrialsError) console.error("trial-expiry expiring subscriptions read failed:", expiringTrialsError.message)

  for (const trial of expiringTrials ?? []) {
    // Check if warning already sent
    const { data: priorSend, error: priorSendError } = await supabase
      .from("communication_log")
      .select("id")
      .eq("org_id", trial.org_id)
      .eq("subject", "trial_ending_soon")
      .limit(1)
    if (priorSendError) console.error("trial-expiry communication_log read failed:", priorSendError.message)

    if (priorSend && priorSend.length > 0) continue

    const contact = await fetchOrgContact(trial.org_id)
    if (contact) {
      void sendTrialEndingSoon(contact, trial.trial_ends_at)
    }

    warned++
  }

  // 3. Founding agent expiry warning (month 23 — ~35 days before expiry)
  let foundingWarned = 0
  const thirtyFiveDaysFromNow = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000)
  const { data: expiringFounders, error: expiringFoundersError } = await supabase
    .from("organisations")
    .select("id, name, founding_agent_expires_at")
    .eq("founding_agent", true)
    .gte("founding_agent_expires_at", now.toISOString())
    .lte("founding_agent_expires_at", thirtyFiveDaysFromNow.toISOString())
  if (expiringFoundersError) console.error("trial-expiry founding organisations read failed:", expiringFoundersError.message)

  for (const org of expiringFounders ?? []) {
    // Check if warning already sent
    const { data: priorFoundingSend, error: priorFoundingSendError } = await supabase
      .from("communication_log")
      .select("id")
      .eq("org_id", org.id)
      .eq("subject", "founding_expiry_warning")
      .limit(1)
    if (priorFoundingSendError) console.error("trial-expiry founding communication_log read failed:", priorFoundingSendError.message)

    if (priorFoundingSend && priorFoundingSend.length > 0) continue

    const contact = await fetchOrgContact(org.id)
    if (contact) {
      void sendFoundingExpiryWarning(contact, org.founding_agent_expires_at)
    }

    foundingWarned++
  }

  return Response.json({ ok: true, expired, warned, founding_warned: foundingWarned })
}
