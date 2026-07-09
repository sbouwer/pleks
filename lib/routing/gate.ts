/**
 * lib/routing/gate.ts — pure request-gate decision helpers for proxy.ts (the Next.js middleware)
 *
 * Notes:  The load-bearing routing/auth decisions, extracted from proxy.ts so they are unit-testable
 *         WITHOUT importing the edge-runtime middleware (Supabase session refresh, next/headers). proxy.ts
 *         imports these; behaviour is identical. Every function here is pure (string / JSON / ROUTE_MANIFEST
 *         data only) — no I/O, no cookies-object, no NextRequest. This is where a wrong prefix silently
 *         un-gates a route, so it gets the test coverage.
 */

import { ROUTE_MANIFEST } from "@/lib/routing/manifest"

/** Prefixes that bypass ALL middleware gates — the handlers validate their own secrets. A wrong entry here
 *  makes an authenticated route publicly reachable, so this is the highest-stakes list in the gate. */
export const WEBHOOK_PREFIXES = ["/api/webhooks", "/api/cron", "/api/waitlist", "/api/health", "/api/status", "/api/legal"]

/** True when the path bypasses all gates (webhook/cron/etc.). Behaviour-identical to the original proxy.ts
 *  check — a plain prefix `startsWith`. (A stricter segment match would be a separate, deliberate change;
 *  the real routes are always `/<prefix>/…`, so it never differs in practice.) */
export function isWebhookPath(pathname: string): boolean {
  return WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))
}

/** Apex/marketing paths served on the marketing host (everything else 308s to the app host). */
export const APEX_PREFIXES = [
  "/pricing",
  "/privacy", "/terms", "/credit-check-policy", "/cookie-policy", "/paia-manual",
  "/popia-register", "/definitions", "/contact", "/demo", "/marketing",
  "/api/paia-manual-pdf",
]

export function isApexPath(pathname: string): boolean {
  if (pathname === "/") return true
  return APEX_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

/** Admin surface (`/admin/*` UI + `/api/admin/*`) — the HMAC-token-gated namespace. */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin"     || pathname.startsWith("/admin/") ||
         pathname === "/api/admin" || pathname.startsWith("/api/admin/")
}

/** Resolve the ROUTE_MANIFEST rule for a path — longest matching prefix wins. null = no rule (public). */
export function matchManifest(pathname: string) {
  let best: string | null = null
  for (const prefix of Object.keys(ROUTE_MANIFEST)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = prefix
    }
  }
  return best ? ROUTE_MANIFEST[best] : null
}

/** Effective tier from the subscription — a live, unconverted, unexpired trial shows its trial_tier. */
export function deriveTierFromSub(sub: {
  tier: string; status: string
  trial_tier?: string | null; trial_ends_at?: string | null; trial_converted?: boolean | null
} | null | undefined): string {
  if (!sub) return "owner"
  if (sub.status === "trialing" && sub.trial_ends_at && !sub.trial_converted &&
      sub.trial_tier && new Date(sub.trial_ends_at) > new Date()) {
    return sub.trial_tier
  }
  return sub.tier ?? "owner"
}

/** True only if pleks_org parses and carries a non-empty role — what the gate needs to authorise an
 *  agent-class route. A present-but-role-less cookie returns false so ensureOrgCookies re-hydrates. */
export function orgCookieHasRole(raw: string): boolean {
  try {
    return !!(JSON.parse(raw) as { role?: string }).role
  } catch {
    return false
  }
}

export function extractCachedOrgId(raw: string): string | null {
  try {
    return (JSON.parse(raw) as { org_id?: string }).org_id ?? null
  } catch {
    return null
  }
}

/** The user_id the cookie was written for — used to detect a different user on the same browser (shared
 *  desk) so we never authorise B with A's org cookie. null = unparseable or absent. */
export function cookieUserId(raw: string | undefined): string | null {
  if (!raw) return null
  try {
    return (JSON.parse(raw) as { user_id?: string }).user_id ?? null
  } catch {
    return null
  }
}
