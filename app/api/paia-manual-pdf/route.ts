/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer. Fonts are pre-fetched and passed
 *         as data URIs so fontkit never makes a secondary network request — this avoids
 *         a fontkit CDN-fetch race condition that causes "Cannot read properties of
 *         undefined (reading 'S')" when the lazy fetch fails or returns non-font content.
 *         public/ files are CDN-only on Vercel; font data fetched via HTTP in the handler.
 */
import { renderToBuffer, Font } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"

export const dynamic = "force-dynamic"

// Always use the production CDN; localhost is unreachable from the Vercel runtime.
const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
const fontBase = !rawAppUrl || rawAppUrl.startsWith("http://localhost")
  ? "https://app.pleks.co.za"
  : rawAppUrl

const FONT_FILES = [
  { file: "InterTight-Regular.ttf",  fontWeight: 400 },
  { file: "InterTight-SemiBold.ttf", fontWeight: 600 },
  { file: "InterTight-Bold.ttf",     fontWeight: 700 },
] as const

async function registerFonts() {
  const fonts = await Promise.all(
    FONT_FILES.map(async ({ file, fontWeight }) => {
      const url = `${fontBase}/fonts/${file}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Font fetch failed: ${file} — HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      return { src: `data:font/truetype;base64,${buf.toString("base64")}`, fontWeight }
    })
  )
  Font.register({ family: "InterTight", fonts })
}

export async function GET() {
  console.log("[paia-manual-pdf] generating PDF, fontBase:", fontBase)
  try {
    await registerFonts()
  } catch (err) {
    console.error("[paia-manual-pdf] font registration failed:", err)
    return new Response("PDF generation failed — font load error", { status: 500 })
  }

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
