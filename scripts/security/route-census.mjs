/**
 * scripts/security/route-census.mjs — SSOT route census for the security audit (Cat-8).
 *
 * Truth Pipeline applied to the audit itself: the list of API routes is DERIVED from
 * disk (app/api/**\/route.ts), never hand-maintained. Each route's auth model is DERIVED
 * from the auth helper it actually calls — not declared — so a new route is classified by
 * how it protects itself, and a new route with NO recognized gate that isn't explicitly
 * allowlisted-as-public FAILS the audit (see assertCensusComplete). This is what made the
 * saveContentRow / adminOrgActions holes invisible to the old hand-listed Cat-8.
 *
 * Buckets (priority order):
 *   webhook       — /api/webhooks/*                         (signature-gated; Cat-10)
 *   cron          — /api/cron/* or x-cron-secret/CRON_SECRET (secret-gated; Cat-cron)
 *   admin         — /api/admin/* or requireAdminAuth/isAdminAuthenticated (HMAC; proxy + in-handler)
 *   portal        — getTenantSession/getPortalSession        (tenant/landlord/supplier session)
 *   authenticated — requireAgentWriteAccess/gateway/gatewaySSR/auth.getUser (agent session) → Cat-8 hits these
 *   public        — none of the above → MUST be in PUBLIC_ALLOWLIST with a reason, else FAIL
 */
import { readdirSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"

const API_ROOT = join(process.cwd(), "app", "api")

/**
 * Routes with no session/secret gate BY DESIGN. Each needs a reason. A route that lands in
 * the `public` bucket and is NOT here fails the census — forcing a conscious decision.
 * "REVIEW:" prefixed reasons are allowlisted-but-flagged for a human to confirm they are safe.
 */
export const PUBLIC_ALLOWLIST = {
  // Applicant flow — token-in-body/param possession is the credential (Cat-4 tests the tokens).
  "/api/applications/create": "public applicant entry (rate-limited)",
  "/api/applications/save-draft": "applicant token-gated (no agent session)",
  "/api/applications/resend-link": "applicant token-gated",
  "/api/applications/co-applicant/[token]/save": "co-applicant access_token is the credential",
  "/api/applications/[id]/co-status": "applicant polling; token-gated",
  "/api/applications/[id]/co-applicant": "applicant token-gated (resolveApplicationCredential)",
  "/api/applications/[id]/detect-document": "applicant token-gated",
  "/api/applications/[id]/documents": "applicant token-gated",
  "/api/applications/[id]/link-account": "applicant token-gated (account-at-completion, 14R)",
  "/api/applications/[id]/screen": "applicant token-gated",
  "/api/applications/[id]/submit": "applicant token-gated (credential SSOT)",
  "/api/applications/[id]/submit-to-agent": "applicant token-gated (credential SSOT)",
  "/api/applications/director-consent": "director access_token is the credential",
  "/api/applications/director-status/[token]": "director access_token is the credential",
  "/api/applications/invite-consent": "invite token is the credential",
  // Token-gated party actions — token possession is the credential (Cat-4 / Cat-12).
  "/api/approve/[token]": "landlord approval token is the credential",
  "/api/billing/screening": "application screening token is the credential (PayFast init)",
  "/api/consent/lease-disclaimer": "GET static disclaimer text; no data",
  "/api/waitlist": "public marketing waitlist signup (rate-limited)",
  "/api/wo/[number]/invoice": "contractor work-order token is the credential",
  "/api/wo/[number]/quote": "contractor work-order token is the credential",
  "/api/wo/[number]/update": "contractor work-order token is the credential",
  // Auth bootstrap — pre-session by nature.
  "/api/auth/check-email": "pre-signup existence check (rate-limited)",
  "/api/auth/logout": "clears session; no data",
  "/api/auth/passkeys/auth-options": "pre-login WebAuthn options (no session yet)",
  "/api/auth/passkeys/auth-verify": "pre-login WebAuthn assertion (establishes session)",
  // Consent verification — OTP/token possession is the credential.
  "/api/consent/send-code": "consent OTP send; rate-limited, token-scoped",
  "/api/consent/verify-code": "consent OTP verify; token-scoped",
  "/api/consent/verification/[id]/status": "consent status poll; id+token scoped",
  // Public infra.
  "/api/health": "liveness probe",
  "/api/health/deep": "deep health probe (no sensitive data)",
  "/api/status": "public status page data",
  "/api/public/status-summary": "public status page summary",
  "/api/paia-manual-pdf": "public PAIA manual (statutory public document)",
  "/api/unsubscribe/[token]": "unsubscribe token is the credential",
  // Flagged for human confirmation — appears session-ungated; verify the intended gate.
  "/api/property-intelligence/run/[pull_id]": "REVIEW: appears session-ungated — confirm it is internal/token-triggered only",
}

// Match CALLS, not doc mentions: the FILL: header stub literally contains
// "...e.g. requireAdminAuth, gateway, AAL2", so 400+ unfilled headers would false-match a
// bare-name regex. Comments are stripped first, then each helper must be followed by "(".
const GATE = {
  agent: /\b(requireAgentWriteAccess|gatewaySSR|gateway|auth\.getUser|getServerUser|getServerOrgMembership)\s*\(/,
  portal: /\b(getTenantSession|getPortalSession)\s*\(/,
  admin: /\b(requireAdminAuth|isAdminAuthenticated)\s*\(/,
  cron: /x-cron-secret|CRON_SECRET/,
}

/** Strip // line comments and block comments so doc mentions don't count as auth calls. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

/** Recursively find every route.ts under app/api and return canonical route paths + content. */
export function discoverApiRoutes() {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) { walk(abs); continue }
      if (name !== "route.ts") continue
      const rel = abs.slice(join(process.cwd(), "app").length).replace(/\\/g, "/")
      const path = rel.replace(/\/route\.ts$/, "")
      out.push({ path, file: rel, content: readFileSync(abs, "utf8") })
    }
  }
  walk(API_ROOT)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

/** Classify a route by prefix + the auth helper it calls (derived, never declared). */
export function classifyRoute({ path, content }) {
  const code = stripComments(content)
  if (path.startsWith("/api/webhooks/")) return "webhook"
  if (path.startsWith("/api/cron/") || GATE.cron.test(code)) return "cron"
  if (path.startsWith("/api/admin/") || GATE.admin.test(code)) return "admin"
  if (GATE.portal.test(code)) return "portal"
  if (GATE.agent.test(code)) return "authenticated"
  return "public"
}

/** Which HTTP verbs a route file exports (drives GET-vs-POST probing in Cat-8). */
export function detectMethods(content) {
  const verbs = ["GET", "POST", "PUT", "PATCH", "DELETE"]
  return verbs.filter(
    (v) =>
      new RegExp(String.raw`export\s+(async\s+)?function\s+${v}\b`).test(content) ||
      new RegExp(String.raw`export\s+const\s+${v}\s*=`).test(content),
  )
}

/** Substitute a probe value for each [dynamic] segment so a real request can be issued. */
export function probePath(path) {
  return path.replaceAll(/\[([^\]]+)\]/g, (_m, seg) =>
    /token/i.test(seg) ? "fake-token-123" : "00000000-0000-0000-0000-000000000000",
  )
}

/** Build the full classified census. */
export function buildCensus() {
  const routes = discoverApiRoutes().map((r) => ({
    ...r,
    bucket: classifyRoute(r),
    methods: detectMethods(r.content),
  }))
  const byBucket = {}
  for (const r of routes) {
    byBucket[r.bucket] ??= []
    byBucket[r.bucket].push(r)
  }
  return { routes, byBucket }
}
