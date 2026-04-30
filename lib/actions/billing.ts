"use server"

/**
 * lib/actions/billing.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { gateway } from "@/lib/supabase/gateway"

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

// ── AI usage count (for usage meter on billing settings page) ─────────────

export async function getAiUsageCount(): Promise<{ count: number } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)

  const { count, error } = await db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("success", true)
    .gte("created_at", periodStart.toISOString())

  if (error) {
    console.error("getAiUsageCount failed:", error.message)
    return { error: "Failed to load AI usage" }
  }

  return { count: count ?? 0 }
}
