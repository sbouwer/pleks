/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer. Excluded from Turbopack bundling via
 *         serverExternalPackages in next.config.ts — required so yoga-wasm-web initialises
 *         correctly from node_modules. Font.register uses CDN URLs; fontkit fetches lazily
 *         on first render. public/ files served via Vercel CDN, reachable by the lambda.
 */
import { renderToBuffer, Font } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"
import { APP_URL } from "@/lib/env"

export const dynamic = "force-dynamic"

const rawAppUrl = APP_URL
const fontBase = !rawAppUrl || rawAppUrl.startsWith("http://localhost")
  ? "https://app.pleks.co.za"
  : rawAppUrl

Font.register({
  family: "InterTight",
  fonts: [
    { src: `${fontBase}/fonts/InterTight-Regular.ttf`,  fontWeight: 400 },
    { src: `${fontBase}/fonts/InterTight-SemiBold.ttf`, fontWeight: 600 },
    { src: `${fontBase}/fonts/InterTight-Bold.ttf`,     fontWeight: 700 },
  ],
})

export async function GET() {
  console.log("[paia-manual-pdf] generating PDF, fontBase:", fontBase)
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(createElement(PaiaManualPdf))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    console.error("[paia-manual-pdf] renderToBuffer failed:", e.message, e.stack)
    return new Response("PDF generation failed", { status: 500 })
  }

  console.log("[paia-manual-pdf] done, bytes:", buffer.byteLength)
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": 'attachment; filename="Pleks-PAIA-Manual-v1.0.pdf"',
      "Cache-Control":       "no-store",
    },
  })
}
