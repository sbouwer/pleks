/**
 * lib/searchworx/client.ts — Searchworx REST API client (auth, token cache, error normalisation)
 *
 * Auth:   SEARCHWORX_USERNAME + SEARCHWORX_PASSWORD → POST /auth/login/ → SessionToken (UUID)
 * Notes:  ADDENDUM_14H + v3 amendment §J. Token cached in-memory per serverless instance (30 min TTL, 5 min refresh buffer).
 *         HTTP 200 on both success and error — structural detection drives success (hasProductData).
 *         ResponseMessage on success = canonical product identifier string (e.g. "CombinedConsumerCreditReport").
 *         Product modules call searchworxCall() with buildBody() owning all field casing.
 *         Each product has different casing conventions (CIPC Company uses camelCase; others PascalCase).
 *         Exports _mintToken, _validateToken, _resetCache for unit-test access only.
 */
import * as Sentry from "@sentry/nextjs"

// ─── Result envelope ──────────────────────────────────────────────────────────

export class SearchworxError extends Error {
  constructor(
    message: string,
    public readonly category:
      | "auth_expired"
      | "invalid_credentials"
      | "validation"
      | "rate_limited"
      | "vendor_unavailable"
      | "no_data"
      | "unknown",
    public readonly rawMessage: string,
  ) {
    super(message)
    this.name = "SearchworxError"
  }
}

export type SearchworxResult<TResult> =
  | { ok: true; data: TResult; pdfCopyUrl?: string }
  | { ok: false; error: SearchworxError }

// ─── Call options ─────────────────────────────────────────────────────────────

export interface SearchworxCallOptions {
  productPath: string
  buildBody:   (token: string) => Record<string, unknown>
  timeout_ms?: number
}

// ─── Token cache ──────────────────────────────────────────────────────────────

type TokenCacheEntry = { token: string; minted_at: number }
let cache: TokenCacheEntry | null = null

const TOKEN_TTL_MS           = 30 * 60 * 1000  // 30 min — confirm with John
const TOKEN_REFRESH_BUFFER_MS =  5 * 60 * 1000  // proactive re-validate when within 5 min of expiry

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Config readers (fail-loud) ───────────────────────────────────────────────

function getCredentials(): { username: string; password: string } {
  const username = process.env.SEARCHWORX_USERNAME
  const password = process.env.SEARCHWORX_PASSWORD
  if (!username || !password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SEARCHWORX_USERNAME and SEARCHWORX_PASSWORD required in production")
    }
    throw new Error(
      "Searchworx credentials not configured — set SEARCHWORX_USERNAME and SEARCHWORX_PASSWORD in .env.local",
    )
  }
  return { username, password }
}

function getBaseUrl(): string {
  const url = process.env.SEARCHWORX_BASE_URL
  if (!url) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SEARCHWORX_BASE_URL required in production")
    }
    return "https://uatrest.searchworks.co.za"
  }
  return url
}

// ─── Token management (exported for testability) ──────────────────────────────

export async function _mintToken(): Promise<string> {
  const { username, password } = getCredentials()
  const response = await fetch(`${getBaseUrl()}/auth/login/`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ Username: username, Password: password }),
  })
  if (!response.ok) throw new Error(`Searchworx auth HTTP ${response.status}`)

  const data = (await response.json()) as { ResponseMessage?: string }
  const token = data.ResponseMessage
  if (!token || !UUID_RE.test(token)) {
    throw new Error(`Searchworx auth failed: ${token ?? "no response"}`)
  }
  return token
}

export async function _validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${getBaseUrl()}/auth/validatetoken/`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ SessionToken: token }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { ResponseMessage?: string }
    return data.ResponseMessage === "True"
  } catch {
    return false
  }
}

export function _resetCache(): void {
  cache = null
}

async function getCachedToken(): Promise<string> {
  const now = Date.now()
  if (cache && now - cache.minted_at < TOKEN_TTL_MS - TOKEN_REFRESH_BUFFER_MS) {
    return cache.token
  }
  if (cache) {
    // In buffer window — proactively validate before committing to this token
    const valid = await _validateToken(cache.token)
    if (valid) return cache.token
  }
  const token = await _mintToken()
  cache = { token, minted_at: now }
  return token
}

// ─── Error categorisation ─────────────────────────────────────────────────────

function categoriseError(rawMessage: string): SearchworxError["category"] {
  const lower = rawMessage.toLowerCase()
  if (lower.includes("invalid sessiontoken") || lower.includes("session expired"))    return "auth_expired"
  if (lower.includes("invalid credentials") || lower.includes("invalid username"))    return "invalid_credentials"
  if (lower.includes("notfound") || lower.includes("no data") ||
      lower.includes("not found") || lower.includes("no record"))                    return "no_data"
  if (lower.includes("rate limit") || lower.includes("too many"))                    return "rate_limited"
  if (lower.includes("serviceoffline") || lower.includes("service offline") ||
      lower.includes("unavailable") || lower.includes("maintenance"))                return "vendor_unavailable"
  if (lower.includes("parameter") && lower.includes("was not supplied"))             return "validation"
  if (lower.includes("invalid") || lower.includes("required"))                       return "validation"
  return "unknown"
}

// ─── Success detection ────────────────────────────────────────────────────────

function hasProductData(responseObject: unknown): boolean {
  if (Array.isArray(responseObject)) {
    return responseObject.length > 0 &&
      Object.keys(responseObject[0] as object).some(k => k !== "SearchInformation")
  }
  if (responseObject && typeof responseObject === "object") {
    return Object.keys(responseObject).some(k => k !== "SearchInformation")
  }
  return false
}

// ─── Core call ────────────────────────────────────────────────────────────────

export async function searchworxCall<TResult>(
  options: SearchworxCallOptions,
): Promise<SearchworxResult<TResult>> {
  const baseUrl   = getBaseUrl()
  const timeoutMs = options.timeout_ms ?? 60_000

  for (let attempt = 1; attempt <= 2; attempt++) {
    const token = await getCachedToken()
    const body  = options.buildBody(token)

    let response: Response
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        response = await fetch(`${baseUrl}/${options.productPath}/`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(body),
          signal:  controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Searchworx timed out after ${timeoutMs / 1000}s`)
      }
      throw err
    }

    // HTTP-layer errors are transport failures (network down, 5xx from Searchworx infra)
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Searchworx HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    type Envelope = { ResponseMessage?: string; ResponseObject?: unknown; PDFCopyURL?: string }
    const data = (await response.json()) as Envelope

    // Structural success detection: ResponseObject must contain product data beyond SearchInformation.
    // ResponseMessage on success = product identifier (e.g. "CombinedConsumerCreditReport").
    // Failure responses can also populate ResponseObject with just SearchInformation — so presence
    // alone is not sufficient; we check that at least one key besides SearchInformation exists.
    if (hasProductData(data.ResponseObject)) {
      return {
        ok:         true,
        data:       data.ResponseObject as TResult,
        pdfCopyUrl: data.PDFCopyURL,
      }
    }

    const rawMessage = data.ResponseMessage ?? "Unknown response shape"
    const category   = categoriseError(rawMessage)

    if (category === "auth_expired" && attempt === 1) {
      cache = null  // force re-mint on next iteration
      Sentry.addBreadcrumb({ message: "Searchworx token expired — re-minting", level: "info" })
      continue
    }

    return {
      ok:    false,
      error: new SearchworxError(`Searchworx: ${rawMessage}`, category, rawMessage),
    }
  }

  // Safety — TypeScript requires a return after the loop
  throw new Error("Searchworx: retry loop exhausted")
}
