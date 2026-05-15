/**
 * app/api/admin/dev/searchworx-sigma-spike/route.ts — Searchworx UAT spike: Experian Sigma Consumer Profile
 *
 * Auth:  dev-only (NODE_ENV check) + admin session cookie (isAdminAuthenticated)
 * Notes: Throwaway scaffolding. Returns full request/response envelope for shape inspection.
 *        Results written to brief/vendors/searchworx/ as canonical fixtures once verified.
 *        ADDENDUM_14A spike — do not use in production paths.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"

const TEST_IDS = {
  eva:   { IDNumber: "6002100560184", Surname: "COMMERCE", firstname: "EVA" },
  goofy: { IDNumber: "7408285107080", Surname: "GOOFY",   firstname: "JUST" },
} as const

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not available in production", { status: 404 })
  }

  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const baseUrl = process.env.SEARCHWORX_API_URL
  const token   = process.env.SEARCHWORX_SESSION_TOKEN
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "SEARCHWORX_API_URL and SEARCHWORX_SESSION_TOKEN must be set in .env.local" },
      { status: 500 },
    )
  }

  const idParam = req.nextUrl.searchParams.get("id")
  const subject = idParam === "goofy" ? TEST_IDS.goofy : TEST_IDS.eva

  const endpoint = `${baseUrl}/credit/experian/sigma/consumerprofile/`
  const requestBody = {
    SessionToken:   token,
    Reference:      "PLEKS-SPIKE-001",
    EnquiryReason:  "Affordability Assessment",
    IDNumber:       subject.IDNumber,
    Surname:        subject.Surname,
    firstname:      subject.firstname,
  }

  const t0 = Date.now()
  let sigmaStatus: number
  let sigmaHeaders: Record<string, string>
  let sigmaBody: unknown

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(requestBody),
      signal:  controller.signal,
    })
    clearTimeout(timeout)

    sigmaStatus  = res.status
    sigmaHeaders = Object.fromEntries(res.headers)

    const ct = res.headers.get("content-type") ?? ""
    sigmaBody = ct.includes("application/json") ? await res.json() : await res.text()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Fetch failed: ${message}` }, { status: 500 })
  }

  const duration_ms = Date.now() - t0

  // PDF fetch probe — only if body contains PDFCopyURL
  let pdfFetch: { url: string; status: number; content_type: string | null; content_length: string | null } | null = null
  const pdfUrl = typeof sigmaBody === "object" && sigmaBody !== null
    ? (sigmaBody as Record<string, unknown>)["PDFCopyURL"] as string | undefined
    : undefined

  if (pdfUrl) {
    try {
      const pdfController = new AbortController()
      const pdfTimeout = setTimeout(() => pdfController.abort(), 15_000)
      const pdfRes = await fetch(pdfUrl, { method: "GET", signal: pdfController.signal })
      clearTimeout(pdfTimeout)
      // Consume and discard body — we only want headers
      await pdfRes.body?.cancel()
      pdfFetch = {
        url:            pdfUrl,
        status:         pdfRes.status,
        content_type:   pdfRes.headers.get("content-type"),
        content_length: pdfRes.headers.get("content-length"),
      }
    } catch (err) {
      pdfFetch = {
        url:            pdfUrl,
        status:         0,
        content_type:   null,
        content_length: `fetch error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  const envelope = {
    request: {
      url:  endpoint,
      body: { ...requestBody, SessionToken: "***redacted***" },
    },
    response: {
      status:      sigmaStatus,
      headers:     sigmaHeaders,
      duration_ms,
      body:        sigmaBody,
    },
    pdf_fetch: pdfFetch,
  }

  // Also log server-side for easy copy from next dev terminal
  console.log("[searchworx-spike] full envelope:", JSON.stringify(envelope, null, 2))

  return NextResponse.json(envelope)
}
