/**
 * lib/routing/absoluteUrl.ts — build an absolute URL against the ONE product/marketing origin
 *
 * Notes:  Emails, PDFs, QR codes and deep links must be absolute, and every one must resolve against the
 *         same origin — `APP_URL` (product) or `MARKETING_URL` (apex), both centralised in lib/env with a
 *         single canonical default. This is the one place a path becomes a full URL, so a stray trailing
 *         slash, a missing leading slash, or a re-hardcoded origin can't creep back in differently per call
 *         site. See the ABSOLUTE URL DISCIPLINE section in CLAUDE.md.
 *
 *         Client-safe — APP_URL/MARKETING_URL are literal NEXT_PUBLIC_* reads, so this works in the browser.
 */
import { APP_URL, MARKETING_URL } from "@/lib/env"

function join(origin: string, path: string): string {
  if (!path) return origin
  const base = origin.replace(/\/$/, "")
  return path.startsWith("/") ? `${base}${path}` : `${base}/${path}`
}

/** An absolute URL on the product origin (app.pleks.co.za). `absoluteUrl("/wo/123")` → the full link. */
export function absoluteUrl(path = ""): string {
  return join(APP_URL, path)
}

/** An absolute URL on the marketing/apex origin (pleks.co.za) — legal pages, public marketing links. */
export function marketingUrl(path = ""): string {
  return join(MARKETING_URL, path)
}
