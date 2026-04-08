"use server"

import { headers } from "next/headers"
import { gateway } from "@/lib/supabase/gateway"
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
    accepted_via: "web",
  })

  if (error) return { error: "Failed to record consent" }
  return { ok: true }
}
