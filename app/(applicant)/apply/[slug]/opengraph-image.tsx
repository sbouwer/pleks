/**
 * app/(applicant)/apply/[slug]/opengraph-image.tsx — per-listing link preview for shared apply links
 *
 * Route:  og:image for /apply/[slug] (overrides the root branded OG)
 * Auth:   public — runs in a link scraper (WhatsApp/Slack/iMessage). Public listing data only, no PII.
 * Notes:  Uses the listing's FIRST photo as the preview the moment listing photos ship; until then it
 *         falls back to a branded card carrying the listing facts (property · unit · rent · suburb). Wrapped
 *         in try/catch + a generic fallback so a bad slug or fetch error never breaks the preview entirely.
 */
import { ImageResponse } from "next/og"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"

export const runtime = "nodejs"
export const alt = "Rental application — Pleks"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

type OgUnit = { unit_number: string | null; properties: { name: string | null; suburb: string | null; city: string | null } | null }

export default async function Image({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params

  let photo: string | null = null
  let title = "Rental application"
  let sub = "app.pleks.co.za"

  try {
    const db = await createServiceClient()
    const { data: listing, error } = await db
      .from("listings")
      .select("asking_rent_cents, listing_photos, units(unit_number, properties(name, suburb, city))")
      .eq("public_slug", slug)
      .eq("status", "active")
      .maybeSingle()
    if (error) console.error("apply og: listing fetch failed:", error.message)
    if (listing) {
      photo = (listing.listing_photos as string[] | null)?.[0] ?? null
      const unit = listing.units as unknown as OgUnit | null
      const prop = unit?.properties ?? null
      title = [prop?.name, unit?.unit_number].filter(Boolean).join(" · ") || "Rental application"
      const rent = listing.asking_rent_cents != null ? `${formatZAR(listing.asking_rent_cents as number)} /mo` : null
      const place = [prop?.suburb, prop?.city].filter(Boolean).join(", ")
      sub = [rent, place].filter(Boolean).join("  ·  ") || "app.pleks.co.za"
    }
  } catch { /* fall through to the branded card */ }

  // PHOTO variant — once listing photos ship, the property leads the preview.
  if (photo) {
    return new ImageResponse(
      (
        <div style={{ height: "100%", width: "100%", display: "flex", position: "relative", fontFamily: "sans-serif" }}>
          {/* <img> is required here — ImageResponse (Satori) renders only raw <img>, not next/image. */}
          <img src={photo} alt="" width={1200} height={630} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", gap: 10, padding: "48px 56px", background: "linear-gradient(to top, rgba(0,0,0,0.82), rgba(0,0,0,0))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "#1b1b1b", color: "#E8A838", fontSize: 26, fontWeight: 800, borderRadius: 5 }}>P</div>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#fff" }}>pleks · apply</div>
            </div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>{title}</div>
            <div style={{ display: "flex", fontSize: 30, color: "#f0e6d6" }}>{sub}</div>
          </div>
        </div>
      ),
      { ...size },
    )
  }

  // BRANDED fallback — current placeholder state (no listing photo yet): facts + Pleks branding.
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32, background: "#F4EFE6", padding: "80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center", background: "#1b1b1b", color: "#E8A838", fontSize: 56, fontWeight: 800, borderRadius: 8 }}>P</div>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: "#1b1b1b", letterSpacing: -1 }}>pleks · apply</div>
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: "#1b1b1b", lineHeight: 1.05, letterSpacing: -1, maxWidth: 1000 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 120, height: 8, background: "#E8A838", borderRadius: 4, display: "flex" }} />
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "#8a7d66" }}>{sub}</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
