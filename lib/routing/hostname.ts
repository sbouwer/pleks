/**
 * lib/routing/hostname.ts — resolves which subdomain context a request is on
 *
 * Auth:  none — pure utility
 * Notes: status.pleks.co.za is external (Better Stack) — never reaches this app.
 *        In dev/preview all requests resolve to "app" to avoid needing local DNS.
 */
export type HostContext = "marketing" | "app" | "admin"

export function resolveHostContext(host: string | null): HostContext {
  // Dev: always resolve to app context — no subdomain simulation needed locally.
  if (process.env.NODE_ENV === "development") return "app"

  // Preview: Vercel preview URLs always resolve to app context.
  // Marketing pages in preview are accessed via /marketing/* path prefix.
  if (process.env.VERCEL_ENV === "preview") return "app"

  // Production: hostname-based split.
  if (host?.startsWith("admin.")) return "admin"
  if (host?.startsWith("app."))   return "app"
  return "marketing"
}
