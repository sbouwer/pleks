/**
 * eslint-rules/no-cookie-client-from.mjs — the cookie Supabase client is auth.getUser() ONLY.
 *
 * `createClient()` from `@/lib/supabase/server` is the cookie-based client. Its auth context does
 * NOT reliably propagate to Postgres RLS in Next server components/actions, so `.from()` on it
 * returns empty for cold sessions (silent data loss) — and it is the pattern behind the recurring
 * "gates on the session but the query isn't org-scoped / trusts a caller-supplied id" class
 * (quoteApproval, handleDispute, startTrial). The ONLY valid use of the cookie client is
 * `auth.getUser()`. For data use `gateway()`/`gatewaySSR()` (reads) or
 * `requireAgentWriteAccess()`/`createServiceClient()` (writes), each with an explicit
 * `.eq("org_id", orgId)`. See CLAUDE.md "DB ACCESS AND AGENT WRITE GATE" + the data-access doctrine.
 *
 * Precision: only variables PROVABLY bound to the cookie `createClient()` in scope are flagged —
 * a client received as a parameter (which may be a service client) is NOT flagged, and
 * `createClient` imported from any other module (e.g. `@supabase/supabase-js`) is ignored.
 *
 * Baseline ratchet: the ~75 pre-existing violators (2026-07-02) are grandfathered in
 * `no-cookie-client-from.baseline.json` so this ships green; a NEW violation in any other file
 * hard-fails CI. The caller-supplied-ID census burns the baseline down — remove a file from the
 * JSON as it's fixed; the baseline only shrinks.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const COOKIE_MODULE = "@/lib/supabase/server"
const COOKIE_FACTORY = "createClient"

const BASELINE = new Set(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "no-cookie-client-from.baseline.json"), "utf8")),
)

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid .from() on the cookie createClient() — the cookie client is for auth.getUser() only.",
    },
    messages: {
      cookieFrom:
        "`.from()` on the cookie client (createClient() from @/lib/supabase/server). The cookie client is for auth.getUser() ONLY — its auth does not propagate to Postgres RLS, so the query returns empty for cold sessions AND skips org-scoping (the quoteApproval/handleDispute/startTrial class). Use gateway()/gatewaySSR() for reads or requireAgentWriteAccess()/createServiceClient() for writes, with an explicit .eq(\"org_id\", orgId). See CLAUDE.md 'DB ACCESS AND AGENT WRITE GATE'.",
    },
    schema: [],
  },
  create(context) {
    // Grandfathered pre-existing violator — skip (baseline ratchet; census burns it down).
    const rel = relative(process.cwd(), context.filename).replaceAll("\\", "/")
    if (BASELINE.has(rel)) return {}

    // Local identifiers that are the cookie createClient (handles `import { createClient as cc }`).
    const cookieFactoryNames = new Set()
    // Variable names bound to a cookie-client instance in this file.
    const cookieClientVars = new Set()

    const isCookieFactoryCall = (call) =>
      call &&
      call.type === "CallExpression" &&
      call.callee.type === "Identifier" &&
      cookieFactoryNames.has(call.callee.name)

    // Unwrap `await createClient()` → the CallExpression.
    const unwrap = (node) => (node && node.type === "AwaitExpression" ? node.argument : node)

    // Is this expression a cookie-client instance? (a tracked var, or an inline `(await createClient())`)
    const isCookieClient = (node) => {
      if (!node) return false
      if (node.type === "Identifier") return cookieClientVars.has(node.name)
      return isCookieFactoryCall(unwrap(node))
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== COOKIE_MODULE) return
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && spec.imported.name === COOKIE_FACTORY) {
            cookieFactoryNames.add(spec.local.name)
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier") return
        if (isCookieFactoryCall(unwrap(node.init))) cookieClientVars.add(node.id.name)
      },
      MemberExpression(node) {
        // Only a `.from(...)` CALL — `x.from` where x.from(...) is invoked.
        if (node.property.type !== "Identifier" || node.property.name !== "from") return
        if (node.parent.type !== "CallExpression" || node.parent.callee !== node) return
        if (isCookieClient(node.object)) {
          context.report({ node: node.property, messageId: "cookieFrom" })
        }
      },
    }
  },
}

export default rule
