/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer. Response is streamed with
 *         Content-Disposition: attachment so browsers download rather than display.
 */
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"

export const dynamic = "force-dynamic"

export async function GET() {
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
      "Cache-Control":       "public, max-age=86400",
    },
  })
}
