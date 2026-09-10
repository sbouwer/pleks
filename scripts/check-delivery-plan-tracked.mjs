/**
 * scripts/check-delivery-plan-tracked.mjs — CI gate: the delivery plan is tracked, or the gate that
 * reads it is lying
 *
 * `delivery-report.mjs --check` (kit row `delivery-report`, DELIVERY-STANDARD §4) enforces one
 * central rule: once `Baseline agreed` is set, a milestone's baseline, budget or estimate cannot
 * move without a `Changed:` line recording it. Without that rule a slip is absorbed by editing the
 * date it slipped against, and every report reads *on track* until the day it doesn't.
 *
 * IT READS THAT HISTORY FROM GIT — `git log -- brief/build/90-release.md`, every committed version
 * against the next. **pleks gitignores `brief/`** (a OneDrive symlink, deliberately outside version
 * control because it holds legal and commercial documents, and this repository is PUBLIC). So in
 * this tree that log is empty, `planVersions` returns one "working tree" version, and the rule has
 * nothing to compare — it does not fire, it does not apply, and nothing says so.
 *
 * ⚠ IT FAILS GREEN, WHICH IS WHY THIS CHECK EXISTS. Measured 2026-09-10 on two identical throwaway
 * repositories differing only in whether `brief/` was ignored, each given the same undeclared
 * baseline move (MS-01 2026-09-01 → 2026-10-01, no `Changed:` line):
 *
 *   brief/ tracked    ❌ "MS-01 baseline moved … with no recorded reason"     exit 1
 *   brief/ ignored    ✅ "1 milestones (0 done) … history: 1 version(s) read" exit 0
 *
 * The ✅ even reports a version count, which reads as *history was checked*. Canon's script is
 * careful in the neighbouring case — outside a git repository it prints `⊘ not a git repository —
 * the baseline's history was NOT checked` — so the quiet arm is the one where a repository IS
 * present and the file simply is not in it. That is the more misleading of the two: the reader has
 * every reason to assume the git-backed rule applied. Reported to canon as CF-4.
 *
 * Fails on: `brief/build/90-release.md` exists on disk and git does not track it.
 *
 * The two honest exits, both named in the failure message, because this check must not read as a
 * demand to publish commercials to a public repository:
 *   (a) track the plan — the baseline rule works, and the contract value, day rate and per-milestone
 *       budgets are then in public git history permanently, which no later delete undoes;
 *   (b) keep it untracked and drop `delivery-report --check` from `npm run check` — an absent gate
 *       is honest; a green one that enforces nothing is not.
 *
 * NO PLAN IS NOT A FAILURE. BRIEF-STANDARD §3.1: an absent band is never applicable. Today pleks has
 * no payer-facing plan, so this check and `delivery-report --check` both pass quietly. It is a
 * ratchet against the day someone writes one.
 *
 * PLAN_PATH IS READ FROM THE KIT SCRIPT'S `KIT:CONFIG report` REGION, never restated here. A second
 * copy of a path that no check reconciles is M-131's class, filed the same day this was written.
 * If canon renames the slot, this fails loudly rather than guarding a path nobody uses.
 */
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

const REPORTER = "scripts/delivery-report.mjs"

/** The plan path as the reporter itself defines it. Throws rather than guessing. */
export function planPathFrom(reporterSource) {
  // `[ \t]*`, not `\s*`: `\s` matches newlines, which with `m` gives the engine a backtracking
  // seam across lines for a declaration that is always on one.
  const m = /^[ \t]*const PLAN_PATH[ \t]*=[ \t]*"([^"]+)"/m.exec(reporterSource)
  if (!m) throw new Error(`could not read PLAN_PATH from ${REPORTER} — it moved or was renamed; this check cannot guess it`)
  return m[1]
}

/** Does git track `rel` in `root`? `ls-files` prints the path when it does, nothing when it does not. */
function isTracked(root, rel) {
  const out = execFileSync("git", ["-C", root, "ls-files", "--", rel], { encoding: "utf8" })
  return out.trim().length > 0
}

/** @returns {string[]} findings — empty is a pass. */
export function findings(root, rel) {
  if (!existsSync(join(root, rel))) return []
  if (isTracked(root, rel)) return []
  return [
    `${rel} exists but git does not track it, so \`delivery-report --check\` reads NO committed history` +
      " and DELIVERY-STANDARD §4's baseline rule silently does not apply — while the gate still prints ✅.",
    "Either track the plan (its contract value, day rate and budgets then live in this PUBLIC repo's history, permanently),",
    "or drop `delivery-report.mjs --check` from `npm run check`. An absent gate is honest; a green one that enforces nothing is not.",
  ]
}

/* ── selftest ─────────────────────────────────────────────────────────────── */

function selftest() {
  const results = []
  const check = (name, ok, detail = "") => results.push({ name, ok, detail })

  const dir = mkdtempSync(join(tmpdir(), "delivery-plan-probe-"))
  // stderr ignored: git's CRLF advice on a throwaway repo is not a probe result.
  const git = (...a) => execFileSync("git", ["-C", dir, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  try {
    git("init", "-q")
    git("config", "user.email", "probe@example.invalid")
    git("config", "user.name", "probe")
    const rel = "brief/build/90-release.md"
    mkdirSync(join(dir, "brief", "build"), { recursive: true })

    check("quiet when there is no plan at all — an absent band is never applicable", findings(dir, rel).length === 0)

    writeFileSync(join(dir, ".gitignore"), "brief/\n")
    writeFileSync(join(dir, rel), "# Release plan\n")
    git("add", "-A")
    git("commit", "-qm", "plan, in an ignored brief/")
    const fired = findings(dir, rel)
    check("FIRES on a plan git does not track", fired.length > 0, fired.length ? "" : "the untracked plan passed")

    writeFileSync(join(dir, ".gitignore"), "nothing\n")
    git("add", "-A")
    git("commit", "-qm", "plan tracked")
    check("quiet once the plan is tracked", findings(dir, rel).length === 0)

    let threw = false
    try {
      planPathFrom("const OTHER = \"x\"\n")
    } catch {
      threw = true
    }
    check("refuses to guess when PLAN_PATH cannot be read", threw)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  for (const r of results) console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`)
  const bad = results.filter((r) => !r.ok).length
  console.log(bad ? `\n❌ check-delivery-plan-tracked: ${bad} probe(s) failed` : "\n✅ check-delivery-plan-tracked probes green — fires and stays quiet")
  process.exit(bad ? 1 : 0)
}

/* ── main ─────────────────────────────────────────────────────────────────── */

if (process.argv.includes("--selftest")) selftest()

const root = process.cwd()
// The kit row is HELD, not adopted (CF-5: canon's copy trips `sonarjs/super-linear-regex` six times
// and pleks may neither fix nor exempt a `tracked` row). This guard is wired in ahead of it on
// purpose: the fail-open it covers is invisible at exactly the moment someone finally installs the
// reporter, and a control that has to be remembered on that day is the one that will not be.
if (!existsSync(join(root, REPORTER))) {
  console.log(`✅ check-delivery-plan-tracked: ${REPORTER} is not installed — the kit row is held; nothing to guard yet`)
  process.exit(0)
}
const rel = planPathFrom(readFileSync(join(root, REPORTER), "utf8"))
const found = findings(root, rel)
if (found.length) {
  console.log(`❌ check-delivery-plan-tracked: ${rel} is not tracked\n`)
  for (const line of found) console.log(`  ${line}`)
  process.exit(1)
}
console.log(`✅ check-delivery-plan-tracked: ${existsSync(join(root, rel)) ? `${rel} is tracked` : `no ${rel} yet — nothing to check`}`)
