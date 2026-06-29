/**
 * app/opengraph-image.tsx — default Open Graph image for link previews (WhatsApp, Slack, iMessage, etc.)
 *
 * Notes:  A 1200×630 branded card rendered at build time via next/og (no binary asset to maintain). It
 *         cascades to every route — including /apply/[slug] — unless a route defines its own. Fixes the
 *         pixelated preview that occurred when NO og:image existed and scrapers upscaled the tiny favicon.
 *         The tagline mirrors metadata.description in app/layout.tsx (keep the two in sync).
 */
import { ImageResponse } from "next/og"

export const alt = "Pleks — Property Management"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 40,
          background: "#F4EFE6",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark — the door-style "P" mark + pleks */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div
            style={{
              width: 96,
              height: 96,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1b1b1b",
              color: "#E8A838",
              fontSize: 64,
              fontWeight: 800,
              borderRadius: 8,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 88, fontWeight: 800, color: "#1b1b1b", letterSpacing: -2 }}>pleks</div>
        </div>

        {/* Approved description (mirrors metadata.description) */}
        <div style={{ display: "flex", fontSize: 40, lineHeight: 1.3, color: "#3f3a31", maxWidth: 1000 }}>
          South African property management platform. Smarter inspections, automated collections, legal-grade compliance.
        </div>

        {/* Amber accent bar + domain */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 120, height: 8, background: "#E8A838", borderRadius: 4, display: "flex" }} />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 600, color: "#8a7d66" }}>app.pleks.co.za</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
