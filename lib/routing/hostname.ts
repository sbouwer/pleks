/**
 * lib/routing/hostname.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
export type HostContext = "marketing" | "app"

export function resolveHostContext(host: string | null): HostContext {
  // Dev: always resolve to app context — no subdomain simulation needed locally.
  if (process.env.NODE_ENV === "development") return "app"

  // Preview: Vercel preview URLs always resolve to app context.
  // Marketing pages in preview are accessed via /marketing/* path prefix.
  if (process.env.VERCEL_ENV === "preview") return "app"

  // Production: hostname-based split.
  if (host?.startsWith("app.")) return "app"
  return "marketing"
}
