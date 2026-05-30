/**
 * lib/feedback/capture-buffer.ts — Always-on client diagnostics ring buffer (ADDENDUM_68 Slice 1)
 *
 * Auth:   none — client-only instrument, mounted once via CaptureBufferProvider.
 * Data:   in-memory ring buffers of recent console/window errors + failed fetches,
 *         plus a snapshot of device/route context read on demand at report time.
 * Notes:  Fire-and-forget — every path is wrapped so instrumentation can NEVER throw
 *         into the app. pleks_trace is read from document.cookie (not a header).
 *         x-vercel-id is read from fetch responses. No request/response bodies are
 *         ever captured. snapshotContext() is consumed by BugReportDialog.
 */

export interface CapturedError {
  ts:      number
  level:   "error" | "unhandledrejection"
  message: string
}

export interface CapturedRequest {
  method: string
  path:   string
  status: number
  at:     number
}

export interface BugSnapshot {
  routePath:       string
  fullUrlScrubbed: string
  referrerPath:    string | null
  plekTrace:       string | null
  xVercelId:       string | null
  appVersion:      string
  userAgentParsed: string
  viewport:        string
  onlineState:     string
  pwaMode:         boolean
  consoleErrors:   CapturedError[]
  failedRequests:  CapturedRequest[]
  clientTimestamp: string
}

const ERROR_CAP   = 20
const REQUEST_CAP = 10
const MSG_MAX     = 500

const errors:   CapturedError[]   = []
const requests: CapturedRequest[] = []
let lastVercelId: string | null = null

let initialised = false
let teardown: (() => void) | null = null

function pushError(level: CapturedError["level"], message: string) {
  errors.push({ ts: Date.now(), level, message: String(message).slice(0, MSG_MAX) })
  if (errors.length > ERROR_CAP) errors.shift()
}

function pushRequest(method: string, path: string, status: number) {
  requests.push({ method, path, status, at: Date.now() })
  if (requests.length > REQUEST_CAP) requests.shift()
}

function errText(message: unknown, stack?: unknown): string {
  const m = typeof message === "string" ? message : String(message)
  const s = typeof stack === "string" ? stack : ""
  return s ? `${m}\n${s}` : m
}

/**
 * Mounts the capture instruments. Idempotent — a second call is a no-op and returns
 * the existing teardown. Returns a teardown that restores console.error/fetch and
 * removes listeners (used by the provider's effect cleanup).
 */
export function initCaptureBuffer(): () => void {
  if (typeof window === "undefined") return () => {}
  if (initialised) return teardown ?? (() => {})
  initialised = true

  const onError = (e: ErrorEvent) => {
    try { pushError("error", errText(e.message, e.error?.stack)) } catch { /* never throw */ }
  }
  const onRejection = (e: PromiseRejectionEvent) => {
    try {
      const r = e.reason as { message?: unknown; stack?: unknown } | undefined
      pushError("unhandledrejection", errText(r?.message ?? e.reason, r?.stack))
    } catch { /* never throw */ }
  }
  window.addEventListener("error", onError)
  window.addEventListener("unhandledrejection", onRejection)

  // Narrow console.error wrapper — call original, then record.
  const origConsoleError = window.console.error.bind(window.console)
  window.console.error = (...args: unknown[]) => {
    origConsoleError(...args)
    try { pushError("error", args.map(a => (typeof a === "string" ? a : safeStringify(a))).join(" ")) } catch { /* never throw */ }
  }

  // fetch wrapper — read x-vercel-id + record ≥400. Never alters fetch semantics
  // (no body read, original response returned, rejections propagate untouched).
  const origFetch = window.fetch
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return origFetch.call(window, input, init).then((res) => {
      try {
        const vid = res.headers.get("x-vercel-id")
        if (vid) lastVercelId = vid
        if (res.status >= 400) {
          const method = init?.method ?? (input instanceof Request ? input.method : "GET")
          pushRequest(method.toUpperCase(), urlPath(input), res.status)
        }
      } catch { /* never throw */ }
      return res
    })
  }

  teardown = () => {
    window.removeEventListener("error", onError)
    window.removeEventListener("unhandledrejection", onRejection)
    window.console.error = origConsoleError
    window.fetch = origFetch
    initialised = false
    teardown = null
  }
  return teardown
}

function urlPath(input: RequestInfo | URL): string {
  try {
    let raw: string
    if (typeof input === "string") raw = input
    else if (input instanceof URL) raw = input.href
    else raw = input.url
    return new URL(raw, window.location.origin).pathname
  } catch { return "unknown" }
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v) } catch { return String(v) }
}

function readTraceCookie(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)pleks_trace=([^;]+)/)
    return m ? decodeURIComponent(m[1]) : null
  } catch { return null }
}

function scrubUrl(pathAndQuery: string): string {
  // Strip values of obviously-sensitive query params; the server scrubs text too.
  try {
    const u = new URL(pathAndQuery, window.location.origin)
    for (const key of ["token", "access_token", "refresh_token", "code", "secret", "key", "hash"]) {
      if (u.searchParams.has(key)) u.searchParams.set(key, "[redacted]")
    }
    return u.pathname + (u.search || "")
  } catch { return pathAndQuery }
}

const OS_MATCHERS: Array<[RegExp, string]> = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Windows/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
]

function parseUA(ua: string): string {
  let os = "Unknown"
  for (const [re, name] of OS_MATCHERS) {
    if (re.test(ua)) { os = name; break }
  }
  let browser = "Unknown"
  const m = /(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/.exec(ua)
  if (m) {
    const name: Record<string, string> = { Edg: "Edge", OPR: "Opera", Chrome: "Chrome", Firefox: "Firefox", Version: "Safari" }
    browser = `${name[m[1]] ?? m[1]} ${m[2]}`
  }
  return `${os} ${browser}`.trim()
}

interface NetworkInformation { effectiveType?: string }

function onlineStateOf(nav: Navigator | undefined, conn: NetworkInformation | undefined): string {
  if (nav?.onLine === false) return "offline"
  return conn?.effectiveType ? `online/${conn.effectiveType}` : "online"
}

/**
 * Reads a full diagnostics snapshot for a bug report. Never throws — every field
 * falls back to a safe default. Returns the in-memory error/request buffers (copies).
 */
export function snapshotContext(): BugSnapshot {
  const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } }
  const nav = typeof navigator !== "undefined" ? navigator : undefined
  const conn = (nav as (Navigator & { connection?: NetworkInformation }) | undefined)?.connection

  return {
    routePath:       safe(() => window.location.pathname, "unknown"),
    fullUrlScrubbed: safe(() => scrubUrl(window.location.pathname + window.location.search), "unknown"),
    referrerPath:    safe(() => {
      if (!document.referrer) return null
      const r = new URL(document.referrer)
      return r.origin === window.location.origin ? r.pathname : null
    }, null),
    plekTrace:       readTraceCookie(),
    xVercelId:       lastVercelId,
    appVersion:      process.env.NEXT_PUBLIC_BUILD_ID ?? "local",
    userAgentParsed: safe(() => parseUA(nav?.userAgent ?? ""), "Unknown"),
    viewport:        safe(() => `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio ?? 1}x`, "unknown"),
    onlineState:     safe(() => onlineStateOf(nav, conn), "unknown"),
    pwaMode:         safe(() => window.matchMedia("(display-mode: standalone)").matches, false),
    consoleErrors:   [...errors],
    failedRequests:  [...requests],
    clientTimestamp: new Date().toISOString(),
  }
}
