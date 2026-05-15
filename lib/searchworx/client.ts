/**
 * lib/searchworx/client.ts — Searchworx REST API client (shared foundation)
 *
 * Auth:   Basic auth (SEARCHWORX_USERNAME + SEARCHWORX_PASSWORD)
 * Notes:  ADDENDUM_14A. First consumer: property-intelligence pulls (Deeds, Lightstone, CIPC).
 *         Future consumers: 14B applicant-screening products (TU PP, Trace, VCCB Income, etc.)
 *         Keep this surface small — per-product modules own request shaping and response parsing.
 *         D-14A-21: bias toward simplicity; add abstraction when 14B surfaces real divergence.
 */

export interface SearchworxResponse<T> {
  ok:   true
  data: T
}

export interface SearchworxError {
  ok:    false
  code:  "auth_failed" | "not_found" | "vendor_error" | "timeout" | "network_error"
  message: string
  status?: number
}

export type SearchworxResult<T> = SearchworxResponse<T> | SearchworxError

const TIMEOUT_MS = 60_000

function getCredentials(): { username: string; password: string; baseUrl: string } {
  const username = process.env.SEARCHWORX_USERNAME
  const password = process.env.SEARCHWORX_PASSWORD
  const baseUrl  = process.env.SEARCHWORX_API_URL

  if (!username || !password || !baseUrl) {
    throw new Error("SEARCHWORX_USERNAME, SEARCHWORX_PASSWORD, and SEARCHWORX_API_URL must be set")
  }
  return { username, password, baseUrl }
}

export async function searchworxPost<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<SearchworxResult<T>> {
  const { username, password, baseUrl } = getCredentials()
  const credentials = Buffer.from(`${username}:${password}`).toString("base64")
  const url = `${baseUrl}${path}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (res.status === 401) {
      return { ok: false, code: "auth_failed", message: "Searchworx authentication failed", status: 401 }
    }
    if (res.status === 404) {
      return { ok: false, code: "not_found", message: "Searchworx: no record found", status: 404 }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        ok:      false,
        code:    "vendor_error",
        message: `Searchworx returned ${res.status}: ${text.slice(0, 200)}`,
        status:  res.status,
      }
    }

    const data = await res.json() as T
    return { ok: true, data }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, code: "timeout", message: `Searchworx timed out after ${TIMEOUT_MS / 1000}s` }
    }
    return {
      ok:      false,
      code:    "network_error",
      message: err instanceof Error ? err.message : "Unknown network error",
    }
  }
}
