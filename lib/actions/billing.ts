"use server"

import { gateway } from "@/lib/supabase/gateway"
import { OWNER_PRO_MAX_LEASES } from "@/lib/constants"

// ── Enable premium on a single lease ─────────────────────────────────────────

export async function enableLeasePremium(
  leaseId: string,
): Promise<{ error?: string; requiresPaymentSetup?: boolean }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  // Load subscription
  const { data: sub, error: subError } = await db
    .from("subscriptions")
    .select("id, tier, owner_pro_lease_count, status")
    .eq("org_id", orgId)
    .single()

  if (subError) {
    console.error("enableLeasePremium: subscription fetch failed:", subError.message)
    return { error: "Could not load subscription" }
  }

  // Paid tiers already include all premium features — no per-lease billing needed
  if (["steward", "portfolio", "firm"].includes(sub?.tier ?? "")) {
    return { error: "Premium features are included in your current plan" }
  }

  // Enforce the 3-lease Owner Pro cap
  const currentCount = sub?.owner_pro_lease_count ?? 0
  if (currentCount >= OWNER_PRO_MAX_LEASES) {
    return {
      error:
        "You have reached the 3-lease Owner Pro cap. Upgrade to Steward for unlimited premium leases.",
    }
  }

  // Verify the lease belongs to this org
  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("id, premium_enabled")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (leaseError || !lease) {
    console.error("enableLeasePremium: lease fetch failed:", leaseError?.message)
    return { error: "Lease not found" }
  }

  if (lease.premium_enabled) return {}  // already enabled — no-op

  // Enable premium on the lease
  const { error: leaseUpdateError } = await db
    .from("leases")
    .update({
      premium_enabled:    true,
      premium_enabled_at: new Date().toISOString(),
      premium_enabled_by: userId,
    })
    .eq("id", leaseId)
    .eq("org_id", orgId)

  if (leaseUpdateError) {
    console.error("enableLeasePremium: lease update failed:", leaseUpdateError.message)
    return { error: "Could not enable premium" }
  }

  // Keep subscription counter in sync
  const { error: counterError } = await db
    .from("subscriptions")
    .update({ owner_pro_lease_count: currentCount + 1 })
    .eq("org_id", orgId)

  if (counterError) {
    console.error("enableLeasePremium: counter update failed:", counterError.message)
    // Non-fatal — counter is a cached sum that can be recalculated
  }

  // TODO: initiate payment mandate (PayFast recurring / DebiCheck) when
  //       billing integration is added in a future addendum.
  const isFirstPremiumLease = currentCount === 0
  return { requiresPaymentSetup: isFirstPremiumLease }
}

// ── Disable premium on a single lease ────────────────────────────────────────

export async function disableLeasePremium(
  leaseId: string,
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  // Load current counter before decrementing
  const { data: sub } = await db
    .from("subscriptions")
    .select("owner_pro_lease_count")
    .eq("org_id", orgId)
    .single()

  const { error: leaseUpdateError } = await db
    .from("leases")
    .update({
      premium_enabled:     false,
      premium_disabled_at: new Date().toISOString(),
    })
    .eq("id", leaseId)
    .eq("org_id", orgId)

  if (leaseUpdateError) {
    console.error("disableLeasePremium: lease update failed:", leaseUpdateError.message)
    return { error: "Could not disable premium" }
  }

  const currentCount = sub?.owner_pro_lease_count ?? 1
  await db
    .from("subscriptions")
    .update({ owner_pro_lease_count: Math.max(0, currentCount - 1) })
    .eq("org_id", orgId)

  // TODO: cancel/amend payment mandate when billing integration is added.
  return {}
}

// ── Fetch Owner Pro summary (used by billing settings page) ──────────────────

export interface OwnerProSummary {
  premiumLeaseCount: number
  maxLeases: number
  monthlyCents: number
  leases: Array<{
    id: string
    unit: string | null
    property: string | null
    tenantName: string | null
    enabledAt: string | null
  }>
}

export async function getOwnerProSummary(): Promise<OwnerProSummary | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { data: leases, error } = await db
    .from("leases")
    .select(`
      id,
      premium_enabled_at,
      units ( unit_number ),
      properties ( name ),
      tenants ( first_name, last_name, company_name, entity_type )
    `)
    .eq("org_id", orgId)
    .eq("premium_enabled", true)
    .is("deleted_at", null)
    .order("premium_enabled_at", { ascending: false })

  if (error) {
    console.error("getOwnerProSummary: failed:", error.message)
    return { error: "Could not load premium leases" }
  }

  const mapped = (leases ?? []).map((l) => {
    const unitsRaw = l.units as unknown
    const propsRaw = l.properties as unknown
    const tenantsRaw = l.tenants as unknown
    const unit = (Array.isArray(unitsRaw) ? unitsRaw[0] : unitsRaw) as { unit_number: string | null } | null
    const prop = (Array.isArray(propsRaw) ? propsRaw[0] : propsRaw) as { name: string | null } | null
    const t    = (Array.isArray(tenantsRaw) ? tenantsRaw[0] : tenantsRaw) as { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null
    let tenantName: string | null = null
    if (t) {
      tenantName = t.entity_type === "juristic"
        ? (t.company_name ?? null)
        : [t.first_name, t.last_name].filter(Boolean).join(" ") || null
    }
    return {
      id:          l.id,
      unit:        unit?.unit_number ?? null,
      property:    prop?.name ?? null,
      tenantName,
      enabledAt:   l.premium_enabled_at ?? null,
    }
  })

  return {
    premiumLeaseCount: mapped.length,
    maxLeases:         OWNER_PRO_MAX_LEASES,
    monthlyCents:      mapped.length * 9900,
    leases:            mapped,
  }
}

// ── Messaging usage (for usage meter on billing settings page) ─────────────

export interface MessagingUsageData {
  period: string
  whatsappCount: number
  smsCount: number
  emailCount: number
  quotaWhatsapp: number
  quotaEmail: number
  overageWhatsapp: number
  overageEmail: number
  overageCents: number
}

export async function getMessagingUsage(): Promise<MessagingUsageData | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const period = new Date()
  period.setDate(1)
  const periodStr = period.toISOString().substring(0, 10)

  const { data, error } = await db
    .from("messaging_usage")
    .select("*")
    .eq("org_id", orgId)
    .eq("period", periodStr)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("getMessagingUsage failed:", error.message)
    return { error: "Failed to load usage" }
  }

  if (!data) {
    return {
      period: periodStr,
      whatsappCount: 0,
      smsCount: 0,
      emailCount: 0,
      quotaWhatsapp: 400,
      quotaEmail: 5000,
      overageWhatsapp: 0,
      overageEmail: 0,
      overageCents: 0,
    }
  }

  return {
    period: data.period as string,
    whatsappCount: data.whatsapp_count as number,
    smsCount: data.sms_count as number,
    emailCount: data.email_count as number,
    quotaWhatsapp: data.quota_whatsapp as number,
    quotaEmail: data.quota_email as number,
    overageWhatsapp: data.overage_whatsapp as number,
    overageEmail: data.overage_email as number,
    overageCents: data.overage_cents as number,
  }
}
