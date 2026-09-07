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
 * ── THE FIRST VERSION OF THIS RULE HAD A SILENT FALSE NEGATIVE ────────────────────────────────
 * Shipped 2026-08-19 with `SERVICE_CLIENT` missing `requireAgentWriteAccess`, so it returned `{}`
 * and NEVER RAN on 63 files holding a service client, 40 of them containing a `.select(` — the
 * canonical agent-write surface. Found by adversarial review, not by the probes: every probe
 * passed, because they all exercised files the discriminator already recognised. **A probe suite
 * confirms the cases you thought of; it cannot report the class you did not.**
 *
 * Two more holes in the same review, both of which would have survived the discriminator fix:
 *   • `ORG_AWARE` matched an INSERT payload (`org_id: orgId`), so any function that wrote a row
 *     into its own org was exempted for EVERY read in it.
 *   • `chainHasOrgScope` accepted any method whose first argument was `"org_id"` — including
 *     `.neq("org_id", orgId)`, which reads every OTHER org's rows, and `.order("org_id")`.
 *
 * The measurement in the block above was produced BY the broken discriminator and is therefore
 * not trustworthy as a split: the "69 cookie-client, not our business" bucket was contaminated by
 * `requireAgentWriteAccess`-only files. The corrected total is **149 findings across 72 files**.
 *
 * ── WHAT THE BASELINE CONTAINS, AND HOW FAR IT WAS VERIFIED ───────────────────────────────────
 * 72 files ship baselined — up from 52, and the growth is the rule seeing MORE, not a widening to
 * silence findings. Coverage of the classification is stated rather than implied: the families
 * were enumerated and a SAMPLE was read at each, not all 149 sites. What the sample showed:
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
 *
 * ── THE DISCRIMINATOR WAS INCOMPLETE A SECOND TIME (2026-08-19, second walker pass) ────────────
 * `SERVICE_CLIENT` named `createServiceClient` but not `getCachedServiceClient` — the React.cache
 * sibling exported from the same module, four lines below it — and knew nothing of a file that
 * builds its own client from `SUPABASE_SERVICE_ROLE_KEY`. 23 findings across 8 files were invisible.
 * This is the SAME defect as the `requireAgentWriteAccess` omission recorded above, found by the
 * same means (adversarial review, not probes) one pass later, which is the point the header already
 * makes: **a discriminator keyed on HOW the client is obtained cannot enumerate its way to
 * completeness.** The env-var alternative is now in the list as the backstop that does not depend on
 * a helper being named — a file holding the service-role key holds a service client, however it
 * builds one.
 *
 * Classifying those 23 split them 2 / 21:
 *   • 2 were a RULE DEFECT, not debt: `.insert({…}).select("id")` is a RETURNING clause. See
 *     `isReturningClause` — the mutation is the sibling rules' business and flagging it here points
 *     the fix at the wrong place. Fixed rather than baselined.
 *   • 21 across 8 files are the token/public-slug credential family this header already names, on
 *     the UNAUTHENTICATED applicant API (`app/api/applications/**`, `lib/actions/delivery-notice`).
 *     There is no caller org to scope to: the org is DISCOVERED by resolving the token or the
 *     public slug, and every subsequent read in the handler is keyed off the row that resolution
 *     returned. Five files on that same surface were already baselined for the same reason.
 *     Baselined, not path-skipped, so the surface stays countable — a `SKIP_PATH` entry would have
 *     made 21 real reads invisible instead of listed.
 *
 * That takes the baseline 72 → 80. A baseline is allowed to grow ONLY when the rule's scope widens
 * to see files it was previously blind to, which is what happened here; it may never grow to
 * silence a finding the rule could already see.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"

const READS = new Set(["select"])

// Filters that actually BOUND a read to an org. `.neq`/`.order`/`.gt` name the column without
// bounding anything — `.neq("org_id", orgId)` reads every other org.
const SCOPING_METHODS = new Set(["eq", "match", "in"])

// Tables with NO org_id column, keyed by session identity — same set the write rule uses.
const SELF_SCOPED_TABLES = new Set(["organisations", "user_profiles"])

// Identity-scoped tables describe a HUMAN and are read BEFORE an org is selected, so an org filter
// is impossible by design. Kept in step with .claude/rules/identity-scoped-tables.md.
const IDENTITY_SCOPED = new Set(["user_passkeys", "passkey_challenges", "passkey_aal_grants"])

/**
 * Platform-level reference data with NO `org_id` COLUMN — an org filter is not "missing" here, it is
 * unrepresentable, and `.eq("org_id", …)` against one of these errors rather than scoping anything.
 *
 * Distinct from SELF_SCOPED_TABLES, which are also org_id-less but are bounded by SESSION IDENTITY.
 * These are bounded by nothing and need to be: they are shared seed rows, identical for every org.
 *
 * `lease_clause_library` — `CREATE TABLE … ` under the comment "Lease clause library (platform-level,
 * read-only)" at `supabase/migrations/004_leases_financials.sql:167`, columns read at `1c9b6bbd`; no
 * migration adds `org_id` to it. Per-org divergence lives in `org_lease_clause_defaults` /
 * `unit_clause_defaults`, which DO carry `org_id` and are org-scoped at every call site that reads
 * the library beside them.
 *
 * ADD TO THIS SET ONLY AFTER READING THE MIGRATION. A table that HAS `org_id` and is merely read
 * unscoped today is debt, not a global — putting it here would convert a finding into a permanent
 * exemption, which is the baseline-widening failure wearing a different hat.
 */
const GLOBAL_REFERENCE_TABLES = new Set(["lease_clause_library"])

/**
 * Tables bounded by the CALLER'S OWN IDENTITY rather than by an org — and `user_orgs` is the one
 * that matters, because it is the read that ANSWERS "which org is the caller in".
 *
 * Demanding `.eq("org_id", …)` on the org-resolution read is circular: the filter would have to
 * supply the very value the query exists to discover. Sixteen sites across the dashboard and the API
 * surface are this one query (measured at `1c9b6bbd`, M-061) — every one of them
 * `.from("user_orgs").select("org_id[, …]").eq("user_id", user.id)` immediately after
 * `auth.getUser()`, feeding the `.eq("org_id", orgId)` on everything below it.
 *
 * ⚠ THE EXEMPTION IS CONDITIONAL, AND THE CONDITION IS THE POINT. A BARE `user_orgs` read is a
 * genuine cross-org read — it is the membership table for the whole platform. The exemption fires
 * only when the chain carries an `.eq("user_id", …)`, which bounds the result to ONE person's
 * memberships. STATED COVERAGE LIMIT: that proves the read is bounded to a single user, NOT that the
 * id is the session's — an `.eq("user_id", someoneElseId)` is exempted here and would leak which
 * orgs that person belongs to. Binding the value to the session is a dataflow question this rule
 * does not answer for ANY of its filters (`.eq("org_id", orgId)` has the identical hole), so closing
 * it here alone would be a boundary in one rule pretending to be a boundary in the class.
 */
const SESSION_SCOPED_TABLES = new Map([["user_orgs", "user_id"]])

/**
 * Validate-then-act signals ONLY: an org-scoped filter elsewhere in the function, or a JS ownership
 * compare on a fetched row.
 *
 * `\borg_id: orgId\b` — an INSERT payload — was here (inherited from the write rule) and is removed:
 * writing a row into your own org proves nothing about a READ in the same function, and it exempted
 * every read in any function that also inserted. That is how `duplicateTemplateToOrg` would still
 * have passed even after the discriminator was fixed.
 *
 * ⚠ ORDER-SENSITIVE SINCE 2026-08-28 (M-061, the classification half). This used to be tested
 * against the WHOLE enclosing function, so an org signal appearing AFTER the read exempted it, and
 * one org-scoped fetch at the bottom of a 200-line page component exempted every read above it. It
 * is now tested against the text from the function's start UP TO the read only.
 *
 * The 57-across-35 / 52-across-33 measured on 2026-08-19 were hypotheses, and the classification
 * was always the deliverable. Re-measured at `1c9b6bbd` it was **53 findings across 34 files**,
 * matching neither. Classifying every one of them found:
 *   • THREE LIVE CROSS-ORG READS — the lease detail page, the lease communications page and the
 *     tenant ledger page each read a row by its URL id on the service client and then used THAT
 *     ROW's `org_id` as the boundary for everything below, so any signed-in user of any agency
 *     could read another agency's lease, correspondence, documents and tenant financials by uuid.
 *     Tenant `id_number` was in one of those selects. The loose test hid all three, because the
 *     row's own `org_id` matched `ORG_AWARE` further down the function.
 *   • TWO DEFECTS IN THIS RULE — `GLOBAL_REFERENCE_TABLES` and `SESSION_SCOPED_TABLES`, 21 of the
 *     53 between them, both of which were demanding a filter that is impossible or circular.
 *   • six unscoped reads worth hardening, and five genuine exemptions, each carrying its reason at
 *     the site rather than in a path list. NOTHING was baselined.
 *
 * ⚠ STATED COVERAGE BOUNDARY, because order-sensitivity is not per-read scoping. What this catches
 * is every unscoped read PRECEDING the enclosing function's first org signal. A read AFTER one — a
 * long component whose first fetch is org-scoped and whose tenth is not — is still exempt. That
 * residual is the same aperture as before, one signal earlier; closing it needs per-read dataflow,
 * not a text test over a prefix, and is NOT claimed here. The three cross-org reads fixed in this
 * pass were all in the prefix, which is why the prefix was worth shipping first — not evidence that
 * the suffix is clean. Tracked as **M-061** in `docs/MECHANISABLE.md`.
 */
const ORG_AWARE = /\.eq\(\s*["'`]org_id["'`]|org_id\s*[!=]==?\s*|orgId\s*[!=]==?\s*/

// Same non-agent surfaces the write rule skips: a different isolation model, where org-scoping is
// not the boundary and the heuristic would only false-positive.
// ⚠ `lib/admin` AND `components/admin` WERE IN THIS LIST AND ARE NOT ANY MORE (2026-08-22, R2).
// The reason recorded for them was true — every hit was a platform-admin dashboard read
// (`platform_cost_snapshots`, `feedback_submissions`, `cron_runs`) that is cross-org BY DESIGN —
// but the write rule never carried those two entries, so the pair's aperture differed by surface.
// The 2026-08-22 consent IDOR landed in the mirror image of that gap. Both skip sets are now the
// INTERSECTION of what they were: identical, so the coverage of the pair is the union of coverage.
// Cross-org-by-design is still cross-org-by-design; it now says so at each site, in an inline
// disable, rather than in a path list nobody re-reads. A path entry is invisible in the diff when
// somebody adds a NEW, non-admin read to one of those directories.
const SKIP_PATH = /[/\\](cron|webhooks?)[/\\]|[/\\]api[/\\]auth[/\\]|[/\\]lib[/\\]auth[/\\]|[/\\]lib[/\\](portal|consent)[/\\]|[/\\]api[/\\](consent|wo|profile)[/\\]|[/\\]\(auth\)[/\\]|[/\\]\(applicant\)[/\\]|[/\\]\(public\)[/\\]|[/\\]\(tenant\)[/\\]|[/\\]\(landlord\)[/\\]|[/\\]\(supplier\)[/\\]|[/\\]\(admin\)[/\\]|[/\\]api[/\\]admin[/\\]|\[token\]|\[pull_id\]/

// Test files exercise fixtures, not production reads. Scoped OUT rather than baselined — a baseline
// entry means "real debt", and calling a fixture debt makes the baseline lie about its own size.
const TEST_PATH = /(^|[/\\])test[/\\]|\.(test|dbtest|spec)\.[cm]?[jt]sx?$/

/**
 * A service-client surface. File-level by design (see the header), and safe because cookie-client
 * `.from()` is separately forbidden.
 *
 * `requireAgentWriteAccess` is in this list because it RETURNS `gateway()`'s context — the same
 * RLS-bypassing `db`. Its absence was a silent false negative across the canonical agent-write
 * surface: measured 2026-08-19, 120 files call it, 63 matched none of the other markers, and 40 of
 * those contain a `.select(`. On every one of them this rule returned `{}` and never ran, while
 * CLAUDE.md claimed a read outside the baseline "fails immediately".
 *
 * The lesson generalises past this list: a discriminator keyed on HOW the client is obtained has to
 * enumerate every helper that hands one out, and a new helper is invisible by construction. Any
 * future wrapper around `gateway()` must be added here, which is why the rule names the property it
 * is really testing rather than pretending the list is complete.
 */
const SERVICE_CLIENT = /createServiceClient|getCachedServiceClient|gatewaySSR|gateway\(|requireAgentWriteAccess|SUPABASE_SERVICE_ROLE_KEY/

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

/**
 * Is this `.select()` a RETURNING clause on a mutation rather than a read?
 *
 * `.from("applications").insert({…}).select("id").single()` returns the row just written. It reads
 * nothing the caller did not just create, and demanding `.eq("org_id")` on it is incoherent — you
 * cannot filter an INSERT's returning set. The MUTATION is what needs org-scoping, and that is the
 * sibling rules' job (`require-org-scope-on-service-write`, `require-scope-on-delete`); flagging it
 * here double-counts one site as two different defects and points the fix at the wrong place.
 *
 * Found by classifying the 23 findings the widened discriminator surfaced: 2 of them were this.
 */
const MUTATIONS = new Set(["insert", "update", "upsert", "delete"])
function isReturningClause(readCall) {
  let node = readCall.callee.object
  let depth = 0
  while (node && depth < 60) {
    depth++
    if (node.type === "CallExpression") {
      const callee = node.callee
      if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
        if (callee.property.name === "from") return false     // reached the table: it was a read
        if (MUTATIONS.has(callee.property.name)) return true
      }
      node = callee
    } else if (node.type === "MemberExpression") {
      node = node.object
    } else {
      return false
    }
  }
  return false
}

function functionHasParam(fn, name) {
  return !!fn && fn.params.some((p) => p.type === "Identifier" && p.name === name)
}

/**
 * Does the chain AFTER the read carry `.eq("<column>", …)` (or that column inside `.match({…})`)?
 *
 * Parameterised on the column so the SESSION_SCOPED_TABLES test (`user_id`) reuses the method gate
 * below rather than re-deriving it. A second copy would drift, and the thing it would drift on is
 * exactly what this function was fixed for once already: `.neq("user_id", x)` is not a bound.
 */
function chainHasColumnScope(readCall, column = "org_id") {
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
      // The METHOD matters, not just the column. Accepting any method whose first argument is
      // "org_id" treated `.neq("org_id", orgId)` — a read of every OTHER org's rows — and
      // `.order("org_id")` as org-scoped. Only equality-shaped filters bound a read to an org.
      if (a0?.type === "Literal" && a0.value === column && SCOPING_METHODS.has(member.property.name)) return true
      // The object form takes the SAME method gate as the literal form. It did not, so
      // `.order({ org_id: true })`-shaped calls — anything whose first argument merely mentions the
      // column — counted as org-scoping. `.match({...})` is the only scoping method that takes an
      // object, so the gate costs nothing and closes the asymmetry.
      if (SCOPING_METHODS.has(member.property.name) && a0?.type === "ObjectExpression" && a0.properties.some((p) => p.type === "Property" && ((p.key.type === "Identifier" && p.key.name === column) || (p.key.type === "Literal" && p.key.value === column)))) return true
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
        if (isReturningClause(node)) return
        if (chainHasColumnScope(node)) return

        const tableArg = fromCall.arguments[0]
        if (tableArg?.type === "Literal" && (SELF_SCOPED_TABLES.has(tableArg.value) || IDENTITY_SCOPED.has(tableArg.value) || GLOBAL_REFERENCE_TABLES.has(tableArg.value))) return
        // The org-RESOLUTION read, and ONLY when it is bounded to one person — see SESSION_SCOPED_TABLES.
        if (tableArg?.type === "Literal" && SESSION_SCOPED_TABLES.has(tableArg.value) && chainHasColumnScope(node, SESSION_SCOPED_TABLES.get(tableArg.value))) return

        const fn = enclosingFunction(node)
        // Injectable core: the client is a PARAMETER, so the caller owns the org context.
        const client = fromCall.callee.object
        if (client.type === "Identifier" && functionHasParam(fn, client.name)) return

        // ⚠ ORDER MATTERS — the text from the function's start UP TO the read, never the whole
        // function. See ORG_AWARE's header (M-061).
        const start = fn ? fn.range[0] : 0
        if (ORG_AWARE.test(sourceCode.getText().slice(start, node.range[0]))) return

        context.report({ node: node.callee.property, messageId: "unscoped" })
      },
    }
  },
}

export default rule
