import { NextResponse } from "next/server"
import { validatePayFastITN } from "@/lib/payfast/validate"
import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding } from "@/lib/comms/send-email"
import { sendSubscriptionActivated } from "@/lib/subscriptions/emails"

export async function POST(req: Request) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody))

  // Skip non-complete payments
  if (params.payment_status !== "COMPLETE") {
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

  if (!orgId || !tier) {
    return NextResponse.json({ error: "Missing org_id or tier" }, { status: 400 })
  }

  const tierAmounts: Record<string, number> = {
    steward: 59900,
    portfolio: 99900,
    firm: 249900,
  }
  const periodDays = billingCycle === "annual" ? 365 : 30

  const supabase = await createServiceClient()

  await supabase
    .from("subscriptions")
    .update({
      tier,
      billing_cycle: billingCycle,
      amount_cents: tierAmounts[tier] || 0,
      payfast_token: payfastToken,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(
        Date.now() + periodDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .eq("org_id", orgId)

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "subscriptions",
    record_id: orgId,
    action: "UPDATE",
    new_values: { tier, status: "active", billing_cycle: billingCycle },
  })

  // Send subscription activated email to org admin
  const [{ data: org }, { data: adminRow }] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, email, phone, address_line1, city, brand_logo_url, brand_accent_color")
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
  if (profile?.email) {
    void sendSubscriptionActivated(
      {
        orgId,
        orgName: org?.name ?? "Pleks",
        adminEmail: profile.email,
        adminName: profile.full_name ?? undefined,
        branding: buildBranding(org),
      },
      tier,
      billingCycle
    )
  }

  return NextResponse.json({ ok: true })
}
