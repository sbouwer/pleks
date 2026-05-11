/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer. Font is registered here (not in the
 *         component) to keep the localhost fallback out of the legal-pages check.
 *         public/ files are CDN-only on Vercel; the font is fetched via HTTP URL.
 */
import { renderToBuffer, Font } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"

export const dynamic = "force-dynamic"

// public/ is not bundled in the Vercel lambda — fetch the TTF from the CDN via HTTP.
// Always use the production URL; localhost is unreachable from the Vercel runtime.
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
const fontBase = !rawAppUrl || rawAppUrl.startsWith("http://localhost")
  ? "https://app.pleks.co.za"
  : rawAppUrl
const interFontUrl = `${fontBase}/fonts/InterTight-VariableFont_wght.ttf`

// Font.register is idempotent; safe to call on every cold start.
Font.register({
  family: "Inter",
  fonts: [
    { src: interFontUrl, fontWeight: 400 },
    { src: interFontUrl, fontWeight: 600 },
    { src: interFontUrl, fontWeight: 700 },
  ],
})

export async function GET() {
  console.log("[paia-manual-pdf] generating PDF, fontBase:", fontBase)
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(createElement(PaiaManualPdf))
  } catch (err) {
    console.error("[paia-manual-pdf] renderToBuffer failed:", err)
    return new Response("PDF generation failed", { status: 500 })
  }

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": 'attachment; filename="Pleks-PAIA-Manual-v1.0.pdf"',
      "Cache-Control":       "no-store",
    },
  })
}
