#!/usr/bin/env node
/**
 * scripts/check-release-health.mjs — make a failed Release run reach something that fails (M-084)
 *
 * Auth:   none locally; the live query uses `gh`, which CI authenticates via GH_TOKEN
 * Data:   `gh run list --workflow=Release --branch main --limit 1`
 * Notes:  THE PROBLEM IS NOT THAT RELEASE BROKE. It is that it broke three times, over two days,
 *         while two sessions read `gh run list` output with the word `failure` on the Release row and
 *         acted only on the CI row. A CI job whose result nobody consumes is not a control — it is a
 *         log line. This turns that log line into a red check on the next PR.
 *
 *         WHY A PR JOB AND NOT A CRON: a cron that opens an issue is a second thing nobody reads.
 *         The next PR is the first moment a human is definitely looking at this repo's checks.
 *
 *         ⚠ THE DEADLOCK IS REAL AND IS HANDLED. A gate that blocks every PR when releases are broken
 *         also blocks the PR that FIXES them — which is how a control earns a permanent `|| true`.
 *         So a PR touching the release machinery (`.releaserc*`, `.github/workflows/release.yml`,
 *         or this file) passes with the failure REPORTED rather than enforced. That carve-out is
 *         mechanical, not a judgement call, and it is the narrowest thing that removes the deadlock:
 *         it does not exempt a branch by name, by author, or by a magic commit-message token.
 */
import { execFileSync } from "node:child_process"

/** Paths whose presence in a diff means "this PR may be the fix" — see the deadlock note above. */
export const RELEASE_PATHS = [".releaserc", ".github/workflows/release.yml", "scripts/check-release-health.mjs"]

/**
 * The assertion, pure so both directions are testable without a network.
 *
 * `status` matters as much as `conclusion`: a run still in progress has an EMPTY conclusion, and
 * treating empty as "not success" would fail every PR opened while a release is mid-flight — a false
 * red that would get this check deleted inside a week.
 */
export function evaluate({ status, conclusion, touchesReleaseConfig }) {
  // No run at all is NOT a pass. This repo has released since 2026-08-17; an empty result means the
  // query is wrong (renamed workflow, changed branch), and a query that matches nothing exits clean
  // — the collapsed-analysis shape `check-knip-floor.mjs` exists to catch in its own domain.
  if (status === null) {
    return { ok: false, carved: false, message: "no Release run found on main at all — the query matched nothing, which is a broken query, not a clean bill of health. Check the workflow name and branch." }
  }
  if (status !== "completed") {
    return { ok: true, carved: false, message: `the latest Release run is ${status} — nothing to assert yet` }
  }
  // `skipped` is a legitimate no-op; every other non-success means the release did not happen.
  if (conclusion === "success" || conclusion === "skipped") {
    return { ok: true, carved: false, message: `the latest Release run on main is ${conclusion}` }
  }
  const detail =
    `the latest Release run on main is ${conclusion}. No tag, no GitHub Release, no version bump — ` +
    `and semantic-release will keep accumulating the backlog until it is fixed, so this is not ` +
    `self-healing. Inspect: gh run list --workflow=Release --limit 3`
  if (touchesReleaseConfig) {
    return { ok: true, carved: true, message: `${detail}\n   NOT ENFORCED: this PR touches the release machinery, so it may be the fix.` }
  }
  return { ok: false, carved: false, message: detail }
}

function selftest() {
  const cases = [
    ["a green release passes", { status: "completed", conclusion: "success", touchesReleaseConfig: false }, true],
    ["A FAILED RELEASE FAILS — the case this script exists for", { status: "completed", conclusion: "failure", touchesReleaseConfig: false }, false],
    ["cancelled is not success — the release still did not happen", { status: "completed", conclusion: "cancelled", touchesReleaseConfig: false }, false],
    ["timed_out is not success either", { status: "completed", conclusion: "timed_out", touchesReleaseConfig: false }, false],
    ["NO RUN FOUND FAILS — an empty query is a broken query, not a clean tree", { status: null, conclusion: null, touchesReleaseConfig: false }, false],
    // The known-good half. Without these, "fail on everything" scores green.
    ["KNOWN-GOOD: a run still in progress has no conclusion yet and must not fail", { status: "in_progress", conclusion: "", touchesReleaseConfig: false }, true],
    ["KNOWN-GOOD: a queued run must not fail", { status: "queued", conclusion: "", touchesReleaseConfig: false }, true],
    ["KNOWN-GOOD: skipped is a legitimate no-op", { status: "completed", conclusion: "skipped", touchesReleaseConfig: false }, true],
    ["KNOWN-GOOD: the deadlock carve-out — a PR touching release config is not blocked", { status: "completed", conclusion: "failure", touchesReleaseConfig: true }, true],
  ]
  let bad = 0
  for (const [label, input, wantOk] of cases) {
    const got = evaluate(input).ok
    const ok = got === wantOk
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ok=${wantOk}, got ok=${got}`}`)
  }
  // The carve-out must REPORT, not go quiet. A silent carve-out is indistinguishable from a pass, and
  // the next reader would have no idea releases are broken — which is the exact defect M-084 names.
  const carved = evaluate({ status: "completed", conclusion: "failure", touchesReleaseConfig: true })
  if (!carved.carved || !/NOT ENFORCED/.test(carved.message)) {
    console.log("  ✗ the carve-out passes SILENTLY — it must still say the release is broken"); bad++
  } else console.log("  ✓ the carve-out still REPORTS the failure — it suppresses the gate, not the news")

  // …and the discriminating half of that: a green run must not be labelled carved.
  if (evaluate({ status: "completed", conclusion: "success", touchesReleaseConfig: true }).carved) {
    console.log("  ✗ a GREEN release is being reported as carved out"); bad++
  } else console.log("  ✓ KNOWN-GOOD: a green release is not labelled carved even on a release-config PR")

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-release-health selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

/** Files changed against the PR base, or [] outside a PR. */
function changedFiles() {
  const base = process.env.GITHUB_BASE_REF
  if (!base) return []
  try {
    return execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean)
  } catch {
    // A diff that cannot be computed must not silently disable the carve-out NOR silently enable it.
    // Returning [] enables the gate, which is the safe direction: the worst case is a red check on a
    // PR that was the fix, and the message names the carve-out so the reader can see what happened.
    return []
  }
}

let run
try {
  const raw = execFileSync("gh", ["run", "list", "--workflow=Release", "--branch", "main", "--limit", "1", "--json", "status,conclusion,displayTitle,url"], {
    encoding: "utf8", stdio: "pipe", shell: true,
  })
  run = JSON.parse(raw)[0] ?? null
} catch (e) {
  // NOT a pass. `gh` missing or unauthenticated means this check did not run, and a check that
  // cannot run reporting green is the failure mode this repo keeps re-finding in its own gates.
  console.error("✗ release health: could not query the Release workflow — the check did not run, so it is not green.")
  console.error(`   ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`)
  process.exit(1)
}

const files = changedFiles()
const touchesReleaseConfig = files.some((f) => RELEASE_PATHS.some((p) => f === p || f.startsWith(p)))
const result = evaluate({
  status: run ? run.status : null,
  conclusion: run ? run.conclusion : null,
  touchesReleaseConfig,
})

if (!result.ok) {
  console.error(`✗ release health: ${result.message}`)
  if (run) console.error(`   ${run.displayTitle}\n   ${run.url}`)
  process.exit(1)
}
console.log(`✅ release health: ${result.message}`)
if (run && result.carved) console.error(`   ${run.url}`)
