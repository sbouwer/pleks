/**
 * app/(dashboard)/settings/details/page.tsx — Organisation settings (category page)
 *
 * Route:  /settings/details  (tabs: ?tab=details|branding|hours|emergency|configuration)
 * Auth:   gatewaySSR (redirect to /login if no session)
 * Data:   organisations row (per-tab slice); getCurrentOrgCapabilities for the opening-hours gate
 * Notes:  Universal DetailPageLayout + CategoryTabs. Consolidates the old standalone /settings/branding,
 *         /hours and /configuration pages into one tabbed surface (those routes now redirect here).
 *         Hours + Emergency tabs are capability-gated (caps.hasOpeningHours) and dropped otherwise.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getCurrentOrgCapabilities } from "@/lib/auth/server"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { ORG_TABS, HOURS_GATED_TABS } from "./tabs"
import { DetailsForm, type OrgDetails } from "./DetailsForm"
import { BrandingForm } from "../branding/BrandingForm"
import { HoursForm, type HoursData } from "../hours/HoursForm"
import { EmergencyForm, type EmergencyData } from "../hours/EmergencyForm"
import { ConfigurationForm } from "../configuration/ConfigurationForm"

export const metadata = { title: "Organisation" }

const DETAILS_FIELDS = [
  "id", "type", "user_type", "primary_contact_is_user",
  "name", "trading_as", "reg_number", "eaab_number", "vat_number",
  "email", "phone", "address", "website",
  "title", "first_name", "last_name", "initials", "gender",
  "date_of_birth", "id_number", "mobile",
  "addr_type", "addr_line1", "addr_suburb", "addr_city", "addr_province", "addr_postal_code",
  "addr2_type", "addr2_line1", "addr2_suburb", "addr2_city", "addr2_province", "addr2_postal_code",
].join(", ")

const HOURS_FIELDS = [
  "office_hours_monday", "office_hours_tuesday", "office_hours_wednesday", "office_hours_thursday",
  "office_hours_friday", "office_hours_saturday", "office_hours_sunday", "office_hours_public_holidays",
].join(", ")

const EMERGENCY_FIELDS = ["emergency_phone", "emergency_contact_name", "emergency_instructions", "emergency_email"].join(", ")

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

export default async function OrganisationPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const caps = await getCurrentOrgCapabilities()
  const hasHours = !!caps?.hasOpeningHours
  const tabs = hasHours ? ORG_TABS : ORG_TABS.filter((t) => !HOURS_GATED_TABS.includes(t.id))

  const { tab } = await searchParams
  const active = tabs.some((t) => t.id === tab) ? tab! : "details"

  // ── Per-tab data load ────────────────────────────────────────────────────────
  let detailsData: OrgDetails | null = null
  let hoursData: HoursData | null = null
  let emergencyData: EmergencyData | null = null
  let configSettings: OrgSettings | null = null

  if (active === "details") {
    const { data: org, error } = await db.from("organisations").select(DETAILS_FIELDS).eq("id", orgId).single()
    logQueryError("OrganisationPage details", error)
    if (!org) redirect("/login")
    const d = org as unknown as Record<string, unknown>
    let type: OrgDetails["type"] = "agency"
    if (d.type === "landlord" || d.user_type === "owner") type = "landlord"
    else if (d.type === "sole_prop") type = "sole_prop"
    detailsData = {
      id: d.id as string,
      type,
      primary_contact_is_user: typeof d.primary_contact_is_user === "boolean" ? d.primary_contact_is_user : true,
      name: (d.name as string) ?? null,
      trading_as: (d.trading_as as string) ?? null,
      reg_number: (d.reg_number as string) ?? null,
      eaab_number: (d.eaab_number as string) ?? null,
      vat_number: (d.vat_number as string) ?? null,
      email: (d.email as string) ?? null,
      phone: (d.phone as string) ?? null,
      address: (d.address as string) ?? null,
      website: (d.website as string) ?? null,
      title: (d.title as string) ?? null,
      first_name: (d.first_name as string) ?? null,
      last_name: (d.last_name as string) ?? null,
      initials: (d.initials as string) ?? null,
      gender: (d.gender as string) ?? null,
      date_of_birth: (d.date_of_birth as string) ?? null,
      id_number: (d.id_number as string) ?? null,
      mobile: (d.mobile as string) ?? null,
      addr_type: (d.addr_type as string) ?? null,
      addr_line1: (d.addr_line1 as string) ?? null,
      addr_suburb: (d.addr_suburb as string) ?? null,
      addr_city: (d.addr_city as string) ?? null,
      addr_province: (d.addr_province as string) ?? null,
      addr_postal_code: (d.addr_postal_code as string) ?? null,
      addr2_type: (d.addr2_type as string) ?? null,
      addr2_line1: (d.addr2_line1 as string) ?? null,
      addr2_suburb: (d.addr2_suburb as string) ?? null,
      addr2_city: (d.addr2_city as string) ?? null,
      addr2_province: (d.addr2_province as string) ?? null,
      addr2_postal_code: (d.addr2_postal_code as string) ?? null,
    }
  } else if (active === "hours") {
    const { data: org, error } = await db.from("organisations").select(HOURS_FIELDS).eq("id", orgId).single()
    logQueryError("OrganisationPage hours", error)
    const d = (org ?? {}) as unknown as Record<string, unknown>
    hoursData = {
      office_hours_monday: (d.office_hours_monday as string) ?? null,
      office_hours_tuesday: (d.office_hours_tuesday as string) ?? null,
      office_hours_wednesday: (d.office_hours_wednesday as string) ?? null,
      office_hours_thursday: (d.office_hours_thursday as string) ?? null,
      office_hours_friday: (d.office_hours_friday as string) ?? null,
      office_hours_saturday: (d.office_hours_saturday as string) ?? null,
      office_hours_sunday: (d.office_hours_sunday as string) ?? null,
      office_hours_public_holidays: (d.office_hours_public_holidays as string) ?? null,
    }
  } else if (active === "emergency") {
    const { data: org, error } = await db.from("organisations").select(EMERGENCY_FIELDS).eq("id", orgId).single()
    logQueryError("OrganisationPage emergency", error)
    const d = (org ?? {}) as unknown as Record<string, unknown>
    emergencyData = {
      emergency_phone: (d.emergency_phone as string) ?? null,
      emergency_contact_name: (d.emergency_contact_name as string) ?? null,
      emergency_instructions: (d.emergency_instructions as string) ?? null,
      emergency_email: (d.emergency_email as string) ?? null,
    }
  } else if (active === "configuration") {
    const { data: org, error } = await db.from("organisations").select("settings").eq("id", orgId).single()
    logQueryError("OrganisationPage configuration", error)
    const raw = (org?.settings ?? {}) as OrgSettings
    const communication = raw.communication ?? {}
    configSettings = {
      preferences_version: raw.preferences_version,
      communication: {
        tone_tenant: communication.tone_tenant ?? "professional",
        tone_owner: communication.tone_owner ?? "professional",
        managed_by_label: communication.managed_by_label ?? "organisation",
        sms_fallback_enabled: communication.sms_fallback_enabled ?? false,
        sms_fallback_delay_hours: communication.sms_fallback_delay_hours ?? 4,
      },
    }
  }

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Organisation"
      sub="Your organisation profile, branding, hours and document settings."
      facts={[]}
      tabs={<CategoryTabs tabs={tabs} current={active} />}
    >
      <DetailFullWidth>
        {active === "details" && detailsData && <DetailsForm initialData={detailsData} />}
        {active === "branding" && <BrandingForm />}
        {active === "hours" && hoursData && <HoursForm initialData={hoursData} />}
        {active === "emergency" && emergencyData && <EmergencyForm initialData={emergencyData} />}
        {active === "configuration" && configSettings && <ConfigurationForm initialSettings={configSettings} />}
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
