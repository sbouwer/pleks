/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer with the built-in Helvetica font.
 *         Inter Tight TTFs are incompatible with the fontkit version bundled in
 *         @react-pdf/renderer v4.5.1 (OpenType 1.9 features in Google Fonts v7 are
 *         not supported) — fontkit throws "Cannot read properties of undefined (reading 'S')"
 *         at glyph layout time regardless of how the font is loaded.
 */
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"

export const dynamic = "force-dynamic"

export async function GET() {
  console.log("[paia-manual-pdf] generating PDF")
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
