/**
 * eslint-rules/require-org-scope-on-service-write.mjs — caller-supplied-ID census guard (A1 class).
 *
 * A Supabase `.from(table).update(...)` / `.upsert(...)` on the service client (which bypasses RLS)
 * must be org-scoped: either the mutation chain carries `.eq("org_id", ...)`, OR the enclosing function
 * proves org ownership some other way (a `.eq("org_id", …)` fetch, or a `row.org_id !== orgId` JS guard
 * — the validate-then-act pattern). A function that mutates by a caller-supplied `.eq("id", x)` and NEVER
 * scopes by org anywhere is the A1 cross-org IDOR (an agent in org A mutates org B's row by passing a
 * foreign uuid — the `disburseDeposit`/`updateProperty`/`giveNotice` class, 2026-07-06).
 *
 * `.delete()` is covered by the sibling `require-scope-on-delete`. This rule is `.update()`/`.upsert()`.
 *
 * Precision: only flags a mutation whose OWN chain lacks `org_id` AND whose enclosing function shows no
 * org-scoping at all (no `.eq("org_id"` and no `org_id ===`/`!==` compare). A genuinely id-only write on a
 * row already proven to be the caller's (validate-then-act) passes because the function carries that proof.
 * If a specific site is safe but the heuristic can't see it, annotate:
 *   `// eslint-disable-next-line pleks/require-org-scope-on-service-write -- <why this id is org-bound>`
 *
 * Baseline ratchet: pre-existing unfixed sites are grandfathered by FILE in
 * `require-org-scope-on-service-write.baseline.json` so this ships green; a NEW violation in any
 * non-baselined file hard-fails CI. Remove a file from the JSON as it's fixed — the baseline only shrinks.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const MUTATIONS = new Set(["update", "upsert"])
// Tables with NO org_id column, keyed by a SESSION identity (not a caller-supplied id), so cross-org is
// impossible: organisations (the row IS the org — self-scoped by the session orgId) and user_profiles
// (keyed by the auth user id — self-scoped by auth.uid).
const SELF_SCOPED_TABLES = new Set(["organisations", "user_profiles"])
// A function is "org-aware" if its body scopes by org: an `.eq("org_id", …)` filter (validate-then-act or
// a scoped write elsewhere), a `row.org_id === / !== orgId` (or camelCase `orgId`) ownership compare, or a
// self-org write keyed by the session `.eq("id", orgId)`.
const ORG_AWARE = /\.(eq|match|filter|or|neq)\(\s*[`'"]org_id[`'"]|\borg_?[iI]d\s*(===|!==|==|!=)|\.eq\(\s*[`'"]id[`'"]\s*,\s*orgId\b/

const BASELINE = new Set(
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "require-org-scope-on-service-write.baseline.json"), "utf8")),
)

// The A1 caller-supplied-ID class is an AGENT-SESSION concern only. These surfaces use a DIFFERENT
// isolation model, so org-scoping doesn't apply and the heuristic would only false-positive:
//   cron/webhook — process ALL orgs (org from the row/system, no caller-org to cross);
//   auth (api/auth + lib/auth) — user/session-scoped (user_id / auth.uid, not org);
//   (applicant)/(public)/token + api/{consent,wo,applications} + lib/consent — token/applicant/work-order
//     token is the credential (application/consent id is bound to the token, not the caller's org);
//   api/profile — the caller's OWN auth-user profile; portals ((tenant)/(landlord)/(supplier) + lib/portal)
//     — portal session; (admin)/api/admin — admin HMAC (cross-org by design).
const SKIP_PATH = /[/\\](cron|webhooks?)[/\\]|[/\\]api[/\\]auth[/\\]|[/\\]lib[/\\]auth[/\\]|[/\\]lib[/\\](portal|consent)[/\\]|[/\\]api[/\\](consent|wo|applications|profile)[/\\]|[/\\]\(auth\)[/\\]|[/\\]\(applicant\)[/\\]|[/\\]\(public\)[/\\]|[/\\]\(tenant\)[/\\]|[/\\]\(landlord\)[/\\]|[/\\]\(supplier\)[/\\]|[/\\]\(admin\)[/\\]|[/\\]api[/\\]admin[/\\]|\[token\]|\[pull_id\]/

/** Walk DOWN a mutation call's object chain and return the `.from("…")` CallExpression (or null). */
function fromCallOf(mutCall) {
  let node = mutCall.callee.object
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

/** Is `name` a parameter of function `fn`? (injectable-core detection — client passed by the caller). */
function functionHasParam(fn, name) {
  return !!fn && fn.params.some((p) => p.type === "Identifier" && p.name === name)
}

/** Does the filter chain AFTER the mutation carry an `.eq("org_id", …)` (or org_id in .match({...}))? */
function chainHasOrgScope(mutCall) {
  let current = mutCall
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

/** The nearest enclosing function node (for the org-awareness text check). */
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
    docs: { description: "Require org-scoping on service-client .update()/.upsert() (the service client bypasses RLS)." },
    messages: {
      unscoped:
        "Unscoped write: `.from(...).update()/.upsert()` filtered by a caller-supplied id with no org scope, and the enclosing function never scopes by org — a cross-org IDOR (the service client bypasses RLS, so a uuid alone is not an isolation boundary; the A1 caller-supplied-ID class). Add `.eq(\"org_id\", orgId)` to the write, or validate the row against the caller's org first (`.eq(\"id\", x).eq(\"org_id\", orgId)`). If the id is provably org-bound already, add `// eslint-disable-next-line pleks/require-org-scope-on-service-write -- <why>`. See CLAUDE.md 'DB ACCESS AND AGENT WRITE GATE'.",
    },
    schema: [],
  },
  create(context) {
    const rel = relative(process.cwd(), context.filename).replaceAll("\\", "/")
    if (SKIP_PATH.test(context.filename)) return {} // non-agent surface — different isolation model
    if (BASELINE.has(rel)) return {}
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          !MUTATIONS.has(node.callee.property.name)
        ) {
          return
        }
        const fromCall = fromCallOf(node)
        if (!fromCall) return
        if (chainHasOrgScope(node)) return
        // Self-scoped table (organisations has no org_id column — self-scoped by the session orgId).
        const tableArg = fromCall.arguments[0]
        if (tableArg?.type === "Literal" && SELF_SCOPED_TABLES.has(tableArg.value)) return
        const fn = enclosingFunction(node)
        // Injectable core: the Supabase client is a PARAMETER of the enclosing function — the CALLER owns
        // the org context (the rule governs the ENTRY points that create the client + take caller ids; the
        // server-action census allowlists these cores the same way). e.g. `async fn(db, orgId, id) {...}`.
        const client = fromCall.callee.object
        if (client.type === "Identifier" && functionHasParam(fn, client.name)) return
        // Module-scope write with no enclosing function → can't prove org-awareness; flag.
        const fnText = fn ? sourceCode.getText(fn) : sourceCode.getText()
        if (ORG_AWARE.test(fnText)) return
        context.report({ node: node.callee.property, messageId: "unscoped" })
      },
    }
  },
}

export default rule
