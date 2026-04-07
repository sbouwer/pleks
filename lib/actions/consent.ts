"use server"

import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/auth/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { DISCLAIMER_VERSION } from "@/lib/leases/disclaimer"

export async function recordLeaseDisclaimerAcceptance() {
  const user = await getServerUser()
  if (!user) return { error: "Not authenticated" }

  const membership = await getServerOrgMembership()
  const supabase = await createClient()

  const headersList = await headers()
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const userAgent = headersList.get("user-agent") ?? null

  // Idempotent: skip if already recorded for this version
  const { data: existing } = await supabase
    .from("consent_log")
    .select("id")
    .eq("user_id", user.id)
    .eq("consent_type", "lease_template_disclaimer")
    .eq("consent_version", DISCLAIMER_VERSION)
    .limit(1)
    .maybeSingle()

  if (existing) return { ok: true }

  await supabase.from("consent_log").insert({
    org_id: membership?.org_id ?? null,
    user_id: user.id,
    consent_type: "lease_template_disclaimer",
    consent_given: true,
    consent_version: DISCLAIMER_VERSION,
    ip_address: ip,
    user_agent: userAgent,
    accepted_via: "web",
  })

  return { ok: true }
}
