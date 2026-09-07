/**
 * eslint-rules/__tests__/require-org-scope-on-service-read.test.mjs — the first probe suite any
 * custom `pleks/*` rule has had.
 *
 * WHY IT EXISTS: this rule has now shipped TWO silent false negatives, both in the same place —
 * `SERVICE_CLIENT`, the file-level discriminator — and both found by adversarial review rather than
 * by anything automated, because there was nothing automated. `requireAgentWriteAccess` was missing
 * on day one (63 files, the rule returned `{}` and never ran); `getCachedServiceClient` and a
 * file building its own client from `SUPABASE_SERVICE_ROLE_KEY` were missing one pass later (23
 * findings, 8 files). A rule that returns `{}` reports zero violations and is indistinguishable
 * from a rule finding nothing — L-01's exact shape, at the rule layer.
 *
 * So the discriminator is probed per HELPER, both directions: each recognised helper makes the rule
 * fire on an unscoped read, and a file with no service client at all stays quiet. Adding a wrapper
 * around `gateway()` without adding a case here leaves the same hole, but now the hole has a shape
 * the suite can be pointed at.
 */
import { describe, it } from "vitest"
import { RuleTester } from "eslint"
import rule from "../require-org-scope-on-service-read.mjs"

// A path outside the 80-entry baseline and outside SKIP_PATH/TEST_PATH, so the rule actually runs.
const FILE = "lib/probe/unbaselined-surface.ts"

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
})

/** Every helper the discriminator recognises, each as the ONLY service-client marker in its file. */
const HELPERS = [
  ["createServiceClient", 'const db = await createServiceClient()'],
  ["getCachedServiceClient", 'const db = await getCachedServiceClient()'],
  ["gatewaySSR", 'const { db } = (await gatewaySSR()) ?? {}'],
  ["gateway()", 'const { db } = (await gateway()) ?? {}'],
  ["requireAgentWriteAccess", 'const { db } = await requireAgentWriteAccess("x")'],
  ["a raw SUPABASE_SERVICE_ROLE_KEY client", 'const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY)'],
]

describe("pleks/require-org-scope-on-service-read", () => {
  it("fires on an unscoped read behind EVERY recognised service-client helper", () => {
    tester.run("require-org-scope-on-service-read", rule, {
      valid: [],
      invalid: HELPERS.map(([name, obtain]) => ({
        name,
        filename: FILE,
        code: `async function f(id) {\n  ${obtain}\n  return db.from("leases").select("id").eq("id", id)\n}\n`,
        errors: [{ messageId: "unscoped" }],
      })),
    })
  })

  it("stays quiet where the rule has no business, and on reads that ARE scoped", () => {
    tester.run("require-org-scope-on-service-read", rule, {
      valid: [
        {
          // The discriminator's whole point: a browser/cookie-client read is bounded by RLS.
          name: "no service client in the file at all",
          filename: FILE,
          code: `async function f(id) {\n  const db = createBrowserClient()\n  return db.from("leases").select("id").eq("id", id)\n}\n`,
        },
        {
          name: "the read carries .eq(\"org_id\", …)",
          filename: FILE,
          code: `async function f(id, orgId) {\n  const db = await createServiceClient()\n  return db.from("leases").select("id").eq("id", id).eq("org_id", orgId)\n}\n`,
        },
        {
          // `.insert().select()` is a RETURNING clause: it reads back the row just written, and no
          // filter can apply to it. The MUTATION is the sibling write rule's business.
          name: ".insert(…).select() is a returning clause, not a read",
          filename: FILE,
          code: `async function f(row) {\n  const db = await createServiceClient()\n  return db.from("leases").insert(row).select("id").single()\n}\n`,
        },
        {
          name: ".update(…).select() likewise",
          filename: FILE,
          code: `async function f(row, id, orgId) {\n  const db = await createServiceClient()\n  return db.from("leases").update(row).eq("id", id).eq("org_id", orgId).select("id")\n}\n`,
        },
      ],
      invalid: [
        {
          // The returning-clause exemption must not swallow a plain read that merely SITS in a file
          // containing a mutation — it is decided by the chain, not by the file.
          name: "a plain read in a file that also mutates still fires",
          filename: FILE,
          code: `async function f(id) {\n  const db = await createServiceClient()\n  await db.from("audit_log").insert({ a: 1 }).select("id")\n  return db.from("leases").select("id").eq("id", id)\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
        {
          // `.neq("org_id")` reads every OTHER org; `.order("org_id")` bounds nothing.
          name: ".neq(\"org_id\", …) is not org-scoping",
          filename: FILE,
          code: `async function f(id, orgId) {\n  const db = await createServiceClient()\n  return db.from("leases").select("id").eq("id", id).neq("org_id", orgId)\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
      ],
    })
  })

  /**
   * M-061, 2026-08-28. Three changes ship together and each is probed BOTH directions, because the
   * two table classes are EXEMPTIONS — a broken exemption fails open, and an exemption whose probe
   * only checks the quiet direction cannot tell "correctly exempt" from "rule stopped running".
   */
  it("ORDER-SENSITIVITY: an org signal AFTER the read no longer exempts it", () => {
    tester.run("require-org-scope-on-service-read", rule, {
      valid: [
        {
          // Validate-then-act, correctly ordered: the org is known BEFORE the read.
          name: "an org signal BEFORE the read still exempts it",
          filename: FILE,
          code: `async function f(id, orgId) {\n  const db = await createServiceClient()\n  const own = await db.from("units").select("id").eq("org_id", orgId)\n  return db.from("leases").select("id").eq("id", id)\n}\n`,
        },
      ],
      invalid: [
        {
          // THE DEFECT M-061 EXISTS FOR, and the exact shape of the three live cross-org reads this
          // pass fixed: read the row by a caller-supplied id, then use the FETCHED ROW's own org as
          // the boundary for everything below. The old whole-function test read `row.org_id` as an
          // org signal and exempted the read it was supposed to bound.
          name: "the row's OWN org_id, used after the read, does not exempt it",
          filename: FILE,
          code: `async function f(id) {\n  const db = await createServiceClient()\n  const row = await db.from("leases").select("id, org_id").eq("id", id).single()\n  return db.from("payments").select("id").eq("org_id", row.org_id)\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
      ],
    })
  })

  it("GLOBAL_REFERENCE_TABLES: a table with no org_id column is exempt; a neighbouring one is not", () => {
    tester.run("require-org-scope-on-service-read", rule, {
      valid: [
        {
          name: "lease_clause_library has no org_id column — nothing to scope to",
          filename: FILE,
          code: `async function f(t) {\n  const db = await createServiceClient()\n  return db.from("lease_clause_library").select("clause_key").in("lease_type", [t])\n}\n`,
        },
      ],
      invalid: [
        {
          // The exemption is keyed on the TABLE, so the probe that matters is the adjacent table
          // that DOES carry org_id. If the set were ever widened to a prefix or a path, this passes
          // silently — which is how a reason-bearing exemption decays into a hole.
          name: "org_lease_clause_defaults DOES carry org_id and still fires",
          filename: FILE,
          code: `async function f() {\n  const db = await createServiceClient()\n  return db.from("org_lease_clause_defaults").select("clause_key")\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
      ],
    })
  })

  it("SESSION_SCOPED_TABLES: user_orgs is exempt ONLY when bounded to one user", () => {
    tester.run("require-org-scope-on-service-read", rule, {
      valid: [
        {
          // The org-RESOLUTION read: filtering it by org would have to supply the value the query
          // exists to discover. 16 live sites are this one query.
          name: "the org-resolution read, bounded by .eq(\"user_id\", …)",
          filename: FILE,
          code: `async function f(user) {\n  const db = await createServiceClient()\n  return db.from("user_orgs").select("org_id").eq("user_id", user.id)\n}\n`,
        },
      ],
      invalid: [
        {
          // THE CONDITION IS THE POINT. A bare user_orgs read is the platform's whole membership
          // table; without this case the exemption would be a table-shaped hole in the org boundary.
          name: "a BARE user_orgs read is a cross-org read and fires",
          filename: FILE,
          code: `async function f() {\n  const db = await createServiceClient()\n  return db.from("user_orgs").select("org_id, user_id")\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
        {
          // `.neq` is not a bound — the same defect this rule was fixed for once already on org_id,
          // now reachable through the parameterised column. Reuses chainHasColumnScope's method gate.
          name: ".neq(\"user_id\", …) does not bound user_orgs either",
          filename: FILE,
          code: `async function f(user) {\n  const db = await createServiceClient()\n  return db.from("user_orgs").select("org_id").neq("user_id", user.id)\n}\n`,
          errors: [{ messageId: "unscoped" }],
        },
      ],
    })
  })
})
