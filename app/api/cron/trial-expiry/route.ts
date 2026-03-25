import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  let expired = 0
  let warned = 0

  // 1. Find expired trials
  const { data: expiredTrials } = await supabase
    .from("subscriptions")
    .select("id, org_id, trial_tier, trial_ends_at")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .lt("trial_ends_at", now.toISOString())

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

    // TODO: Send trial_expired email via Resend
    expired++
  }

  // 2. Find trials expiring in 2 days — send warning
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
  const { data: expiringTrials } = await supabase
    .from("subscriptions")
    .select("id, org_id, trial_ends_at")
    .eq("status", "trialing")
    .eq("trial_converted", false)
    .gte("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", twoDaysFromNow.toISOString())

  for (const trial of expiringTrials ?? []) {
    // Check if warning already sent
    const { data: priorSend } = await supabase
      .from("communication_log")
      .select("id")
      .eq("org_id", trial.org_id)
      .eq("subject", "trial_ending_soon")
      .limit(1)

    if (priorSend && priorSend.length > 0) continue

    // Log warning sent
    await supabase.from("communication_log").insert({
      org_id: trial.org_id,
      channel: "email",
      direction: "outbound",
      subject: "trial_ending_soon",
      body: `Trial ending in 2 days — upgrade CTA sent`,
      status: "sent",
    })

    // TODO: Send trial_ending_soon email via Resend
    warned++
  }

  // 3. Founding agent expiry warning (month 23 — ~35 days before expiry)
  let foundingWarned = 0
  const thirtyFiveDaysFromNow = new Date(now.getTime() + 35 * 24 * 60 * 60 * 1000)
  const { data: expiringFounders } = await supabase
    .from("organisations")
    .select("id, name, founding_agent_expires_at")
    .eq("founding_agent", true)
    .gte("founding_agent_expires_at", now.toISOString())
    .lte("founding_agent_expires_at", thirtyFiveDaysFromNow.toISOString())

  for (const org of expiringFounders ?? []) {
    // Check if warning already sent
    const { data: priorFoundingSend } = await supabase
      .from("communication_log")
      .select("id")
      .eq("org_id", org.id)
      .eq("subject", "founding_expiry_warning")
      .limit(1)

    if (priorFoundingSend && priorFoundingSend.length > 0) continue

    await supabase.from("communication_log").insert({
      org_id: org.id,
      channel: "email",
      direction: "outbound",
      subject: "founding_expiry_warning",
      body: `Founding agent pricing ending soon for ${org.name}. Expires: ${org.founding_agent_expires_at}`,
      status: "sent",
    })

    // TODO: Send founding_expiry_warning email via Resend
    foundingWarned++
  }

  return Response.json({ ok: true, expired, warned, founding_warned: foundingWarned })
}
