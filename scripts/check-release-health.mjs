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
import { readFileSync } from "node:fs"

/** Paths whose presence in a diff means "this PR may be the fix" — see the deadlock note above. */
export const RELEASE_PATHS = [".releaserc", ".github/workflows/release.yml", "scripts/check-release-health.mjs"]

/**
 * Note keywords that may appear in `.releaserc.json`'s `parserOpts`.
 *
 * ⚠ THIS LIST EXISTS BECAUSE A BARE "BREAKING" CUT v4.0.0 OFF A `fix:`. On 2026-08-23 `fbbc59f4`
 * ("fix(security): close fail-open gates…") released a MAJOR instead of a patch. There was no `!` in
 * the title and no `BREAKING CHANGE:` footer anywhere in the body. The config listed `"BREAKING"` as
 * a note keyword, conventional-commits-parser matches note keywords case-insensitively at line
 * start, and the body contained this ordinary prose sentence:
 *
 *     Breaking the cycle third, and least. lib/auth/can -> orgRoles -> getOrgTier ->
 *
 * which parsed as a breaking-change note titled "Breaking", and `{breaking: true, release: "major"}`
 * did the rest. Verified both directions against the real parser and the real commit body before
 * this was written: the wide config flags it, the narrow config does not, and the narrow config
 * still flags a genuine `BREAKING CHANGE:` footer.
 *
 * THE RULE, which is what generalises past this one word: **a note keyword must be a PHRASE that
 * nobody writes at the start of an English sentence.** "BREAKING CHANGE" is safe because prose does
 * not begin that way; "BREAKING" is not, and neither would "NOTE", "IMPORTANT" or "WARNING" be. The
 * allowlist is explicit rather than a heuristic, because the heuristic ("must contain a space") would
 * admit "BREAKING NEWS" and reject the spec's own hyphenated form.
 *
 * Conventional Commits v1.0.0 defines `BREAKING CHANGE:` and makes `BREAKING-CHANGE:` synonymous.
 * `BREAKING CHANGES` is a tolerated plural this repo already carried; it is still a phrase, so it
 * cannot fire by accident.
 */
export const ALLOWED_NOTE_KEYWORDS = ["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING-CHANGE", "BREAKING-CHANGES"]

/**
 * Assert a semantic-release config cannot promote prose to a major bump. Pure, so both directions
 * are testable without touching the real file.
 *
 * Two assertions, because fixing only the first one would let the guard be satisfied by a config
 * that no longer detects real breaks at all — trading a false major for a missed one.
 */
export function evaluateReleaseConfig(config) {
  const problems = []
  const analyzer = (config.plugins || []).find(
    (p) => Array.isArray(p) && p[0] === "@semantic-release/commit-analyzer",
  )
  if (!analyzer) {
    return { ok: false, problems: ["no @semantic-release/commit-analyzer entry with options — this check has nothing to read, which is a broken query rather than a clean bill of health"] }
  }
  const opts = analyzer[1] || {}

  const keywords = opts.parserOpts?.noteKeywords
  if (!Array.isArray(keywords)) {
    problems.push("parserOpts.noteKeywords is absent, so the parser's DEFAULT keyword set applies and this config asserts nothing about it — state the list explicitly")
  } else {
    for (const kw of keywords) {
      if (!ALLOWED_NOTE_KEYWORDS.includes(kw)) {
        problems.push(`note keyword ${JSON.stringify(kw)} is not a phrase — a commit body line beginning with that word becomes a BREAKING CHANGE note and cuts a MAJOR release. Allowed: ${ALLOWED_NOTE_KEYWORDS.join(", ")}`)
      }
    }
  }

  const rules = opts.releaseRules
  if (Array.isArray(rules) && !rules.some((r) => r.breaking === true)) {
    problems.push("releaseRules has no { breaking: true } entry — narrowing the keywords must not also stop real breaking changes from being detected")
  }

  return { ok: problems.length === 0, problems }
}

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

  // ── release-config shape (the v4.0.0 defect) ────────────────────────────────────────────────
  const cfg = (noteKeywords, releaseRules = [{ type: "fix", release: "patch" }, { breaking: true, release: "major" }]) => ({
    plugins: [["@semantic-release/commit-analyzer", { releaseRules, parserOpts: noteKeywords ? { noteKeywords } : {} }]],
  })
  const cfgCases = [
    ["A BARE 'BREAKING' KEYWORD FAILS — the exact config that cut v4.0.0 off a fix:", cfg(["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING"]), false],
    ["any other bare word fails too — the rule is 'phrase', not a blocklist of one word", cfg(["BREAKING CHANGE", "NOTE"]), false],
    ["absent noteKeywords fails — an unstated list asserts nothing about the default", cfg(null), false],
    ["KNOWN-GOOD: the narrowed list passes", cfg(["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING-CHANGE"]), true],
    ["KNOWN-GOOD: the spec's hyphenated synonym passes", cfg(["BREAKING-CHANGE"]), true],
    ["narrowing must not also delete breaking detection — no {breaking:true} rule fails", cfg(["BREAKING CHANGE"], [{ type: "fix", release: "patch" }]), false],
    ["a config with no commit-analyzer options fails rather than passing vacuously", { plugins: ["@semantic-release/commit-analyzer"] }, false],
  ]
  for (const [label, input, wantOk] of cfgCases) {
    const got = evaluateReleaseConfig(input).ok
    const ok = got === wantOk
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ok=${wantOk}, got ok=${got}`}`)
  }

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-release-health selftest green")
  process.exit(bad ? 1 : 0)
}

/**
 * Assert the REAL `.releaserc.json`. Separate from --selftest because the selftest proves the logic
 * and this proves the repo — a green selftest beside a bad config is exactly the split this repo
 * keeps re-finding, and it needs no network, so unlike the live path it can sit in `npm run check`.
 */
function checkConfig() {
  let config
  try {
    config = JSON.parse(readFileSync(".releaserc.json", "utf8"))
  } catch (e) {
    console.error("✗ release config: could not read/parse .releaserc.json — the check did not run, so it is not green.")
    console.error(`   ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`)
    process.exit(1)
  }
  const { ok, problems } = evaluateReleaseConfig(config)
  if (!ok) {
    console.error("✗ release config: semantic-release can promote ordinary prose to a MAJOR bump.")
    for (const p of problems) console.error(`   • ${p}`)
    process.exit(1)
  }
  console.log("✅ release config: note keywords are phrases; breaking detection is still wired")
  process.exit(0)
}

if (process.argv.includes("--selftest")) selftest()
if (process.argv.includes("--config")) checkConfig()

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
