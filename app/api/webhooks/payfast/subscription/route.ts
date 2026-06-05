/**
 * app/api/webhooks/payfast/subscription/route.ts — PayFast ITN handler for subscription payments
 *
 * Route:  POST /api/webhooks/payfast/subscription
 * Auth:   PayFast ITN signature validation (validatePayFastITN)
 * Data:   subscriptions + organisations + user_orgs
 * Notes:  Handles COMPLETE (activate / past_due recovery) and FAILED (enter past_due dunning track).
 *         FAILED sets status=past_due + past_due_since. Dunning cron owns day-7 + day-14 auto-pause.
 *         COMPLETE from past_due clears past_due_since and sends resumed email.
 *         Routine renewal (already active → COMPLETE) updates period dates only, no email.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { getUserEmail } from "@/lib/auth/userEmail"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import {
  sendSubscriptionActivated,
  sendPastDueFirst,
  sendResumed,
} from "@/lib/subscriptions/emails"

type SupabaseClient = Awaited<ReturnType<typeof createServiceClient>>

interface SubRow {
  id: string
  status: string
  past_due_since: string | null
  amount_cents: number | null
}

async function fetchContext(supabase: SupabaseClient, orgId: string) {
  const [subResult, orgResult, adminResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("id, status, past_due_since, amount_cents")
      .eq("org_id", orgId)
      .not("status", "eq", "purged")
      .maybeSingle(),
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

  const sub = subResult.data as SubRow | null
  const org = orgResult.data
  const profile = adminResult.data?.user_profiles as unknown as { full_name?: string | null } | null
  const adminEmail = await getUserEmail(supabase, adminResult.data?.user_id as string | null)

  return { sub, org, profile, adminEmail }
}

const TIER_AMOUNTS: Record<string, number> = {
  steward: 59900,
  portfolio: 99900,
  firm: 249900,
}

async function handleFailed(supabase: SupabaseClient, orgId: string) {
  const { sub, org, profile, adminEmail } = await fetchContext(supabase, orgId)

  // Idempotent: only enter past_due from active/trialing
  if (!sub || ["past_due", "paused", "cancelled", "purged"].includes(sub.status)) return

  await supabase
    .from("subscriptions")
    .update({ status: "past_due", past_due_since: new Date().toISOString() })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: { action: "subscription_past_due_entered", trigger: "payfast_itn_failed" },
  })

  if (org && adminEmail) {
    void sendPastDueFirst({
      orgId,
      orgName: org.name,
      adminEmail,
      adminName: profile?.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(orgId)),
    })
  }
}

async function handleComplete(
  supabase: SupabaseClient,
  orgId: string,
  tier: string,
  billingCycle: "monthly" | "annual",
  payfastToken: string,
) {
  const { sub, org, profile, adminEmail } = await fetchContext(supabase, orgId)
  const wasRecovery = sub?.status === "past_due"
  const isInitialActivation = !sub || sub.status === "trialing"
  const periodDays = billingCycle === "annual" ? 365 : 30

  await supabase
    .from("subscriptions")
    .update({
      tier,
      billing_cycle: billingCycle,
      amount_cents: TIER_AMOUNTS[tier] ?? 0,
      payfast_token: payfastToken,
      status: "active",
      past_due_since: null,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + periodDays * 86_400_000).toISOString(),
    })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: {
      action: wasRecovery ? "subscription_resumed" : "subscription_activated",
      tier,
      status: "active",
      billing_cycle: billingCycle,
    },
  })

  if (org && adminEmail) {
    const orgContact = {
      orgId,
      orgName: org.name,
      adminEmail,
      adminName: profile?.full_name ?? undefined,
      branding: buildBranding(await fetchOrgSettings(orgId)),
    }
    if (wasRecovery) {
      void sendResumed(orgContact)
    } else if (isInitialActivation) {
      void sendSubscriptionActivated(orgContact, tier, billingCycle)
    }
    // Routine renewal: no email
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))
  const paymentStatus = params.payment_status

  if (paymentStatus !== "COMPLETE" && paymentStatus !== "FAILED") {
    return NextResponse.json({ ok: true })
  }

  const { valid, error } = await validatePayFastITN(params, rawBody)
  if (!valid) {
    console.error("PayFast subscription ITN validation failed:", error)
    return NextResponse.json({ error }, { status: 400 })
  }

  const orgId = params.custom_str1
  const tier = params.custom_str2 as "steward" | "portfolio" | "firm"
  const billingCycle = params.custom_str3 as "monthly" | "annual"
  const payfastToken = params.m_payment_id

  if (!orgId) {
    return NextResponse.json({ error: "Missing org_id" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  try {
    if (paymentStatus === "FAILED") {
      await handleFailed(supabase, orgId)
    } else {
      await handleComplete(supabase, orgId, tier, billingCycle, payfastToken)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    Sentry.captureException(err, {
      tags: { webhook_type: "payfast_subscription" },
      extra: { org_id: orgId, payment_status: paymentStatus, tier },
    })
    console.error("[payfast/subscription] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
