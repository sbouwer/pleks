/**
 * app/api/paia-manual-pdf/route.ts — generates and streams the PAIA manual as a PDF
 *
 * Route:  GET /api/paia-manual-pdf
 * Auth:   public
 * Notes:  Uses @react-pdf/renderer renderToBuffer. Fonts are pre-fetched and passed
 *         as data URIs so fontkit never makes a secondary network request.
 *         public/ files are CDN-only on Vercel; font data fetched via HTTP in the handler.
 */
import { renderToBuffer, Font, Document, Page, Text } from "@react-pdf/renderer"
import { createElement } from "react"
import { PaiaManualPdf } from "@/components/legal/PaiaManualPdf"

export const dynamic = "force-dynamic"

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
      let res: Response
      try {
        res = await fetch(url)
      } catch (fetchErr) {
        console.error(`[paia-manual-pdf] fetch threw for ${file}:`, fetchErr)
        throw fetchErr
      }
      const ct = res.headers.get("content-type") ?? "unknown"
      console.log(`[paia-manual-pdf] font fetch: ${file} — HTTP ${res.status}, content-type: ${ct}`)
      if (!res.ok) throw new Error(`Font fetch failed: ${file} — HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      console.log(`[paia-manual-pdf] font loaded: ${file} — ${buf.byteLength} bytes`)
      return { src: `data:font/truetype;base64,${buf.toString("base64")}`, fontWeight }
    })
  )
  Font.register({ family: "InterTight", fonts })
  console.log("[paia-manual-pdf] Font.register complete")
}

function serializeError(err: unknown): string {
  if (err instanceof Error) {
    return JSON.stringify({ message: err.message, name: err.name, stack: err.stack }, null, 2)
  }
  return String(err)
}

export async function GET() {
  console.log("[paia-manual-pdf] request start, fontBase:", fontBase)

  // Step 1: load fonts
  try {
    await registerFonts()
  } catch (err) {
    console.error("[paia-manual-pdf] STEP 1 FAILED — font registration:", serializeError(err))
    return new Response("PDF generation failed — font load error", { status: 500 })
  }

  // Step 2: probe with a minimal document to isolate font vs component issues
  try {
    await renderToBuffer(
      createElement(Document, null,
        createElement(Page, { size: "A4" },
          createElement(Text, { style: { fontFamily: "InterTight", fontSize: 10 } }, "probe")
        )
      )
    )
    console.log("[paia-manual-pdf] STEP 2 OK — minimal render with InterTight succeeded")
  } catch (err) {
    console.error("[paia-manual-pdf] STEP 2 FAILED — minimal render:", serializeError(err))
    return new Response("PDF generation failed — minimal render probe failed", { status: 500 })
  }

  // Step 3: full document
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(createElement(PaiaManualPdf))
    console.log("[paia-manual-pdf] STEP 3 OK — full render, bytes:", buffer.byteLength)
  } catch (err) {
    console.error("[paia-manual-pdf] STEP 3 FAILED — full render:", serializeError(err))
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
