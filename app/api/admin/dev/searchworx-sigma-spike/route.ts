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

type PdfProbe  = { url: string; status: number; content_type: string | null; content_length: string | null }
type TokenMint = { endpoint: string; status: number; duration_ms: number; body: unknown }
type SigmaResult = { status: number; headers: Record<string, string>; duration_ms: number; body: unknown }

async function mintToken(
  baseUrl: string, loginPath: string, username: string, password: string,
): Promise<{ token: string; mint: TokenMint }> {
  const loginUrl = `${baseUrl}${loginPath}`
  const t0       = Date.now()
  const loginRes = await fetch(loginUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ Username: username, Password: password }),
  })
  const loginBody = await loginRes.json() as Record<string, unknown>
  const mint: TokenMint = { endpoint: loginUrl, status: loginRes.status, duration_ms: Date.now() - t0, body: loginBody }
  const token = (
    loginBody.SessionToken ??
    loginBody.Token ??
    (loginBody.ResponseObject as Record<string, unknown> | undefined)?.SessionToken
  ) as string | undefined
  return { token: token ?? "", mint }
}

async function resolveToken(
  baseUrl: string, username: string | undefined, password: string | undefined,
): Promise<{ token: string; mint: TokenMint | null } | { error: string }> {
  const staticToken = process.env.SEARCHWORX_SESSION_TOKEN ?? ""
  const loginPath   = process.env.SEARCHWORX_LOGIN_PATH
  if (!loginPath || !username || !password) return { token: staticToken, mint: null }
  try {
    const result = await mintToken(baseUrl, loginPath, username, password)
    return { token: result.token || staticToken, mint: result.mint }
  } catch (err) {
    return { error: `Login fetch failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function callSigma(endpoint: string, body: Record<string, unknown>): Promise<SigmaResult | { error: string }> {
  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 60_000)
  const t0         = Date.now()
  try {
    const res = await fetch(endpoint, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    })
    clearTimeout(timeout)
    const ct   = res.headers.get("content-type") ?? ""
    const sigmaBody = ct.includes("application/json") ? await res.json() : await res.text()
    return { status: res.status, headers: Object.fromEntries(res.headers), duration_ms: Date.now() - t0, body: sigmaBody }
  } catch (err) {
    clearTimeout(timeout)
    return { error: `Sigma fetch failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}

async function probePdf(pdfUrl: string): Promise<PdfProbe> {
  try {
    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 15_000)
    const pdfRes     = await fetch(pdfUrl, { method: "GET", signal: controller.signal })
    clearTimeout(timeout)
    await pdfRes.body?.cancel()
    return { url: pdfUrl, status: pdfRes.status, content_type: pdfRes.headers.get("content-type"), content_length: pdfRes.headers.get("content-length") }
  } catch (err) {
    return { url: pdfUrl, status: 0, content_type: null, content_length: `fetch error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not available in production", { status: 404 })
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const baseUrl = process.env.SEARCHWORX_API_URL
  if (!baseUrl) return NextResponse.json({ error: "SEARCHWORX_API_URL must be set in .env.local" }, { status: 500 })

  const tokenResult = await resolveToken(baseUrl, process.env.SEARCHWORX_USERNAME, process.env.SEARCHWORX_PASSWORD)
  if ("error" in tokenResult) return NextResponse.json({ error: tokenResult.error }, { status: 500 })
  if (!tokenResult.token) return NextResponse.json(
    { error: "No session token. Set SEARCHWORX_SESSION_TOKEN or SEARCHWORX_LOGIN_PATH + credentials." },
    { status: 500 },
  )

  const subject     = req.nextUrl.searchParams.get("id") === "goofy" ? TEST_IDS.goofy : TEST_IDS.eva
  const endpoint    = `${baseUrl}/credit/experian/sigma/consumerprofile/`
  const requestBody = { SessionToken: tokenResult.token, Reference: "PLEKS-SPIKE-001", EnquiryReason: "Affordability Assessment", ...subject }

  const sigmaResult = await callSigma(endpoint, requestBody)
  if ("error" in sigmaResult) return NextResponse.json({ error: sigmaResult.error }, { status: 500 })

  const pdfUrl   = (sigmaResult.body as Record<string, unknown> | null)?.["PDFCopyURL"] as string | undefined
  const pdfFetch = pdfUrl ? await probePdf(pdfUrl) : null

  const envelope = {
    token_mint: tokenResult.mint,
    request:    { url: endpoint, body: { ...requestBody, SessionToken: "***redacted***" } },
    response:   sigmaResult,
    pdf_fetch:  pdfFetch,
  }
  console.log("[searchworx-spike] full envelope:", JSON.stringify(envelope, null, 2))
  return NextResponse.json(envelope)
}
