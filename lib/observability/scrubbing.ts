/**
 * lib/observability/scrubbing.ts — POPIA-safe Sentry event scrubber
 *
 * Notes: strips email addresses, SA ID numbers, SA phone numbers, and card
 *        numbers from exception messages and breadcrumbs before sending to
 *        Sentry. UUIDs (org_id, user_id) are kept — they are non-identifying
 *        without access to the DB. Request body, cookies, and headers are
 *        always dropped (may contain auth tokens or session data).
 */
import type { ErrorEvent as SentryErrorEvent, EventHint as SentryEventHint } from "@sentry/nextjs"

const SCRUB_PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]"],
  [/\b\d{13}\b/g, "[id-number]"],
  [/(\+27|0)[6-8]\d{8}\b/g, "[phone]"],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[card]"],
]

function scrubString(value: string): string {
  let result = value
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
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
