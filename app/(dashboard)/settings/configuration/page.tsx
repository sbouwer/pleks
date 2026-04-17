import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { ConfigurationForm } from "./ConfigurationForm"

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

  const { data: org } = await db
    .from("organisations")
    .select("settings")
    .eq("id", orgId)
    .single()

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
