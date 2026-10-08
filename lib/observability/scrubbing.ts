/**
 * lib/observability/scrubbing.ts — POPIA-safe text scrubber (Sentry + bug reports)
 *
 * Notes: strips email addresses, SA ID numbers, SA phone numbers, card numbers,
 *        JWT/bearer tokens, and bytea \x-hex blobs from free text before it is
 *        stored or sent off-box. UUIDs (org_id, user_id) and the 32-char hex
 *        pleks_trace correlation id are KEPT in prose — they are non-identifying and
 *        the trace is load-bearing for log correlation. scrubString/scrubObject are
 *        exported for reuse by the bug-report endpoint (ADDENDUM_68); scrubEvent is
 *        the Sentry beforeSend hook, scrubTransaction its beforeSendTransaction
 *        twin, and scrubSpan the beforeSendSpan third path (browser standalone
 *        web-vital spans skip both of the others). Request body, cookies, headers and query string are always dropped.
 *
 *        Link tokens are the other half. They live in URLs, as a query param
 *        (`/wo/…?token=`) OR as a path segment (`/approve/[token]`), in five shapes:
 *        UUID (WO, signature, team invite), 48- and 64-hex, 43-char base64url
 *        (delivery notices), and `<base64url>.<hmac>` (screening result links). A
 *        path segment that looks like one becomes `:id` WHEREVER it appears — in a
 *        URL field or inside prose — so a UUID after a `/` is masked while a UUID in
 *        a sentence is kept. That costs object ids in URLs: an id that matters goes
 *        on the event as an explicit tag, never recovered from the path.
 *
 *        The event walk is deliberately GENERIC (every string under contexts, tags,
 *        extra, breadcrumbs, spans, request): the SDK puts the root span's
 *        `http.target`/`url.full` in `contexts.trace.data` and Next's request path
 *        in `contexts.nextjs`, neither of which a field-by-field list named. A field
 *        list is a list of the places someone thought of.
 */
import type {
  ErrorEvent as SentryErrorEvent,
  Event as SentryEvent,
  EventHint as SentryEventHint,
} from "@sentry/nextjs"

// @sentry/nextjs does not re-export core's TransactionEvent; this is its definition.
type SentryTransactionEvent = SentryEvent & { type: "transaction" }

const BASE64URL = /^[A-Za-z0-9_-]+$/
const HAS_DIGIT = /\d/

/** A path segment shaped like a link token. Route words are under 32 chars and digit-free (longest today: 27). */
function isTokenSegment(seg: string): boolean {
  const parts = seg.split(".")
  if (parts.length > 1) return parts.length <= 3 && parts.every(p => p.length >= 16 && BASE64URL.test(p))
  if (seg.length < 16 || !BASE64URL.test(seg)) return false
  return seg.length >= 32 || HAS_DIGIT.test(seg)
}

/** Every `/<segment>` in a string whose segment is token-shaped becomes `/:id`; a trailing full stop is kept. */
function maskPathSegments(value: string): string {
  return value.replace(/\/([A-Za-z0-9_.-]{16,})/g, (whole, run: string) => {
    let seg = run
    while (seg.endsWith(".")) seg = seg.slice(0, -1)
    return isTokenSegment(seg) ? `/:id${run.slice(seg.length)}` : whole
  })
}

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
  // 48/64-hex tokens (unsubscribe, application, step-up), glued to a word or not. The trace id is 32.
  [/(?<![0-9a-f])[0-9a-f]{48,}(?![0-9a-f])/gi, "[token]"],
  // A credential-named query param in free text ("GET /wo/x?token=…").
  [/([?&](?:token|code|key|secret|sig|signature)=)[^&\s#"']+/gi, "$1[token]"],
]

export function scrubString(value: string): string {
  let result = maskPathSegments(value)
  for (const [pattern, replacement] of SCRUB_PATTERNS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

/** A URL keeps its route; its query, fragment and every token-shaped path segment go. */
export function scrubUrl(value: string): string {
  const cut = value.search(/[?#]/)
  return scrubString(cut === -1 ? value : value.slice(0, cut))
}

// Absolute URLs inside prose lose their query string too; relative ones keep it, minus credential params.
const URL_IN_TEXT = /https?:\/\/[^\s"'<>]+/g

function scrubText(value: string): string {
  return scrubString(value.replace(URL_IN_TEXT, scrubUrl))
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

// Keys whose value IS a URL or path (fetch/xhr `url`, navigation `from`/`to`, OTel `http.*`/`url.*`,
// Next's `request_path`), and keys that hold only a query or fragment, which are dropped.
const URL_KEY = /(?:^|[._])(?:url|full|path|target|from|to|route|transaction)$/i
const QUERY_KEY = /(?:^|[._])(?:query|query_string|fragment)$/i

function scrubValue(value: unknown, key?: string): unknown {
  if (typeof value === "string") return key !== undefined && URL_KEY.test(key) ? scrubUrl(value) : scrubText(value)
  if (Array.isArray(value)) return value.map(v => scrubValue(v))
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (!QUERY_KEY.test(k)) result[k] = scrubValue(v, k)
    }
    return result
  }
  return value
}

/** A `scheme://` url (http, https, app) whose PATH is not under /_next/. Query and fragment are not read. */
function isPageUrl(value: string): boolean {
  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(value)
  return url !== null && !url[1].startsWith("/_next/")
}

function scrubCommon<E extends SentryEvent>(event: E): E {
  event.exception?.values?.forEach(exception => {
    if (exception.value) exception.value = scrubText(exception.value)
    // The browser SDK writes the PAGE url into a frame when the script url is empty ("Script error.",
    // inline handlers), and @sentry/nextjs's frame normalization has already rewritten its origin to
    // app:// by the time beforeSend runs — so any scheme counts. A bundle under /_next/ keeps its path,
    // which symbolication needs (its build id would read as a token).
    exception.stacktrace?.frames?.forEach(frame => {
      if (frame.filename && isPageUrl(frame.filename)) frame.filename = scrubUrl(frame.filename)
      if (frame.abs_path && isPageUrl(frame.abs_path)) frame.abs_path = scrubUrl(frame.abs_path)
    })
  })
  if (event.message) event.message = scrubText(event.message)

  // Sentry v10: breadcrumbs is Breadcrumb[] directly (no .values wrapper)
  event.breadcrumbs?.forEach(breadcrumb => {
    if (breadcrumb.message) breadcrumb.message = scrubText(breadcrumb.message)
    if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data) as typeof breadcrumb.data
  })

  if (event.request) {
    // Drop request body on all routes — covers /api/feedback where body may contain
    // free-text user input that could include PII (email, phone, ID numbers).
    delete event.request.data
    delete event.request.cookies
    delete event.request.headers
    delete event.request.query_string
    if (event.request.url) event.request.url = scrubUrl(event.request.url)
  }

  // A pageload transaction can be named by its raw pathname when the route is not parameterised.
  if (event.transaction) event.transaction = scrubUrl(event.transaction)
  // The root span's attributes live in contexts.trace.data, not in spans[].
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts
  if (event.tags) event.tags = scrubValue(event.tags) as typeof event.tags
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra

  event.spans?.forEach(scrubSpan)

  return event
}

/** beforeSendSpan: a standalone web-vital span carries its page in `data.transaction`, a URL key. */
export function scrubSpan<S extends { description?: string; data?: Record<string, unknown> }>(span: S): S {
  if (span.description) span.description = scrubText(span.description)
  if (span.data) span.data = scrubValue(span.data) as S["data"]
  return span
}

export function scrubEvent(event: SentryErrorEvent, _hint?: SentryEventHint): SentryErrorEvent | null {
  return scrubCommon(event)
}

export function scrubTransaction(event: SentryTransactionEvent, _hint?: SentryEventHint): SentryTransactionEvent | null {
  return scrubCommon(event)
}
