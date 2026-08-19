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
})
