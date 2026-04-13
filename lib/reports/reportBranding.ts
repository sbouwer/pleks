import { createServiceClient } from "@/lib/supabase/server"

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

  const { data: org, error } = await db
    .from("organisations")
    .select("name, brand_logo_path, logo_url, brand_accent_color, brand_cover_template, brand_font, lease_address, lease_phone, lease_email, lease_website, lease_registration_number")
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
    }
  }

  // Resolve logo URL from storage if brand_logo_path set, otherwise fall back to logo_url
  let logoUrl: string | null = org.logo_url ?? null
  if (org.brand_logo_path) {
    const { data: urlData } = db.storage.from("org-assets").getPublicUrl(org.brand_logo_path)
    if (urlData?.publicUrl) logoUrl = urlData.publicUrl
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
  }
}
