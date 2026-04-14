import { createServiceClient } from "@/lib/supabase/server"
import type { OperatingHours } from "@/lib/org/operatingHours"
import { getOperatingHours } from "@/lib/org/operatingHours"

export type { OperatingHours }

export interface ReportBranding {
  logo_url: string | null
  org_name: string
  registration_number: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  accent_color: string
  font: string
  layout: string
  hours: OperatingHours
}

export const FONT_STACKS: Record<string, string> = {
  inter:       "Inter, -apple-system, sans-serif",
  merriweather: "Merriweather, Georgia, serif",
  lato:        "Lato, -apple-system, sans-serif",
  playfair:    '"Playfair Display", Georgia, serif',
}

const GOOGLE_FONTS_URLS: Record<string, string> = {
  inter:        "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap",
  merriweather: "https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap",
  lato:         "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
  playfair:     "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap",
}

export function getFontLink(font: string): string {
  const url = GOOGLE_FONTS_URLS[font] ?? GOOGLE_FONTS_URLS.inter
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${url}" rel="stylesheet">`
}

export async function getReportBranding(orgId: string): Promise<ReportBranding> {
  const db = await createServiceClient()

  const defaultHours = getOperatingHours({})

  // Core branding columns — stable, always present
  const { data: org, error } = await db
    .from("organisations")
    .select("name, brand_logo_path, logo_url, brand_accent_color, brand_cover_template, brand_font, lease_address, lease_phone, lease_email, lease_website, lease_registration_number, phone")
    .eq("id", orgId)
    .single()

  if (error || !org) {
    return {
      logo_url: null,
      org_name: "Property Management",
      registration_number: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      accent_color: "#1a3a5c",
      font: "inter",
      layout: "classic",
      hours: defaultHours,
    }
  }

  // Resolve logo URL — org-assets bucket is private, must use signed URL
  let logoUrl: string | null = org.logo_url ?? null
  if (org.brand_logo_path) {
    const { data: signed } = await db.storage.from("org-assets").createSignedUrl(org.brand_logo_path, 3600)
    if (signed?.signedUrl) logoUrl = signed.signedUrl
  }

  // Hours columns — added in migration 023; graceful fallback if not yet applied
  let hours = getOperatingHours({ phone: org.lease_phone ?? null })
  const { data: orgHours } = await db
    .from("organisations")
    .select("office_hours_weekday, office_hours_saturday, office_hours_sunday, office_hours_public_holidays, emergency_phone, emergency_contact_name, emergency_email, emergency_instructions")
    .eq("id", orgId)
    .single()
  if (orgHours) {
    const h = orgHours as unknown as Record<string, string | null>
    hours = getOperatingHours({
      phone: org.lease_phone ?? null,
      office_hours_weekday: h.office_hours_weekday,
      office_hours_saturday: h.office_hours_saturday,
      office_hours_sunday: h.office_hours_sunday,
      office_hours_public_holidays: h.office_hours_public_holidays,
      emergency_phone: h.emergency_phone,
      emergency_contact_name: h.emergency_contact_name,
      emergency_email: h.emergency_email,
      emergency_instructions: h.emergency_instructions,
    })
  }

  return {
    logo_url: logoUrl,
    org_name: org.name ?? "Property Management",
    registration_number: org.lease_registration_number ?? null,
    address: org.lease_address ?? null,
    phone: org.lease_phone ?? null,
    email: org.lease_email ?? null,
    website: org.lease_website ?? null,
    accent_color: org.brand_accent_color ?? "#1a3a5c",
    font: org.brand_font ?? "inter",
    layout: org.brand_cover_template ?? "classic",
    hours,
  }
}
