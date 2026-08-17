/**
 * scripts/check-workflow-secrets.mjs — every `secrets.*` a workflow references must actually exist
 *
 * NOW.md item 14c. The instance this closes: `.github/workflows/ci.yml`'s security job passed
 * `secrets.CI_SUPABASE_URL` / `secrets.CI_SUPABASE_SERVICE_ROLE_KEY` and carried
 * `continue-on-error: false`, which reads as strict. Neither secret has ever existed on this repo —
 * `gh secret list` returns only SENTRY_AUTH_TOKEN. GitHub Actions substitutes an EMPTY STRING for an
 * undefined secret rather than failing, so the job ran, found no credentials, short-circuited
 * gracefully, and went green in ~45 seconds. Categories 1/2/5/7 had never run.
 *
 * That is the class: a secret reference is a silent contract. Nothing in GitHub tells you it is
 * unmet — the job just quietly does less than it appears to.
 *
 * ── THE TWO HALVES, AND WHY THE COVERAGE STATEMENT MATTERS ───────────────────────────────────
 *
 * A · MANIFEST CHECK (always runs, CI-safe, no credentials needed). Every `secrets.NAME` reference
 *     found in `.github/workflows/*.yml` must be declared in SECRET_MANIFEST below with a status.
 *     A NEW undeclared reference fails immediately. This half genuinely executes its subject
 *     everywhere, so it is the half that can gate CI.
 *
 * B · LIVE CHECK (needs `gh` authenticated with admin read on the repo). Diffs the manifest's
 *     claimed status against `gh secret list`. **This cannot run in GitHub Actions** — the default
 *     GITHUB_TOKEN has no `secrets:read`, and giving a workflow the ability to enumerate the repo's
 *     own secrets would be a worse idea than the bug it detects. So it is a local/CC step.
 *
 * When half B cannot run, this script says so in plain words and DOES NOT claim the coverage it did
 * not obtain — the whole point of the finding it exists because of. Half A still passing is a real
 * result, narrowly stated, not a green tick standing in for the other half.
 *
 * Exit 1 on: an undeclared reference · a manifest entry marked `present` that `gh` says is absent ·
 * any reference whose manifest status is `missing` (that is the live defect, not a note).
 */
import { readdirSync, readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const WORKFLOW_DIR = ".github/workflows"

/**
 * Every secret the workflows are allowed to reference, and whether it exists.
 * `present` — verified to exist on the repo.  `missing` — referenced but NOT provisioned (a defect,
 * carried here only so the failure names the owner and the tracking item rather than being anonymous).
 */
const SECRET_MANIFEST = {
  // Exists on the repo (created 2026-04-30) but is referenced by ZERO workflows — the inverse of the
  // CI_SUPABASE_* case. Most likely consumed by the Vercel build rather than Actions; NOT verified
  // here, and deliberately not asserted. Unreferenced secrets are reported, never failed on: an unused
  // secret is a cleanup question, not a broken contract.
  SENTRY_AUTH_TOKEN: { status: "present", note: "Created 2026-04-30. No workflow references it." },
  GITHUB_TOKEN: { status: "present", note: "Injected by Actions; never set by hand." },
  // CI_SUPABASE_URL / CI_SUPABASE_SERVICE_ROLE_KEY were removed from ci.yml on 2026-08-17 (item 14d):
  // the DB security categories now run against the Supabase stack the db-tests job boots, so no
  // long-lived service-role key needs to exist at all. Deliberately NOT listed here — an entry for a
  // secret nothing references would be exactly the stale bookkeeping this script exists to prevent.
}

/** Every `secrets.NAME` / `secrets['NAME']` reference in the workflow tree, with where it came from. */
function collectReferences() {
  const refs = new Map()
  const files = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
  if (files.length === 0) throw new Error(`no workflow files under ${WORKFLOW_DIR} — glob decayed?`)

  for (const file of files) {
    const lines = readFileSync(join(WORKFLOW_DIR, file), "utf8").split(/\r?\n/)
    lines.forEach((line, i) => {
      // A YAML comment is prose, not a contract. Documentation ABOUT a secret — including the note
      // explaining why CI_SUPABASE_* was removed — must not read as a live reference, or removing a
      // secret correctly and explaining why would fail this check. (Found by running this script
      // against that very comment.)
      if (line.trimStart().startsWith("#")) return
      // secrets.FOO  ·  secrets['FOO']  ·  secrets["FOO"]
      for (const m of line.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)|secrets\[['"]([^'"]+)['"]\]/g)) {
        const name = m[1] ?? m[2]
        if (!refs.has(name)) refs.set(name, [])
        refs.get(name).push(`${file}:${i + 1}`)
      }
    })
  }
  return refs
}

/** Live secret names, or null when `gh` is unavailable/unauthorised — never an empty list on failure. */
function liveSecretNames() {
  try {
    const out = execFileSync("gh", ["secret", "list", "--json", "name"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    return new Set(JSON.parse(out).map((s) => s.name))
  } catch {
    return null
  }
}

const refs = collectReferences()
const failures = []

console.log(`🔑 Workflow secret references — ${refs.size} distinct across ${readdirSync(WORKFLOW_DIR).length} workflow files\n`)

// ── Half A — manifest check ──────────────────────────────────────────────────────────────────
for (const [name, sites] of [...refs].sort()) {
  const entry = SECRET_MANIFEST[name]
  if (!entry) {
    failures.push(
      `UNDECLARED  ${name}\n    referenced at ${sites.join(", ")}\n` +
      `    Add it to SECRET_MANIFEST in this file with its real status. A reference GitHub silently\n` +
      `    substitutes an empty string for is exactly how CI_SUPABASE_* went unnoticed.`,
    )
    continue
  }
  if (entry.status === "missing") {
    failures.push(`NOT PROVISIONED  ${name}\n    referenced at ${sites.join(", ")}\n    ${entry.note}`)
    continue
  }
  console.log(`  ✓ ${name} — declared present (${sites.length} reference${sites.length === 1 ? "" : "s"})`)
}

// ── Half B — live check, when it can actually run ────────────────────────────────────────────
const live = liveSecretNames()
if (live === null) {
  console.log(
    "\n  ⓘ LIVE VERIFICATION DID NOT RUN — `gh secret list` unavailable or unauthorised.\n" +
    "    Half A (references ⇄ manifest) DID run and its result above is real. The manifest's claim\n" +
    "    that a secret EXISTS is unverified in this invocation. This is expected inside GitHub\n" +
    "    Actions: the default GITHUB_TOKEN has no secrets:read, and granting it would be worse than\n" +
    "    the bug this catches. Run locally with an authenticated gh to check the other half.",
  )
} else {
  console.log(`\n  Live secrets on the repo: ${[...live].sort().join(", ") || "(none)"}`)
  for (const [name, entry] of Object.entries(SECRET_MANIFEST)) {
    if (name === "GITHUB_TOKEN") continue // injected, never listed
    if (entry.status === "present" && !live.has(name)) {
      failures.push(`MANIFEST WRONG  ${name}\n    declared present, but gh says it does not exist.`)
    }
    if (entry.status === "missing" && live.has(name)) {
      failures.push(
        `MANIFEST STALE  ${name}\n    declared missing, but it EXISTS now — someone provisioned it.\n` +
        `    Flip it to present. Leaving it 'missing' keeps this script failing for a reason that is\n` +
        `    no longer true, which is how a real failure gets ignored.`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error(`\n❌ ${failures.length} problem${failures.length === 1 ? "" : "s"}:\n`)
  for (const f of failures) console.error(`  ${f}\n`)
  process.exit(1)
}

console.log("\n✅ every workflow secret reference is declared, and none is known-missing")
