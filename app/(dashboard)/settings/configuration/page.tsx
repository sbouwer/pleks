/**
 * app/(dashboard)/settings/configuration/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { ConfigurationForm } from "./ConfigurationForm"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface OrgSettings {
  preferences_version?: number
  communication?: {
    tone_tenant?: string
    tone_owner?: string
    managed_by_label?: string
    sms_fallback_enabled?: boolean
    sms_fallback_delay_hours?: number
  }
}

export default async function ConfigurationPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: org, error: orgError } = await db
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()
    logQueryError("ConfigurationPage organisations", orgError)

  const rawSettings = (org?.settings ?? {}) as OrgSettings
  const communication = rawSettings.communication ?? {}

  const initialSettings: OrgSettings = {
    preferences_version: rawSettings.preferences_version,
    communication: {
      tone_tenant: communication.tone_tenant ?? "professional",
      tone_owner: communication.tone_owner ?? "professional",
      managed_by_label: communication.managed_by_label ?? "organisation",
      sms_fallback_enabled: communication.sms_fallback_enabled ?? false,
      sms_fallback_delay_hours: communication.sms_fallback_delay_hours ?? 4,
    },
  }

  return <ConfigurationForm initialSettings={initialSettings} />
}
