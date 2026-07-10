/**
 * lib/routing/hostname.ts — resolves which subdomain context a request is on
 *
 * Auth:  none — pure utility
 * Notes: In dev/preview all requests resolve to "app" to avoid needing local DNS.
 *        status.pleks.co.za is served by this app (not Better Stack) — proxy
 *        rewrites status.* hostname to the internal /status route.
 */
import { isDevelopment, optionalEnv } from "@/lib/env"
export type HostContext = "marketing" | "app" | "admin" | "status"

export function resolveHostContext(host: string | null): HostContext {
  // Dev: always resolve to app context — no subdomain simulation needed locally.
  if (isDevelopment()) return "app"

  // Preview: Vercel preview URLs always resolve to app context.
  // Marketing pages in preview are accessed via /marketing/* path prefix.
  if (optionalEnv("VERCEL_ENV") === "preview") return "app"

  // Production: hostname-based split.
  if (host?.startsWith("admin."))  return "admin"
  if (host?.startsWith("status.")) return "status"
  if (host?.startsWith("app."))    return "app"
  return "marketing"
}
