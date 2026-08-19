/**
 * eslint-rules/require-org-scope-on-service-read.mjs — M-002, the half that leaks.
 *
 * A Supabase `.from(table).select(...)` on the SERVICE client (which bypasses RLS) must be
 * org-scoped: either the chain carries `.eq("org_id", …)`, or the enclosing function proves org
 * ownership another way (an org-scoped fetch, or a `row.org_id !== orgId` guard — validate-then-act).
 *
 * The sibling rules cover writes (`require-org-scope-on-service-write`) and deletes
 * (`require-scope-on-delete`). Reads had NO scoping check of any kind: an unscoped read is invisible
 * to both of them and to the RLS policy audit, because the service client is not subject to RLS.
 * A cross-org READ leaks rather than corrupts, which is why it survives review — nothing breaks.
 *
 * ── WHY THIS IS NOT JUST THE WRITE RULE WITH "select" ─────────────────────────────────────────
 * M-002's sketch said "same AST shape as the existing write/delete rules". The AST shape does
 * transfer; the SCOPE does not. Measured before building (LESSONS L-27): retargeting the write
 * rule at `.select()` produced **253 findings across 104 files**, which split three ways —
 *
 *     139  service-client reads across 66 files   ← the real surface
 *      69  cookie/browser-client reads, 25 files  ← RLS APPLIES; not this rule's business
 *      45  test fixtures, 13 files                ← not production code
 *
 * The write rule needs no client discriminator because `pleks/no-cookie-client-from` already bans
 * `.from()` on the cookie client, so every write it sees is service-client by construction. Reads
 * are different: a `.select()` in a client component runs on the BROWSER client, where `auth.uid()`
 * is present and RLS is the boundary — demanding `.eq("org_id")` there would be wrong, not merely
 * noisy. Shipping the sketch as written would have been a rule that is 45% false positives.
 *
 * Client discrimination is FILE-level: a file is a service-client surface if it references
 * `createServiceClient`, `gateway(` or `gatewaySSR`. A file using both is still safe to treat as
 * service, precisely because cookie-client `.from()` is already forbidden there.
 *
 * ── WHAT THE BASELINE CONTAINS, AND HOW FAR IT WAS VERIFIED ───────────────────────────────────
 * 52 files ship baselined. Coverage of the classification is stated rather than implied: the
 * families were enumerated and a SAMPLE was read at each — not all 106 sites. What the sample
 * showed:
 *
 *   • REAL, the majority — a caller-supplied id with no org filter on the service client:
 *     `.from("tenant_view").eq("id", tenantId)`, `.from("property_brokers").eq("property_id", …)`.
 *     This is the cross-org read class, and it LEAKS rather than corrupts, which is why it
 *     survived review: nothing breaks, so nothing draws attention.
 *   • FALSE POSITIVE, a minority — token-keyed lookups such as `.from("invites").eq("token", t)`.
 *     The token IS the credential and the org cannot be known before resolving it. These should
 *     leave the baseline via an inline disable naming that reason, not via an `.eq("org_id")`.
 *
 * So an entry leaves the baseline one of two ways: the read gains `.eq("org_id", orgId)`, or it
 * gains an `// eslint-disable-next-line … -- <why this id is org-bound>` at the site. The baseline
 * only shrinks. Any file not listed fails immediately.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const READS = new Set(["select"])

// Tables with NO org_id column, keyed by session identity — same set the write rule uses.
const SELF_SCOPED_TABLES = new Set(["organisations", "user_profiles"])

// Identity-scoped tables describe a HUMAN and are read BEFORE an org is selected, so an org filter
// is impossible by design. Kept in step with .claude/rules/identity-scoped-tables.md.
const IDENTITY_SCOPED = new Set(["user_passkeys", "passkey_challenges", "passkey_aal_grants"])

const ORG_AWARE = /\.eq\(\s*["'`]org_id["'`]|org_id\s*[!=]==?\s*|orgId\s*[!=]==?\s*|\borg_id:\s*orgId\b/

// Same non-agent surfaces the write rule skips: a different isolation model, where org-scoping is
// not the boundary and the heuristic would only false-positive.
// `components/admin` is in this list on evidence, not by analogy: every hit there was a
// platform-admin dashboard read (`platform_cost_snapshots`, `feedback_submissions`, `cron_runs`)
// that is cross-org BY DESIGN — the same reason `(admin)`, `api/admin` and `lib/admin` are here.
// Baselining those 12 would have recorded the admin surface's whole purpose as debt.
const SKIP_PATH = /[/\\](cron|webhooks?)[/\\]|[/\\]api[/\\]auth[/\\]|[/\\]lib[/\\]auth[/\\]|[/\\]lib[/\\](portal|consent)[/\\]|[/\\]api[/\\](consent|wo|profile)[/\\]|[/\\]\(auth\)[/\\]|[/\\]\(applicant\)[/\\]|[/\\]\(public\)[/\\]|[/\\]\(tenant\)[/\\]|[/\\]\(landlord\)[/\\]|[/\\]\(supplier\)[/\\]|[/\\]\(admin\)[/\\]|[/\\]api[/\\]admin[/\\]|[/\\]lib[/\\]admin[/\\]|[/\\]components[/\\]admin[/\\]|\[token\]|\[pull_id\]/

// Test files exercise fixtures, not production reads. Scoped OUT rather than baselined — a baseline
// entry means "real debt", and calling a fixture debt makes the baseline lie about its own size.
const TEST_PATH = /(^|[/\\])test[/\\]|\.(test|dbtest|spec)\.[cm]?[jt]sx?$/

// A service-client surface. See the header: file-level by design, and safe because cookie-client
// `.from()` is separately forbidden.
const SERVICE_CLIENT = /createServiceClient|gatewaySSR|gateway\(/

const BASELINE = new Set(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "require-org-scope-on-service-read.baseline.json"), "utf8")),
)

/** Walk DOWN a read call's object chain and return the `.from("…")` CallExpression (or null). */
function fromCallOf(readCall) {
  let node = readCall.callee.object
  let depth = 0
  while (node && depth < 60) {
    depth++
    if (node.type === "CallExpression") {
      const callee = node.callee
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier" && callee.property.name === "from") return node
      node = callee
    } else if (node.type === "MemberExpression") {
      node = node.object
    } else {
      return null
    }
  }
  return null
}

function functionHasParam(fn, name) {
  return !!fn && fn.params.some((p) => p.type === "Identifier" && p.name === name)
}

/** Does the chain AFTER the read carry `.eq("org_id", …)` (or org_id inside `.match({…})`)? */
function chainHasOrgScope(readCall) {
  let current = readCall
  let depth = 0
  while (depth < 60) {
    depth++
    const member = current.parent
    if (!member || member.type !== "MemberExpression" || member.object !== current) break
    const call = member.parent
    if (!call || call.type !== "CallExpression" || call.callee !== member) break
    if (member.property.type === "Identifier") {
      const a0 = call.arguments[0]
      if (a0?.type === "Literal" && a0.value === "org_id") return true
      if (a0?.type === "ObjectExpression" && a0.properties.some((p) => p.type === "Property" && ((p.key.type === "Identifier" && p.key.name === "org_id") || (p.key.type === "Literal" && p.key.value === "org_id")))) return true
    }
    current = call
  }
  return false
}

function enclosingFunction(node) {
  let n = node.parent
  while (n) {
    if (n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression") return n
    n = n.parent
  }
  return null
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Require org-scoping on service-client .select() (the service client bypasses RLS, so a read is not org-bounded by anything else)." },
    messages: {
      unscoped:
        "Unscoped read: `.from(...).select()` on the service client with no `org_id` filter, and the enclosing function never scopes by org — the service client bypasses RLS, so nothing bounds this read to the caller's organisation. Add `.eq(\"org_id\", orgId)`, or prove ownership first (`.eq(\"id\", x).eq(\"org_id\", orgId)`). If this read is deliberately cross-org, add `// eslint-disable-next-line pleks/require-org-scope-on-service-read -- <why>`. See CLAUDE.md 'DB ACCESS AND AGENT WRITE GATE'.",
    },
    schema: [],
  },
  create(context) {
    const rel = relative(process.cwd(), context.filename).replaceAll("\\", "/")
    if (TEST_PATH.test(rel)) return {}
    if (SKIP_PATH.test(context.filename)) return {}
    if (BASELINE.has(rel)) return {}

    const sourceCode = context.sourceCode ?? context.getSourceCode()
    // The discriminator the write rule does not need. A file with no service client cannot make an
    // RLS-bypassing read, so nothing here is this rule's business.
    if (!SERVICE_CLIENT.test(sourceCode.getText())) return {}

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          !READS.has(node.callee.property.name)
        ) {
          return
        }
        const fromCall = fromCallOf(node)
        if (!fromCall) return
        if (chainHasOrgScope(node)) return

        const tableArg = fromCall.arguments[0]
        if (tableArg?.type === "Literal" && (SELF_SCOPED_TABLES.has(tableArg.value) || IDENTITY_SCOPED.has(tableArg.value))) return

        const fn = enclosingFunction(node)
        // Injectable core: the client is a PARAMETER, so the caller owns the org context.
        const client = fromCall.callee.object
        if (client.type === "Identifier" && functionHasParam(fn, client.name)) return

        const fnText = fn ? sourceCode.getText(fn) : sourceCode.getText()
        if (ORG_AWARE.test(fnText)) return

        context.report({ node: node.callee.property, messageId: "unscoped" })
      },
    }
  },
}

export default rule
