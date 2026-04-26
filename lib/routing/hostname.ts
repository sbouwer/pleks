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
