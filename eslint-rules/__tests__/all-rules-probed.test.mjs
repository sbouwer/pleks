/**
 * eslint-rules/__tests__/all-rules-probed.test.mjs — one planted violation and one known-good for
 * every custom `pleks/*` rule that has no dedicated suite of its own (R3).
 *
 * WHY BOTH DIRECTIONS, ALWAYS. A rule that never fires and a rule that finds nothing are the same
 * green in CI (L-01, and `.claude/rules/lint-rules.md` trap 2). A rule that fires on everything is
 * caught the first time someone runs it. So the planted violation proves the rule is ALIVE, and the
 * known-good proves it is DISCRIMINATING; neither claim survives without the other. This repo has
 * already shipped two silent false negatives in one rule's file-level discriminator, both found by
 * adversarial review because there was nothing automated to find them.
 *
 * WHY THE MEMBER LIST COMES FROM DISK. `.claude/rules/lint-rules.md`: a parity test enumerates its
 * members, it never samples them, and it derives the list from disk rather than a hand-written array
 * — otherwise rule #22 ships unprobed and this file still reports green. `everyRuleIsProbed` below
 * is that assertion, and it is the reason to add a case here rather than skip one.
 *
 * SCOPE, STATED. This is one violation and one known-good per rule: enough to prove the rule runs
 * and discriminates, NOT enough to characterise its edge cases. `require-org-scope-on-service-read`
 * has its own suite because its discriminator needed per-helper coverage; any rule that earns that
 * depth should get its own file and drop out of CASES here.
 *
 * FILENAMES ARE LOAD-BEARING. Most of these rules gate on path — a baseline, an allowlist, a
 * SKIP_PATH, or a surface test like `file.startsWith("app/")`. A case whose filename lands inside a
 * baseline silently tests nothing, which is the same false-green this suite exists to prevent. Every
 * filename below is chosen to sit OUTSIDE the rule's exemptions.
 *
 * WHY THIS SUITE IS NOT VACUOUS, which L-44 says to argue rather than assume (a probe and the thing
 * it guards, authored by the same hand, agree by construction). Two structural properties do the
 * work, and neither depends on the author having been careful:
 *   1. The invalid case asserts an error IS raised with a named messageId. A rule that returns `{}`
 *      — the silent-disable failure mode, whether from a mis-derived path, a baseline hit or a dead
 *      discriminator — FAILS here rather than passing quietly. A wrong filename cannot go unnoticed.
 *   2. `bad` and `good` share one filename per rule. Since `bad` fires, the rule provably RAN on
 *      that path; so `good` passing is the rule discriminating, never the rule being switched off.
 * What this still cannot prove is the class nobody thought of — that is what adversarial review is
 * for, and it is how both of this repo's silent false negatives were actually found.
 */
import { describe, it, expect } from "vitest"
import { readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { RuleTester } from "eslint"

const HERE = dirname(fileURLToPath(import.meta.url))
const RULES_DIR = join(HERE, "..")

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
})

const jsx = {
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}

/**
 * rule name → { file, bad, good, messageId, options? }
 *
 * `bad` must produce exactly the listed messageId; `good` must produce nothing. Where a rule's
 * known-good needs to stay in the same file as the violation to be meaningful (a discriminator
 * test rather than a syntax test), that is noted at the case.
 */
const CASES = {
  "no-adhoc-dates": {
    file: "lib/probe/adhoc-dates.ts",
    // `lib/dates/` is exempt as the implementation itself, so the probe sits outside it.
    bad: `export const today = new Date().toISOString().slice(0, 10)\n`,
    good: `import { saTodayISO } from "@/lib/dates"\nexport const today = saTodayISO()\n`,
    messageId: "naiveToday",
  },

  "no-cookie-client-from": {
    file: "lib/probe/cookie-client.ts",
    bad: `import { createClient } from "@/lib/supabase/server"\nexport async function f() {\n  const db = await createClient()\n  return db.from("leases").select("id")\n}\n`,
    // The cookie client's ONE legitimate use. Same import, so this is the discriminator firing,
    // not merely the absence of the import.
    good: `import { createClient } from "@/lib/supabase/server"\nexport async function f() {\n  const db = await createClient()\n  return db.auth.getUser()\n}\n`,
    messageId: "cookieFrom",
  },

  "no-derived-contact-column-write": {
    file: "lib/probe/derived-contact.ts",
    bad: `export async function f(db, id, email) {\n  return db.from("contacts").update({ primary_email: email }).eq("id", id)\n}\n`,
    good: `export async function f(db, id, name) {\n  return db.from("contacts").update({ display_name: name }).eq("id", id)\n}\n`,
    messageId: "derivedWrite",
  },

  "no-direct-resend-send": {
    file: "lib/probe/resend.ts",
    bad: `export async function f(resend, to) {\n  return resend.emails.send({ to, subject: "x", html: "<p>x</p>" })\n}\n`,
    good: `import { sendEmail } from "@/lib/comms/send-email"\nexport async function f(to) {\n  return sendEmail({ to, subject: "x", contentHtml: "<p>x</p>" })\n}\n`,
    messageId: "noDirect",
  },

  "no-id-number-hash-in-app": {
    // Gated on `file.startsWith("app/")` — the whole point of the rule is the surface, so a
    // lib/ filename here would test nothing.
    file: "app/api/probe/route.ts",
    bad: `export async function f(db, h) {\n  return db.from("applicants").select("id").eq("id_number_hash", h)\n}\n`,
    good: `export async function f(db, id) {\n  return db.from("applicants").select("id").eq("id", id)\n}\n`,
    messageId: "leaked",
  },

  "no-inline-app-url": {
    file: "lib/probe/inline-url.ts",
    bad: `import { APP_URL } from "@/lib/env"\nexport const link = \`\${APP_URL}/apply/x\`\n`,
    good: `import { absoluteUrl } from "@/lib/routing/absoluteUrl"\nexport const link = absoluteUrl("/apply/x")\n`,
    messageId: "inline",
  },

  "no-popia-raw-delete": {
    file: "lib/probe/popia-delete.ts",
    bad: `export async function f(db, id, orgId) {\n  return db.from("tenants").delete().eq("id", id).eq("org_id", orgId)\n}\n`,
    // An unrestricted table, deleted the same way — proves the rule discriminates on the TABLE and
    // is not simply banning `.delete()`.
    good: `export async function f(db, id, orgId) {\n  return db.from("import_batches").delete().eq("id", id).eq("org_id", orgId)\n}\n`,
    messageId: "rawDelete",
  },

  "no-raw-audit-log-insert": {
    file: "lib/probe/audit-insert.ts",
    bad: `export async function f(db, row) {\n  return db.from("audit_log").insert(row)\n}\n`,
    good: `import { recordAudit } from "@/lib/audit/recordAudit"\nexport async function f(db, orgId, actorId) {\n  return recordAudit(db, { orgId, actorId, action: "UPDATE", table: "leases", recordId: "x" })\n}\n`,
    messageId: "rawInsert",
  },

  "no-raw-content-hash": {
    file: "lib/probe/content-hash.ts",
    bad: `import { createHash } from "node:crypto"\nexport const h = (b) => createHash("sha256").update(b).digest("hex")\n`,
    good: `import { contentHash } from "@/lib/crypto"\nexport const h = (b) => contentHash(b)\n`,
    messageId: "rawHash",
  },

  "no-raw-cron-secret": {
    // `/lib/cron/` is where the helper legitimately reads it, so the probe sits outside.
    file: "app/api/cron/probe/route.ts",
    bad: `export async function GET(req) {\n  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) return new Response(null, { status: 401 })\n  return new Response("ok")\n}\n`,
    good: `import { requireCronAuth } from "@/lib/cron/auth"\nexport async function GET(req) {\n  const denied = requireCronAuth(req)\n  if (denied) return denied\n  return new Response("ok")\n}\n`,
    messageId: "rawSecret",
  },

  "no-raw-process-env": {
    file: "lib/probe/raw-env.ts",
    bad: `export const key = process.env.SOME_PROBE_SECRET\n`,
    good: `import { requireEnv } from "@/lib/env"\nexport const key = requireEnv("SOME_PROBE_SECRET")\n`,
    messageId: "rawEnv",
  },

  "no-rerolled-money-format": {
    file: "lib/probe/money.ts",
    bad: `export const z = (n) => n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })\n`,
    good: `import { formatZAR } from "@/lib/constants"\nexport const z = (cents) => formatZAR(cents)\n`,
    messageId: "rerolled",
  },

  "no-rerolled-property-label": {
    file: "lib/probe/property-label.ts",
    bad: `export const label = (unit) => \`\${unit.unit_number}, \${unit.properties.name}\`\n`,
    good: `import { formatPropertyLabel } from "@/lib/properties/propertyLabel"\nexport const label = (unit) => formatPropertyLabel(unit)\n`,
    messageId: "rerolled",
  },

  "no-rerolled-phone-normalise": {
    // `lib/validation/` is the implementation, exempt by path.
    file: "lib/probe/phone.ts",
    bad: `export function normalizePhoneNumber(v) {\n  return String(v).replace(/\\D/g, "")\n}\n`,
    good: `import { normalizePhone } from "@/lib/validation/contact"\nexport const toE164 = (v) => normalizePhone(v)\n`,
    messageId: "rerolled",
  },

  "require-audit-on-sensitive-mutation": {
    file: "lib/probe/audit-required.ts",
    bad: `export async function f(db, orgId, id, status) {\n  await db.from("leases").update({ status }).eq("id", id).eq("org_id", orgId)\n}\n`,
    // Same mutation, audited in the same module — the rule is function-scoped, so the audit call
    // has to be reachable from the mutating function, not merely present in the file.
    good: `import { recordAudit } from "@/lib/audit/recordAudit"\nexport async function f(db, orgId, actorId, id, status) {\n  await db.from("leases").update({ status }).eq("id", id).eq("org_id", orgId)\n  await recordAudit(db, { orgId, actorId, action: "UPDATE", table: "leases", recordId: id })\n}\n`,
    messageId: "missingAudit",
  },

  "require-org-scope-on-service-write": {
    file: "lib/probe/service-write.ts",
    // The client must be CREATED here, not received as a parameter: a client passed in is an
    // "injectable core" the rule deliberately exempts, so `f(db, ...)` would prove nothing.
    bad: `import { createServiceClient } from "@/lib/supabase/service"\nexport async function f(id, status) {\n  const db = await createServiceClient()\n  return db.from("leases").update({ status }).eq("id", id)\n}\n`,
    good: `import { createServiceClient } from "@/lib/supabase/service"\nexport async function f(id, status, orgId) {\n  const db = await createServiceClient()\n  return db.from("leases").update({ status }).eq("id", id).eq("org_id", orgId)\n}\n`,
    messageId: "unscoped",
  },

  "require-scope-on-delete": {
    file: "lib/probe/scoped-delete.ts",
    bad: `export async function f(db, id) {\n  return db.from("leases").delete().eq("id", id)\n}\n`,
    good: `export async function f(db, id, orgId) {\n  return db.from("leases").delete().eq("id", id).eq("org_id", orgId)\n}\n`,
    messageId: "unscoped",
  },

  "require-id-number-encryption": {
    file: "lib/probe/id-encryption.ts",
    bad: `export async function f(db, raw) {\n  return db.from("applicants").insert({ id_number: raw })\n}\n`,
    good: `import { idNumberColumns } from "@/lib/crypto/idNumber"\nexport async function f(db, raw) {\n  return db.from("applicants").insert({ ...idNumberColumns(raw) })\n}\n`,
    messageId: "rawIdNumber",
  },

  "require-supabase-error-check": {
    file: "lib/probe/error-check.ts",
    bad: `export async function f(db) {\n  const { data } = await db.from("leases").select("id")\n  return data ?? []\n}\n`,
    good: `export async function f(db) {\n  const { data, error } = await db.from("leases").select("id")\n  if (error) { console.error("[probe] read failed", error); return [] }\n  return data ?? []\n}\n`,
    messageId: "missingError",
    // M-090: the aperture is the CALL, not the variable name. `{ count }` is the same defect in the
    // spelling the rule could not see until 2026-08-23 — the `head: true, count: "exact"` existence
    // check, whose false zero reads as "no rows" and, for a dedup guard, as "not done yet".
    // `{ status }` is here so the HTTP pair is covered by a probe rather than by the constant alone.
    alsoBad: [
      `export async function f(db) {\n  const { count } = await db.from("rule_runs").select("id", { head: true, count: "exact" })\n  return (count ?? 0) > 0\n}\n`,
      `export async function f(db) {\n  const { status } = await db.from("leases").select("id")\n  return status === 200\n}\n`,
      // The SECOND aperture hole: a conditionally-built query is awaited as an Identifier, so the
      // rule used to return before reading the fields. This is lib/rules/actioned.ts's exact shape.
      `export async function f(db, since) {\n  let query = db.from("rule_runs").select("id", { head: true, count: "exact" })\n  if (since) query = query.gte("evaluated_at", since)\n  const { count } = await query\n  return (count ?? 0) > 0\n}\n`,
    ],
    alsoGood: [
      `export async function f(db) {\n  const { count, error } = await db.from("rule_runs").select("id", { head: true, count: "exact" })\n  if (error) { console.error("[probe] count failed", error); return null }\n  return (count ?? 0) > 0\n}\n`,
      // The degenerate third: a destructure of an awaited Supabase call binding NO result field is
      // not a result read, and must not be flagged just for being awaited off a `.from()` chain.
      `export async function f(db) {\n  const { body } = await db.from("leases").select("id")\n  return body\n}\n`,
      // An awaited identifier that never held a Supabase chain must stay quiet — otherwise the
      // identifier arm turns every `const { data } = await somePromise` in the repo into a finding.
      `export async function f(fetchJson) {\n  const promise = fetchJson("/api/x")\n  const { data } = await promise\n  return data\n}\n`,
    ],
  },

  "settings-use-detail-tabs": {
    // Gated on `(dashboard)/settings/` — anywhere else and the rule returns {} without looking.
    file: "app/(dashboard)/settings/probe/page.tsx",
    bad: `import { Tabs } from "@/components/ui/tabs"\nexport default function P() {\n  return <Tabs />\n}\n`,
    good: `import { DetailTabs } from "@/components/detail/DetailTabs"\nexport default function P() {\n  return <DetailTabs />\n}\n`,
    messageId: "useDetailTabs",
    jsx: true,
  },
}

/** Rules with a dedicated suite — probed there, deliberately absent from CASES. */
const OWN_SUITE = new Set(["require-org-scope-on-service-read"])

const ruleFiles = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith(".mjs") && !f.includes(".baseline."))
  .map((f) => f.replace(/\.mjs$/, ""))

describe("every pleks/* rule is probed in both directions", () => {
  // The enumeration assertion, per `.claude/rules/lint-rules.md`: this list comes from disk, and a
  // realistic floor rather than `> 0` so a decayed readdir cannot pass as a full sweep.
  it("actually enumerated the rules directory", () => {
    expect(ruleFiles.length).toBeGreaterThan(15)
  })

  it("leaves no rule unprobed — a new rule fails here until it has a case", () => {
    const unprobed = ruleFiles.filter((r) => !(r in CASES) && !OWN_SUITE.has(r))
    expect(unprobed, `add a case to CASES (or a dedicated suite) for: ${unprobed.join(", ")}`).toEqual([])
  })

  it("claims no dedicated suite that does not exist", () => {
    const suites = new Set(
      readdirSync(HERE)
        .filter((f) => f.endsWith(".test.mjs"))
        .map((f) => f.replace(/\.test\.mjs$/, "")),
    )
    const missing = [...OWN_SUITE].filter((r) => !suites.has(r))
    expect(missing, `OWN_SUITE names a suite with no file: ${missing.join(", ")}`).toEqual([])
  })
})

for (const [name, c] of Object.entries(CASES)) {
  describe(`pleks/${name}`, () => {
    it("fires on a planted violation, and stays quiet on the known-good", async () => {
      const rule = (await import(`../${name}.mjs`)).default
      const cfg = c.jsx ? jsx : {}
      // `alsoBad`/`alsoGood` extend a case with extra spellings of the SAME defect. They exist
      // because a rule's aperture is only ever proven by the spellings actually run through it —
      // M-090 was a rule that covered its class in prose and one spelling in fact.
      const bad = [c.bad, ...(c.alsoBad ?? [])]
      const good = [c.good, ...(c.alsoGood ?? [])]
      tester.run(name, rule, {
        invalid: bad.map((code) => ({ filename: c.file, code, errors: [{ messageId: c.messageId }], ...cfg })),
        valid: good.map((code) => ({ filename: c.file, code, ...cfg })),
      })
    })
  })
}
