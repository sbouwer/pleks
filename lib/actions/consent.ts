"use server"

import { headers } from "next/headers"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { DISCLAIMER_VERSION } from "@/lib/leases/disclaimer"

export async function recordLeaseDisclaimerAcceptance() {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const userAgent = headersList.get("user-agent") ?? null

  // Idempotent: skip if already recorded for this version
  const { data: existing } = await db
    .from("consent_log")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_type", "lease_template_disclaimer")
    .eq("consent_version", DISCLAIMER_VERSION)
    .limit(1)
    .maybeSingle()

  if (existing) return { ok: true }

  const { error } = await db.from("consent_log").insert({
    org_id: orgId,
    user_id: userId,
    consent_type: "lease_template_disclaimer",
    consent_given: true,
    consent_version: DISCLAIMER_VERSION,
    ip_address: ip,
    user_agent: userAgent,
  })

  if (error) return { error: "Failed to record consent" }
  return { ok: true }
}

// ── Tenant messaging consent (WhatsApp / SMS / email) ─────────────────────────

export async function saveLeaseConsent(params: {
  tenantId: string
  orgId: string
  emailEnabled: boolean
  whatsappEnabled: boolean
  smsEnabled: boolean
}): Promise<{ error?: string }> {
  const db = await createServiceClient()

  const { error } = await db
    .from("tenant_messaging_consent")
    .upsert(
      {
        tenant_id: params.tenantId,
        org_id: params.orgId,
        email_enabled: params.emailEnabled,
        whatsapp_enabled: params.whatsappEnabled,
        sms_enabled: params.smsEnabled,
        consent_captured_by: "lease_creation",
        consent_captured_at: new Date().toISOString(),
        last_updated: new Date().toISOString(),
      },
      { onConflict: "tenant_id" }
    )

  if (error) {
    console.error("saveLeaseConsent failed:", error.message)
    return { error: "Failed to save consent" }
  }
  return {}
}
