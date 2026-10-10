"use server"

/**
 * lib/actions/consent.ts — records lease-template disclaimer acceptance
 *
 * Auth:   recordLeaseDisclaimerAcceptance → requireAgentWriteAccess("create_lease");
 *         (saveLeaseConsent moved to lib/consent/saveLeaseConsent.ts: ungated, so not an action)
 * Data:   writes consent_log (idempotent per version) and tenant_messaging_consent (upsert on tenant_id)
 */
import { headers } from "next/headers"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { DISCLAIMER_VERSION } from "@/lib/leases/disclaimer"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function recordLeaseDisclaimerAcceptance() {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const userAgent = headersList.get("user-agent") ?? null

  // Idempotent: skip if already recorded for this version
  const { data: existing, error: existingError } = await db
    .from("consent_log")
    .select("id")
    .eq("user_id", userId)
    .eq("consent_type", "lease_template_disclaimer")
    .eq("consent_version", DISCLAIMER_VERSION)
    .limit(1)
    .maybeSingle()
    logQueryError("recordLeaseDisclaimerAcceptance consent_log", existingError)

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
