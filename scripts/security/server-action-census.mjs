/**
 * scripts/security/server-action-census.mjs — SSOT server-action auth census (Cat-15).
 *
 * A top-level `"use server"` export is a directly-callable RPC endpoint, regardless of
 * whether it was written as a "helper". This census enumerates every exported server action
 * from disk and asserts each resolves auth through a recognized gate — the class of gap that
 * hid the saveContentRow / adminOrgActions holes (an admin action that called bare `gateway()`
 * instead of `requireAdminAuth()`). Strict + allowlist: anything not gated must be an explicit
 * ALLOWLIST entry with a reason (genuinely public, or an internal helper only reached through a
 * gated caller), else the audit FAILS.
 *
 * Location-aware rule (the Batch-1 bug was location-blind):
 *   - action under app/(admin)/  → MUST call requireAdminAuth / isAdminAuthenticated (an
 *     agent gateway() is NOT sufficient for an admin surface);
 *   - every other action         → must call SOME recognized gate (agent/portal/applicant).
 */
import { readdirSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["app", "lib"].map((d) => join(process.cwd(), d))

const ANY_GATE =
  /\b(requireAgentWriteAccess|gatewaySSR|gateway|auth\.getUser|getServerUser|getServerOrgMembership|getTenantSession|getPortalSession|requireAdminAuth|isAdminAuthenticated|resolveApplicationCredential)\s*\(/
const ADMIN_GATE = /\b(requireAdminAuth|isAdminAuthenticated)\s*\(/

/**
 * Server actions that are gateless BY DESIGN. Each needs a reason.
 *   "public:"   — genuinely unauthenticated (applicant/token flow, auth bootstrap, contact form).
 *   "internal:" — a helper exported from a "use server" module but only reached through a gated
 *                 caller; the auth check lives in the caller. (Ideally these move out of the
 *                 "use server" module over time; allowlisted so the census stays green meanwhile.)
 * Keyed by "<repo-relative-file>::<exportName>".
 */
export const ACTION_ALLOWLIST = {
  // Auth bootstrap — pre-session by nature.
  "lib/actions/login.ts::*": "public: login (establishes the session)",
  "lib/actions/passwordReset.ts::*": "public: pre-session / token-gated password reset",
  "app/(auth)/accept-terms/actions.ts::*": "public: runs during first-login bootstrap",
  "lib/actions/onboarding.ts::*": "public: pre-org onboarding (no membership yet)",
  "lib/actions/submitContactForm.ts::*": "public: marketing contact form (rate-limited)",
  // Applicant / token flow — token possession is the credential.
  "app/(public)/property-info/[token]/actions.ts::*": "public: property-info token is the credential",
  "lib/applications/commercial.ts::*": "public: applicant commercial flow (token-gated upstream)",
  "lib/applications/createTenantFromCoApplicant.ts::*": "internal: called by gated co-applicant save",
  "lib/applications/buildEmailContext.ts::*": "internal: pure email-context builder, no data mutation",
  "lib/applications/commercial-emails.tsx::*": "internal: email template builders (no auth surface)",
  // Contractor / portal invite senders — token/portal flows.
  "lib/contractors/sendPortalInvite.ts::*": "internal: gated supplier portal-invite route; client imports the route, not this lib fn (caller-verified 2026-07-03). Service client + orgId-scoped read.",
  "lib/portal/inviteLandlord.ts::*": "internal: gated portal-invite route + requireAgentWriteAccess wrapper; client imports the wrapper, not this lib fn (caller-verified 2026-07-03). Service client + orgId-scoped read.",
  "lib/actions/supplierQuote.ts::*": "public: contractor work-order token is the credential",
  "lib/actions/invite.ts::*": "internal: called by gated team/portal invite actions",
  "lib/actions/delivery-notice.ts::*": "internal: called by gated arrears/lease actions",
  "lib/actions/welcome.ts::*": "internal: resolver-owned welcome, called post-auth",
  // Email / notification builders — invoked by gated callers or crons; no data surface of their own.
  "lib/actions/maintenance/notifyBroker.ts::*": "internal: notification builder, gated caller",
  "lib/actions/maintenance/notifyOwner.ts::*": "internal: notification builder, gated caller",
  "lib/actions/maintenance/notifyScheme.ts::*": "internal: notification builder, gated caller",
  "lib/messaging/whatsapp/send.ts::*": "internal: transport, called by gated senders + crons",
  "lib/statements/generateOwnerStatement.ts::*": "internal: called by gated statement action + cron",
  // Deposit pure computation — no DB mutation; called by gated deposit actions.
  "lib/deposits/calculateReturn.ts::*": "intentional gateway()-on-write: calculateDepositReturn self-gates with gateway() (auth + orgId), org-scopes the lease read + every query, and upserts the deposit_reconciliation draft under the caller's orgId. Lockdown-free BY DESIGN like disburse — computing a deposit return is a statutory RHA obligation, must work when paused (caller-ID census 2026-07-06; the old 'pure calculation, no mutation' reason was wrong — it upserts, and was previously ungated + cross-org).",
  "lib/deposits/buildDeductionSchedule.ts::*": "internal: pure calculation, no mutation",
  "lib/deposits/generateJustification.ts::*": "internal: AI justification builder, gated caller",
  "lib/deposits/disburse.ts::*": "intentional gateway()-on-write: disburseDeposit self-gates with gateway() (auth + orgId scope + session userId), lockdown-free BY DESIGN — returning a tenant's deposit is a statutory RHA obligation-closeout, NOT net-new value creation, so it must work when paused/cancelled ('Your Data, Always'). Every query org-scoped (caller-ID census hotfix 2026-07-06 — was previously ungated + cross-org + attribution-forgeable; the old 'called by a gated caller' reason was wrong and masked the hole).",
  // Screening internals — called by gated screen route / cron.
  "lib/screening/bankStatementClassification.ts::*": "internal: called by gated screen path + cron",
  "lib/screening/recordDecision.ts::*": "internal: called by gated shortlist action",
  "lib/screening/sendCreditReport.ts::*": "internal: sender called by gated screen path + cron",
  "lib/screening/sendShortlistInvitation.ts::*": "internal: sender called by gated shortlist action + cron",
  // Injectable cores — receive an authed client + orgId from a gated caller (non-serializable
  // client param means they can't be meaningfully invoked directly as an RPC).
  "lib/import/leaseImport.ts::*": "internal: injectable core, gated /api/import route",
  "lib/import/propertyImport.ts::*": "internal: injectable core, gated /api/import route",
  "lib/import/tenantImport.ts::*": "internal: injectable core, gated /api/import route",
  "lib/hoa/levyCalculation.ts::*": "internal: gated /calculate route (pre-verifies schedule org); creates a service client, org from the verified schedule; not client-imported (caller-verified 2026-07-03)",
  // Caller-supplied-ID / cookie-client census REVIEW trio — now ALL resolved (CD 2026-07-02..03).
  // Of the original 6 "guilty until read" items: quoteApproval + handleDispute were live IDOR/doctrine
  // violations (DELETED as dead code), convertTrial was dead (DELETED), and the two below are
  // caller-verified. No REVIEW items remain — the allowlist is provably clean.
  "lib/trial/startTrial.ts::*": "internal: reached only via the requireAdminAuth wrapper in adminOrgActions.server.ts; client imports the wrapper, not this lib fn (caller-verified 2026-07-03). Service client, orgId-scoped.",
  "lib/auth/capabilityActions.ts::*": "internal: no-param, self-scoped read of the caller's OWN capabilities via gateway()-authed getMyCapabilities (service db, .eq user_id + org_id from session); no caller-supplied id, no mutation. Affordance-only hydration — server can()/RLS is the boundary. Sole caller: CapabilitiesProvider (client). Caller-verified 2026-07-03.",
}

/** Detect a top-level `"use server"` directive (module-scope, before imports). */
function isServerActionModule(src) {
  const head = src.split("\n").slice(0, 12).join("\n")
  return /(^|\n)\s*["']use server["']\s*;?\s*(\n|$)/.test(head)
}

/** Strip comments so doc mentions of gate names don't count as calls. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/[^\n]*/g, "")
}

/** Exported action names in a module (for reporting only — the gate verdict is file-level). */
function extractActionNames(code) {
  const names = new Set()
  let m
  const fnDecl = /export\s+async\s+function\s+(\w+)/g
  while ((m = fnDecl.exec(code))) names.add(m[1])
  const constDecl = /export\s+const\s+(\w+)\s*=\s*async\b/g
  while ((m = constDecl.exec(code))) names.add(m[1])
  const reexport = /export\s*\{([^}]*)\}/g
  while ((m = reexport.exec(code))) {
    for (const raw of m[1].split(",")) {
      const n = raw.trim().split(/\s+as\s+/).pop()?.trim()
      if (n) names.add(n)
    }
  }
  return [...names]
}

function relPath(abs) {
  return abs.slice(process.cwd().length + 1).replaceAll("\\", "/")
}

export function expectedGateFamily(file) {
  return /(^|\/)app\/\(admin\)\//.test(file) ? "admin" : "any"
}

/** A file is allowlisted if any allowlist key targets it (bare path, path::*, or path::fn). */
function isAllowlisted(file) {
  for (const key of Object.keys(ACTION_ALLOWLIST)) {
    if (key === file || key.startsWith(`${file}::`)) return ACTION_ALLOWLIST[key]
  }
  return null
}

/**
 * Build the server-action census. Verdict is FILE-LEVEL (robust): each "use server" module must
 * contain the gate appropriate to its location, or be allowlisted. File-level (not per-function)
 * because TS typed/destructured params make reliable per-function body extraction brittle; the
 * limitation (a single ungated action inside an otherwise-gated file) is documented — function-
 * level precision is a future refinement. Location-aware catches the Batch-1 class: an
 * app/(admin) module that only calls gateway()/getServerUser() (not requireAdminAuth) FAILS.
 */
export function buildActionCensus() {
  const modules = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) {
        if (![".next", "node_modules"].includes(name)) walk(abs)
        continue
      }
      if (!/\.tsx?$/.test(name)) continue
      const src = readFileSync(abs, "utf8")
      if (isServerActionModule(src)) modules.push({ file: relPath(abs), src })
    }
  }
  for (const r of ROOTS) walk(r)

  const results = modules.map(({ file, src }) => {
    const code = stripComments(src)
    const family = expectedGateFamily(file)
    const gated = (family === "admin" ? ADMIN_GATE : ANY_GATE).test(code)
    return { file, family, gated, actions: extractActionNames(code), allow: isAllowlisted(file) }
  })
  const totalActions = results.reduce((n, r) => n + r.actions.length, 0)
  return { modules: results, totalActions }
}
