/**
 * app/api/admin/dev/searchworx-sigma-spike/route.ts — Searchworx UAT spike: Phase 2 auth flow + full Sigma capture
 *
 * Auth:  dev-only (NODE_ENV check) + admin session (isAdminAuthenticated)
 * Notes: Phase 2 — discovers auth field shape, validates token, fires real Sigma call, probes PDF.
 *        Write results to brief/vendors/searchworx/raw/ and SPIKE_RESULT_PHASE2.md when done.
 *        ADDENDUM_14A spike artefact — never import from production code.
 */
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"

const LOGIN_PATH     = "/auth/login/"
const VALIDATE_PATH  = "/auth/validatetoken/"
const SIGMA_PATH     = "/credit/experian/sigma/consumerprofile/"

const TEST_IDS = {
  eva:   { IDNumber: "6002100560184", Surname: "COMMERCE", firstname: "EVA" },
  goofy: { IDNumber: "7408285107080", Surname: "GOOFY",   firstname: "JUST" },
} as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepResponse {
  status: number
  headers: Record<string, string>
  body: unknown
  duration_ms: number
}

interface LoginStep {
  winning_request_shape: "A" | "B" | "C" | "none"
  request_body: Record<string, string>
  attempts: Array<{ shape: string; status: number; body: unknown }>
  response: StepResponse | null
  token: string
}

interface ValidateStep {
  winning_request_shape: "A" | "B" | "param" | "none"
  request_body: Record<string, string> | null
  response: StepResponse | null
}

interface SigmaStep {
  request_body: Record<string, unknown>
  response: StepResponse
}

interface PdfStep {
  url: string
  status: number
  content_type: string | null
  content_length: string | null
  needed_cookie: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function post(url: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<StepResponse> {
  const t0  = Date.now()
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  })
  const ct        = res.headers.get("content-type") ?? ""
  const resBody   = ct.includes("application/json") ? await res.json() : await res.text()
  const resHeaders = Object.fromEntries(res.headers)
  return { status: res.status, headers: resHeaders, body: resBody, duration_ms: Date.now() - t0 }
}

function extractToken(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const b = body as Record<string, unknown>
  return (
    (b.SessionToken as string | undefined) ??
    (b.Token        as string | undefined) ??
    ((b.ResponseObject as Record<string, unknown> | undefined)?.SessionToken as string | undefined)
  )
}

function isErrorResponse(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const b = body as Record<string, unknown>
  const msg = (b.ResponseMessage as string | undefined) ?? ""
  return msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail")
}

// ─── Step 1 — Login ───────────────────────────────────────────────────────────

async function stepLogin(baseUrl: string, username: string, password: string): Promise<LoginStep> {
  const loginUrl = `${baseUrl}${LOGIN_PATH}`

  const shapes: Array<{ shape: "A" | "B" | "C"; body: Record<string, string> }> = [
    { shape: "A", body: { Username: username,  Password: password } },
    { shape: "B", body: { username,             password           } },
    { shape: "C", body: { UserName: username,   Password: password } },
  ]

  const attempts: LoginStep["attempts"] = []

  for (const { shape, body } of shapes) {
    console.log(`[spike] step1 login attempt ${shape}:`, JSON.stringify({ ...body, Password: "***" }))
    const r = await post(loginUrl, body)
    attempts.push({ shape, status: r.status, body: r.body })
    console.log(`[spike] step1 attempt ${shape} → status ${r.status}:`, JSON.stringify(r.body))

    const token = extractToken(r.body)
    if (r.status < 300 && token && !isErrorResponse(r.body)) {
      return {
        winning_request_shape: shape,
        request_body: { ...body, Password: "***REDACTED***" },
        attempts,
        response: r,
        token,
      }
    }
  }

  return {
    winning_request_shape: "none",
    request_body: { Username: username, Password: "***REDACTED***" },
    attempts,
    response: null,
    token: "",
  }
}

// ─── Step 2 — Validatetoken ───────────────────────────────────────────────────

async function stepValidate(baseUrl: string, token: string): Promise<ValidateStep> {
  const validateUrl = `${baseUrl}${VALIDATE_PATH}`

  // Attempt A — SessionToken in body
  const bodyA = { SessionToken: token }
  console.log("[spike] step2 validatetoken attempt A:", JSON.stringify(bodyA))
  const rA = await post(validateUrl, bodyA)
  console.log(`[spike] step2 attempt A → status ${rA.status}:`, JSON.stringify(rA.body))
  if (rA.status < 300 && !isErrorResponse(rA.body)) {
    return { winning_request_shape: "A", request_body: bodyA, response: rA }
  }

  // Attempt B — token as query param, empty body
  const paramUrl = `${validateUrl}?token=${encodeURIComponent(token)}`
  console.log("[spike] step2 validatetoken attempt B (query param):", paramUrl)
  const t0B = Date.now()
  const resB = await fetch(paramUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(15_000) })
  const ctB    = resB.headers.get("content-type") ?? ""
  const bodyBRaw = ctB.includes("application/json") ? await resB.json() : await resB.text()
  const rB: StepResponse = { status: resB.status, headers: Object.fromEntries(resB.headers), body: bodyBRaw, duration_ms: Date.now() - t0B }
  console.log(`[spike] step2 attempt B → status ${rB.status}:`, JSON.stringify(rB.body))
  if (rB.status < 300 && !isErrorResponse(rB.body)) {
    return { winning_request_shape: "param", request_body: null, response: rB }
  }

  // All failed — return A's response for debugging
  return { winning_request_shape: "none", request_body: bodyA, response: rA }
}

// ─── Step 3 — Sigma call ──────────────────────────────────────────────────────

async function stepSigma(baseUrl: string, token: string, subject: { IDNumber: string; Surname: string; firstname: string }): Promise<SigmaStep> {
  const sigmaUrl  = `${baseUrl}${SIGMA_PATH}`
  const reqBody   = { SessionToken: token, Reference: "PLEKS-SPIKE-002", EnquiryReason: "Affordability Assessment", ...subject }
  console.log("[spike] step3 sigma call:", JSON.stringify({ ...reqBody, SessionToken: "***" }))
  const r = await post(sigmaUrl, reqBody)
  console.log(`[spike] step3 sigma → status ${r.status}:`, JSON.stringify(r.body).slice(0, 500))
  return { request_body: { ...reqBody, SessionToken: "***REDACTED***" }, response: r }
}

// ─── Step 4 — PDF probe ───────────────────────────────────────────────────────

async function stepPdf(pdfUrl: string, sessionCookie?: string): Promise<PdfStep> {
  console.log("[spike] step4 pdf probe (no auth):", pdfUrl)
  try {
    const res1 = await fetch(pdfUrl, { method: "GET", signal: AbortSignal.timeout(15_000) })
    await res1.body?.cancel()
    if (res1.status < 300 || res1.status === 200) {
      return { url: pdfUrl, status: res1.status, content_type: res1.headers.get("content-type"), content_length: res1.headers.get("content-length"), needed_cookie: false }
    }

    // 401/403 — retry with cookie if available
    if ((res1.status === 401 || res1.status === 403) && sessionCookie) {
      console.log("[spike] step4 pdf probe (with cookie):", pdfUrl)
      const res2 = await fetch(pdfUrl, { method: "GET", headers: { Cookie: sessionCookie }, signal: AbortSignal.timeout(15_000) })
      await res2.body?.cancel()
      return { url: pdfUrl, status: res2.status, content_type: res2.headers.get("content-type"), content_length: res2.headers.get("content-length"), needed_cookie: true }
    }

    return { url: pdfUrl, status: res1.status, content_type: res1.headers.get("content-type"), content_length: res1.headers.get("content-length"), needed_cookie: false }
  } catch (err) {
    return { url: pdfUrl, status: 0, content_type: null, content_length: `fetch error: ${err instanceof Error ? err.message : String(err)}`, needed_cookie: false }
  }
}

// ─── GET handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not available in production", { status: 404 })
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const baseUrl  = process.env.SEARCHWORX_API_URL
  const username = process.env.SEARCHWORX_USERNAME
  const password = process.env.SEARCHWORX_PASSWORD

  if (!baseUrl || !username || !password) {
    return NextResponse.json({ error: "SEARCHWORX_API_URL, SEARCHWORX_USERNAME, and SEARCHWORX_PASSWORD must all be set in .env.local" }, { status: 500 })
  }

  const subject = req.nextUrl.searchParams.get("id") === "goofy" ? TEST_IDS.goofy : TEST_IDS.eva

  // Step 1 — login
  const loginResult = await stepLogin(baseUrl, username, password)
  if (!loginResult.token) {
    console.log("[spike] step1 all login attempts failed — returning debug info")
    return NextResponse.json({ step1_auth_login: loginResult, error: "All login attempts failed — see attempts array for details" }, { status: 502 })
  }

  // Step 2 — validatetoken
  const validateResult = await stepValidate(baseUrl, loginResult.token)

  // Step 3 — sigma
  const sigmaResult = await stepSigma(baseUrl, loginResult.token, subject)

  // Step 4 — PDF (if sigma returned a URL)
  const pdfUrl = (sigmaResult.response.body as Record<string, unknown> | null)?.["PDFCopyURL"] as string | undefined
  const sessionCookie = loginResult.response?.headers["set-cookie"] ?? undefined
  const pdfResult: PdfStep | null = pdfUrl ? await stepPdf(pdfUrl, sessionCookie) : null

  const envelope = {
    step1_auth_login:  loginResult,
    step2_validatetoken: validateResult,
    step3_sigma_call: sigmaResult,
    step4_pdf_fetch:  pdfResult,
  }
  console.log("[spike] full envelope:", JSON.stringify(envelope, null, 2))
  return NextResponse.json(envelope)
}
