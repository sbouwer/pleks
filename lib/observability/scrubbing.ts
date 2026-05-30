/**
 * lib/observability/scrubbing.ts — POPIA-safe text scrubber (Sentry + bug reports)
 *
 * Notes: strips email addresses, SA ID numbers, SA phone numbers, card numbers,
 *        JWT/bearer tokens, and bytea \x-hex blobs from free text before it is
 *        stored or sent off-box. UUIDs (org_id, user_id) and the 32-char hex
 *        pleks_trace correlation id are KEPT — they are non-identifying and the
 *        trace is load-bearing for log correlation (so the hex pattern targets the
 *        \x-prefixed escape form only, never a bare hex run). scrubString/scrubObject
 *        are exported for reuse by the bug-report endpoint (ADDENDUM_68);
 *        scrubEvent is the Sentry beforeSend hook. Request body, cookies, and
 *        headers are always dropped in scrubEvent (may contain auth tokens).
 */
import type { ErrorEvent as SentryErrorEvent, EventHint as SentryEventHint } from "@sentry/nextjs"

const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b\d{13}\b/g, "[id-number]"],
  [/(\+27|0)[6-8]\d{8}\b/g, "[phone]"],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[card]"],
  // JWT (three base64url segments) — must precede the bearer rule so the token body is masked.
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[token]"],
  // case-insensitive flag folds case, so the class lists one case only (A-Z) to avoid a dup.
  [/Bearer\s+[A-Z0-9._-]+/gi, "Bearer [token]"],
  // bytea \x-escape blobs (e.g. the passkey-bug Buffer dumps). Targets the \x prefix
  // specifically — a bare 32-hex run (the pleks_trace id) is intentionally NOT matched.
  [/\\x[0-9a-fA-F]{6,}/g, "[hex]"],
]

export function scrubString(value: string): string {
  let result = value
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

export function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = scrubString(value)
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = scrubObject(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

export function scrubEvent(event: SentryErrorEvent, _hint?: SentryEventHint): SentryErrorEvent | null {
  // Sentry v10: exception.values is still { values?: Exception[] }
  event.exception?.values?.forEach(exception => {
    if (exception.value) exception.value = scrubString(exception.value)
  })

  // Sentry v10: breadcrumbs is Breadcrumb[] directly (no .values wrapper)
  event.breadcrumbs?.forEach(breadcrumb => {
    if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message)
    if (breadcrumb.data && typeof breadcrumb.data === "object") {
      breadcrumb.data = scrubObject(breadcrumb.data as Record<string, unknown>)
    }
  })

  if (event.request) {
    // Drop request body on all routes — covers /api/feedback where body may contain
    // free-text user input that could include PII (email, phone, ID numbers).
    delete event.request.data
    delete event.request.cookies
    delete event.request.headers
  }

  return event
}
