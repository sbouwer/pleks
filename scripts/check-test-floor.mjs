/**
 * scripts/check-test-floor.mjs — assert the unit suite COLLECTED a full-sized run
 *
 * Auth:   none — local/CI gate, runs in `npm run check` immediately after `vitest run`
 * Data:   node_modules/.vitest-count.json (written by vitest's json reporter in the same
 *         invocation) + scripts/test-floor.baseline.json (the ratcheting floor)
 * Notes:  A passing suite proves the tests that RAN passed. It proves nothing about how many ran.
 *
 *         The zero-collection case already fails loud — vitest exits non-zero when it collects
 *         nothing. The dangerous variant is PARTIAL collection: if a fault imports 200 of 1,320
 *         tests, those 200 pass, the suite is green, and nothing notices that 85% of the coverage
 *         silently did not run. This is the E10 family — a control running correctly against a
 *         smaller subject than intended — and the negative-space fixture applied to the runner:
 *         the known-good case must pass AT FULL SIZE, not merely pass.
 *
 *         This is NOT a guard against one intermittent. An undiagnosed worker-import fault was the
 *         occasion; the uncovered variant was the finding. Partial collection can no longer pass
 *         green from ANY cause — a bad glob, a config change, an exclude pattern that grows a
 *         directory, a refactor that quietly moves tests out of the matched tree.
 *
 *         The floor only RISES. That is the mirror of the allowlist rule (baselines only shrink):
 *         both mean an entry is a decision someone recorded, never a knob to turn until green.
 *         Lowering it to make a run pass deletes the finding. Raise with --ratchet, deliberately.
 *
 *         ONLY GIT-TRACKED TEST FILES COUNT (M-141). CI checks out the tracked tree, so a local run that
 *         collected an untracked file — a walker's `.handoff/<slug>/scratch` probe, a test not yet added —
 *         measured a suite CI will never see. A ratchet from that run set a floor CI could not meet
 *         (1757 locally vs 1752 in CI on #327, three scratch probes), and a check from it passed a
 *         floor CI would fail. `tracked()` discounts every untracked file from both counts, in both
 *         modes; vitest.config.ts also excludes `.handoff/` from the default run, and this is the
 *         half that holds for an untracked test anywhere else. Unable to ask git → FAIL, never "all
 *         tracked": that fallback is exactly the overcount this exists to remove.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, relative } from "node:path"
import { execFileSync } from "node:child_process"

const here = dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = join(here, "..", "node_modules", ".vitest-count.json")
const FLOOR_PATH = join(here, "test-floor.baseline.json")
const ROOT = join(here, "..")

/** Repo-relative, forward-slashed, lower-cased on Windows (vitest's drive letter and git's need not agree). */
const norm = (p) => {
  const r = relative(ROOT, p).replace(/\\/g, "/")
  return process.platform === "win32" ? r.toLowerCase() : r
}

/** The tracked set as a predicate over vitest's absolute `name`s; null when git cannot answer. */
function gitTracked() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    const set = new Set(out.split("\0").filter(Boolean).map((f) => norm(join(ROOT, f))))
    return (name) => set.has(norm(name))
  } catch {
    return null
  }
}

/**
 * Pure: the report as CI would see it — every untracked file removed from both counts.
 * Returns { report, untracked[] } or { error } when an untracked entry cannot be discounted.
 */
export function tracked(report, isTracked) {
  if (report === null || typeof report !== "object" || !Array.isArray(report.testResults)) return { report, untracked: [] }
  if (typeof isTracked !== "function") return { error: "cannot list git-tracked files — refusing to count untracked tests as CI's" }
  const untracked = report.testResults.filter((r) => !isTracked(r?.name ?? ""))
  let tests = report.numTotalTests
  for (const r of untracked) {
    if (!Array.isArray(r?.assertionResults)) return { error: `untracked ${r?.name} has no assertionResults — cannot discount it` }
    tests -= r.assertionResults.length
  }
  const kept = report.testResults.filter((r) => !untracked.includes(r))
  return { report: { ...report, numTotalTests: tests, testResults: kept }, untracked: untracked.map((r) => norm(r.name)) }
}

/**
 * Pure evaluator so --selftest can exercise every branch without touching disk.
 * Returns { ok, failures[], hint|null }.
 */
export function evaluate(report, floor) {
  const failures = []

  if (report === null || typeof report !== "object") {
    failures.push(
      "no vitest report — expected the json reporter to have written one in this same run. " +
        "A missing report is a FAILURE, never a skip: a check that passes when its input is absent " +
        "is the green-and-unfailable class this check exists to prevent.",
    )
    return { ok: false, failures, hint: null }
  }
  if (floor === null || typeof floor !== "object") {
    failures.push("no floor baseline — scripts/test-floor.baseline.json is missing or unparseable.")
    return { ok: false, failures, hint: null }
  }

  const tests = report.numTotalTests
  const files = Array.isArray(report.testResults) ? report.testResults.length : undefined

  if (typeof tests !== "number" || Number.isNaN(tests)) {
    failures.push("report has no numeric numTotalTests — shape changed, or the reporter did not run.")
    return { ok: false, failures, hint: null }
  }
  if (typeof files !== "number") {
    failures.push("report has no testResults array — shape changed, or the reporter did not run.")
    return { ok: false, failures, hint: null }
  }

  const minTests = floor.minTests
  const minFiles = floor.minFiles
  if (typeof minTests !== "number" || typeof minFiles !== "number") {
    failures.push("floor baseline has no numeric minTests/minFiles.")
    return { ok: false, failures, hint: null }
  }

  if (tests < minTests) {
    failures.push(
      `collected ${tests} tests, floor is ${minTests} — ${minTests - tests} tests did not run. ` +
        "The suite may be GREEN and still be this. Do not lower the floor to clear it; find what " +
        "stopped collecting.",
    )
  }
  if (files < minFiles) {
    failures.push(
      `collected ${files} test file${files === 1 ? "" : "s"}, floor is ${minFiles} — ` +
        `${minFiles - files} did not run.`,
    )
  }

  const hint =
    failures.length === 0 && (tests > minTests || files > minFiles)
      ? `floor can rise: ${minTests}→${tests} tests, ${minFiles}→${files} files ` +
        "(run `node scripts/check-test-floor.mjs --ratchet`)"
      : null

  return { ok: failures.length === 0, failures, hint }
}

function readJson(path) {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

// ── probes ───────────────────────────────────────────────────────────────────
// Both directions, per CLAUDE.md §4: a planted violation must FAIL and a known-good case must PASS.
// The known-good half is deliberately the larger one — it is the half that catches a check which
// has stopped being able to fail.

function selftest() {
  const floor = { minTests: 1320, minFiles: 121 }
  const rep = (t, f) => ({ numTotalTests: t, testResults: new Array(f).fill({}) })
  // `f` tracked files sharing `t` tests, plus optional [name, count] untracked extras.
  const named = (t, f, extra) => {
    const results = Array.from({ length: f }, (_, i) => ({ name: `/r/t${i}.test.ts`, assertionResults: [] }))
    let total = t
    if (extra) {
      results.push({ name: extra[0], assertionResults: new Array(extra[1]).fill({}) })
      total += extra[1]
    }
    return { numTotalTests: total, testResults: results }
  }
  let failed = 0

  const cases = [
    // known-good — these are the ones that catch a check that can no longer fail
    ["KNOWN-GOOD: exactly at the floor passes", () => evaluate(rep(1320, 121), floor).ok === true],
    ["KNOWN-GOOD: above the floor passes", () => evaluate(rep(1400, 130), floor).ok === true],
    [
      "KNOWN-GOOD: above the floor emits a ratchet hint rather than failing",
      () => evaluate(rep(1400, 130), floor).hint !== null,
    ],
    [
      "KNOWN-GOOD: exactly at the floor emits NO hint",
      () => evaluate(rep(1320, 121), floor).hint === null,
    ],
    // planted violations
    ["one test short FAILS", () => evaluate(rep(1319, 121), floor).ok === false],
    ["one FILE short FAILS even with the test count intact", () =>
      evaluate(rep(1320, 120), floor).ok === false],
    [
      "PARTIAL collection FAILS — the variant that would otherwise pass green",
      () => evaluate(rep(200, 20), floor).ok === false,
    ],
    ["zero collection FAILS", () => evaluate(rep(0, 0), floor).ok === false],
    // the check must not become green-and-unfailable itself
    ["a MISSING report FAILS rather than skipping", () => evaluate(null, floor).ok === false],
    ["a MISSING floor FAILS rather than skipping", () => evaluate(rep(1320, 121), null).ok === false],
    [
      "a report with no numTotalTests FAILS rather than reading it as zero-and-passing",
      () => evaluate({ testResults: [] }, floor).ok === false,
    ],
    [
      "a report with no testResults array FAILS",
      () => evaluate({ numTotalTests: 1320 }, floor).ok === false,
    ],
    [
      "a floor with non-numeric fields FAILS",
      () => evaluate(rep(1320, 121), { minTests: "1320", minFiles: 121 }).ok === false,
    ],
    [
      "the failure message names the shortfall, so it cannot be read as a flake",
      () => /did not run/.test(evaluate(rep(200, 20), floor).failures.join(" ")),
    ],
    // M-141 — untracked files are CI-invisible and never count
    [
      "PLANTED: an untracked scratch probe that alone lifts the run to the floor does NOT pass it",
      () => {
        const t = tracked(named(1318, 120, ["/r/.handoff/x/scratch/p.test.ts", 2]), (n) => !n.includes(".handoff"))
        return t.report.numTotalTests === 1318 && t.report.testResults.length === 120 && evaluate(t.report, floor).ok === false
      },
    ],
    [
      "KNOWN-GOOD: an all-tracked run is counted unchanged",
      () => {
        const r = named(1320, 121)
        const t = tracked(r, () => true)
        return t.untracked.length === 0 && t.report.numTotalTests === 1320 && evaluate(t.report, floor).ok === true
      },
    ],
    [
      "KNOWN-GOOD: a tracked run at the floor still passes with an untracked probe beside it",
      () => evaluate(tracked(named(1320, 121, ["/r/new.test.ts", 5]), (n) => n !== "/r/new.test.ts").report, floor).ok === true,
    ],
    [
      "git unable to answer FAILS rather than counting everything as tracked",
      () => typeof tracked(named(1320, 121), null).error === "string",
    ],
    [
      "an untracked entry with no assertionResults FAILS rather than being discounted as zero",
      () => typeof tracked({ numTotalTests: 5, testResults: [{ name: "/r/u.test.ts" }] }, () => false).error === "string",
    ],
    [
      "KNOWN-GOOD: the real tracked set contains this script and not a .handoff path",
      () => {
        const t = gitTracked()
        return t !== null && t(join(ROOT, "scripts", "check-test-floor.mjs")) && !t(join(ROOT, ".handoff", "x", "scratch", "p.test.ts"))
      },
    ],
  ]

  for (const [name, fn] of cases) {
    let pass = false
    try {
      pass = fn()
    } catch {
      pass = false
    }
    console.log(`  ${pass ? "✓" : "✗"} ${name}`)
    if (!pass) failed++
  }

  if (failed > 0) {
    console.error(`\n❌ ${failed} probe(s) failed`)
    process.exit(1)
  }
  console.log("\n✅ probes green — fires on partial collection, stays quiet at full size")
}

// ── main ─────────────────────────────────────────────────────────────────────

const arg = process.argv[2]

if (arg === "--selftest") {
  selftest()
} else if (arg === "--ratchet") {
  const report = readJson(REPORT_PATH)
  if (!report || typeof report.numTotalTests !== "number") {
    console.error("[test-floor] cannot ratchet — no usable vitest report. Run `npx vitest run` first.")
    process.exit(1)
  }
  // PRESERVE EVERY OTHER KEY, `_comment` above all. The ruling that permits a lowering at all
  // (CD, 2026-08-23) requires the entry to NAME the deleted control — so the record lives in this
  // file, and a ratchet that rewrote the object from scratch would erase it on the next raise.
  // The number would stay honest and the reason for the last drop would be gone, which is the half
  // that matters. Spread first so the two counts still win.
  const t = tracked(report, gitTracked())
  if (t.error) {
    console.error(`[test-floor] cannot ratchet — ${t.error}`)
    process.exit(1)
  }
  for (const u of t.untracked) console.log(`[test-floor] not counted (untracked, CI will not run it): ${u}`)
  const prev = readJson(FLOOR_PATH) ?? {}
  const next = { ...prev, minTests: t.report.numTotalTests, minFiles: t.report.testResults.length }
  writeFileSync(FLOOR_PATH, `${JSON.stringify(next, null, 2)}\n`)
  console.log(`[test-floor] floor raised to ${next.minTests} tests across ${next.minFiles} files`)
} else {
  const t = tracked(readJson(REPORT_PATH), gitTracked())
  if (t.error) {
    console.error(`[test-floor] FAILED — ${t.error}`)
    process.exit(1)
  }
  for (const u of t.untracked) console.log(`[test-floor] not counted (untracked, CI will not run it): ${u}`)
  const { ok, failures, hint } = evaluate(t.report, readJson(FLOOR_PATH))
  if (!ok) {
    console.error("[test-floor] FAILED — the suite did not run at full size:")
    for (const f of failures) console.error(`  ✗ ${f}`)
    process.exit(1)
  }
  const floor = readJson(FLOOR_PATH)
  console.log(`[test-floor] OK — ${floor.minTests}+ tests across ${floor.minFiles}+ files collected`)
  if (hint) console.log(`[test-floor] ${hint}`)
}
