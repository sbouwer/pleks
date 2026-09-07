#!/usr/bin/env node
/**
 * scripts/check-spec-verification.mjs — is this spec's verification block present, and still fresh?
 *
 * Auth:   none — reads a file and asks git about ancestry. No network, no database.
 * Data:   the spec path given on argv (typically under `brief/`, which is a OneDrive symlink and
 *         NOT version-controlled) + `git merge-base --is-ancestor` against this clone's HEAD.
 * Notes:  This is the ANCHOR half of the spec verifier. The other half — extracting the claims and
 *         reading the files behind them — is `.claude/commands/verify-spec.md`, a brief for the
 *         `grounder` agent. This script performs NO verification of its own and cannot: it decides
 *         only whether a verification that someone else performed is still standing.
 *
 *         WHY AN ANCESTRY TEST AND NOT A TIMESTAMP. A verification is an observation, and
 *         observations rot (CLAUDE.md §8). The stamped SHA says which tree was read. If that commit
 *         is still an ancestor of HEAD, the tree has only moved FORWARD from what was read — the
 *         verification may be incomplete but it was never invalidated by a rewrite. If it is not an
 *         ancestor (a rebase, a different branch, a reset, an unpushed commit that no longer exists),
 *          the read cannot be located in this history at all and the honest answer is "re-run it",
 *         not "probably fine". A `utc=` timestamp is recorded for humans and is deliberately NOT
 *         used for the decision, because wall-clock time says nothing about what moved.
 *
 *         NOT A GATE, AND DELIBERATELY NOT IN `npm run check`. It takes one spec path, and the
 *         specs live outside version control, so there is no tree-wide invocation and nothing for CI
 *         to run. It is an instrument the build path calls on the spec it is about to build from —
 *         which means the discipline that CALLS it is rung-4 guidance, not enforcement. That gap is
 *         filed as M-106; do not read this script's existence as closing it.
 *
 *         EXIT CODES ARE THE INTERFACE — a caller branches on these, not on the prose:
 *           0  FRESH     block present, anchor is an ancestor of HEAD, no unruled refutations
 *           1  STALE     anchor is not an ancestor of HEAD (or names no commit in this clone)
 *           2  ABSENT    no verification block, or one that cannot be parsed
 *           3  UNRULED   fresh, but refuted / not-found rows carry no ruling
 *           4  USAGE     bad invocation, unreadable file
 *
 *         `--selftest` probes all of these BOTH directions on temporary fixtures.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const EXIT = { FRESH: 0, STALE: 1, ABSENT: 2, UNRULED: 3, USAGE: 4 }

/** Results a row may carry. `confirmed` needs no ruling; the other two do. */
const NEEDS_RULING = new Set(["refuted", "not-found"])
const RESULTS = new Set(["confirmed", "refuted", "not-found"])

/**
 * A ruling is present when the cell is anything other than an em-dash / hyphen / empty.
 * The VOCABULARY is not policed here on purpose — the three dispositions Stéan named
 * (correct the spec · keep the claim and file the gap · mark it intent, not observation)
 * are a judgement, and a script that rejected an unfamiliar wording would push the ruling
 * into whatever spelling the script happened to accept.
 */
const isRuled = (cell) => {
  const t = cell.trim()
  return t.length > 0 && t !== "—" && t !== "-" && t !== "–" && t !== "n/a"
}

/**
 * Pull the block out of a spec. Returns null when absent — an absent block and a malformed
 * one are the SAME answer to the caller ("nothing to trust here"), distinguished only in the
 * message, because both mean the build must not proceed on it.
 */
export function parseVerificationBlock(text) {
  const open = text.indexOf("<!-- SPEC-VERIFIED")
  if (open === -1) return null
  const close = text.indexOf("<!-- /SPEC-VERIFIED -->", open)
  if (close === -1) return { malformed: "opening marker with no `<!-- /SPEC-VERIFIED -->` close" }
  const body = text.slice(open, close)

  const sha = /anchor:[^\n]*?\bsha=([0-9a-fA-F]{7,40})\b/.exec(body)
  if (!sha) return { malformed: "no `anchor: … sha=<sha> …` line inside the block" }
  const utc = /anchor:[^\n]*?\butc=(\S+)/.exec(body)

  const rows = []
  for (const line of body.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("|")) continue
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|")
    if (cells.length < 5) continue
    const result = cells[cells.length - 2].trim().toLowerCase().replace(/`/g, "")
    if (!RESULTS.has(result)) continue // header row, separator row, or a table that isn't ours
    rows.push({ result, ruling: cells[cells.length - 1], claim: cells[1]?.trim() ?? "" })
  }
  if (rows.length === 0) return { malformed: "block parsed but contains no claim rows" }

  return { sha: sha[1], utc: utc ? utc[1] : null, rows }
}

/**
 * Ancestry against this clone's HEAD.
 *
 * A SHA this clone has never heard of is reported STALE rather than crashing: from the build
 * path's point of view "the verification names a commit I cannot locate" and "the verification
 * names a commit that is no longer in my history" are the same instruction — re-run it.
 */
function ancestryOf(sha, cwd) {
  try {
    execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" })
  } catch {
    return { ok: false, why: `commit ${sha} is not in this clone — rebased away, or verified elsewhere` }
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd, stdio: "ignore" })
    return { ok: true }
  } catch {
    return { ok: false, why: `commit ${sha} is not an ancestor of HEAD — the tree read is not this tree's past` }
  }
}

export function evaluate(text, cwd) {
  const parsed = parseVerificationBlock(text)
  if (parsed === null) return { code: EXIT.ABSENT, message: "UNVERIFIED — no SPEC-VERIFIED block" }
  if (parsed.malformed) return { code: EXIT.ABSENT, message: `UNVERIFIED — ${parsed.malformed}` }

  const anc = ancestryOf(parsed.sha, cwd)
  if (!anc.ok) return { code: EXIT.STALE, message: `STALE — ${anc.why}`, ...parsed }

  const unruled = parsed.rows.filter((r) => NEEDS_RULING.has(r.result) && !isRuled(r.ruling))
  const counts = parsed.rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {})
  const tally = `${parsed.rows.length} claims — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`

  if (unruled.length > 0) {
    return {
      code: EXIT.UNRULED,
      message: `UNRULED — ${tally}; ${unruled.length} awaiting a ruling`,
      unruled,
      ...parsed,
    }
  }
  return { code: EXIT.FRESH, message: `FRESH at ${parsed.sha} — ${tally}`, ...parsed }
}

/* ── probes ────────────────────────────────────────────────────────────────────────────────
 * Both directions on every code. The load-bearing ones are the PASSES: a checker that reports
 * everything is deleted within a week, so "a genuinely fresh, fully-ruled block returns 0" and
 * "a confirmed row needs no ruling" matter more than the failures they sit beside.
 */
function selftest() {
  const cwd = process.cwd()
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim()
  const parent = execFileSync("git", ["rev-parse", "HEAD~1"], { cwd, encoding: "utf8" }).trim()
  const orphan = execFileSync("git", ["commit-tree", `${head}^{tree}`, "-m", "spec-verify probe"], {
    cwd,
    encoding: "utf8",
  }).trim()

  const block = (sha, rows) => `
<!-- SPEC-VERIFIED v1 -->
anchor: sha=${sha} · utc=2026-09-07T00:00:00Z · verifier=grounder

| # | Claim | File read | Result | Ruling |
|---|---|---|---|---|
${rows}
<!-- /SPEC-VERIFIED -->
`
  const ok = (sha) => block(sha, "| 1 | x is y | `lib/a.ts` | confirmed | — |")
  const cases = [
    ["absent: no block at all", "# Spec\n\nSome prose.\n", EXIT.ABSENT],
    ["absent: opened, never closed", "<!-- SPEC-VERIFIED v1 -->\nanchor: sha=" + head + "\n", EXIT.ABSENT],
    ["absent: block with no anchor line", "<!-- SPEC-VERIFIED v1 -->\n| 1 | x | `a.ts` | confirmed | — |\n<!-- /SPEC-VERIFIED -->", EXIT.ABSENT],
    ["absent: anchor but no rows", block(head, "| # | h | h | h | h |"), EXIT.ABSENT],
    ["stale: sha unknown to this clone", ok("deadbee"), EXIT.STALE],
    // The case the whole anchor exists for, and the one an `existsInClone` check would MISS:
    // a real, readable commit object that is not in HEAD's history. A verification performed on a
    // branch that was later rebased away leaves exactly this — a SHA git can resolve and a tree
    // nobody can reach. `commit-tree` mints a parentless commit from HEAD's own tree, so the object
    // is genuinely present and genuinely unreachable, with no branch to create or clean up.
    ["stale: a REAL commit that is not an ancestor of HEAD", ok(orphan), EXIT.STALE],
    ["fresh: HEAD itself, all confirmed", ok(head), EXIT.FRESH],
    ["fresh: an ancestor of HEAD", ok(parent), EXIT.FRESH],
    ["fresh: confirmed row needs NO ruling", block(head, "| 1 | x | `a.ts` | confirmed | — |\n| 2 | y | `b.ts` | confirmed |  |"), EXIT.FRESH],
    ["unruled: a refuted row with an em-dash", block(head, "| 1 | x | `a.ts` | refuted | — |"), EXIT.UNRULED],
    ["unruled: a not-found row with an empty cell", block(head, "| 1 | x | `a.ts` | not-found |  |"), EXIT.UNRULED],
    ["fresh: refuted row that CARRIES a ruling", block(head, "| 1 | x | `a.ts` | refuted | gap-filed:M-106 |"), EXIT.FRESH],
    ["fresh: mixed, every refutation ruled", block(head, "| 1 | x | `a.ts` | confirmed | — |\n| 2 | y | `b.ts` | refuted | spec-corrected |\n| 3 | z | `c.ts` | not-found | intent-not-observation |"), EXIT.FRESH],
  ]

  const names = Object.fromEntries(Object.entries(EXIT).map(([k, v]) => [v, k]))
  let failed = 0
  for (const [name, text, want] of cases) {
    const got = evaluate(text, cwd).code
    const pass = got === want
    if (!pass) failed++
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name} — want ${names[want]}, got ${names[got]}`)
  }

  // One end-to-end run through argv + the filesystem, so the probes above cannot pass while the
  // actual entry point is broken.
  const dir = mkdtempSync(join(tmpdir(), "specverify-"))
  try {
    const p = join(dir, "SPEC.md")
    writeFileSync(p, ok(head))
    const code = runFile(p, cwd, true)
    const pass = code === EXIT.FRESH
    if (!pass) failed++
    console.log(`  ${pass ? "ok  " : "FAIL"}  end-to-end: a real file on disk — want FRESH, got ${names[code]}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  console.log(failed === 0 ? "\nselftest: all probes passed" : `\nselftest: ${failed} FAILED`)
  return failed === 0 ? 0 : 1
}

function runFile(path, cwd, quiet = false) {
  let text
  try {
    text = readFileSync(path, "utf8")
  } catch (e) {
    if (!quiet) console.error(`cannot read ${path}: ${e.message}`)
    return EXIT.USAGE
  }
  const r = evaluate(text, cwd)
  if (!quiet) {
    console.log(`${r.message}\n  spec: ${path}`)
    for (const row of r.unruled ?? []) console.log(`  awaiting ruling: [${row.result}] ${row.claim}`)
  }
  return r.code
}

const argv = process.argv.slice(2)
if (argv[0] === "--selftest") {
  process.exit(selftest())
} else if (argv.length !== 1 || argv[0].startsWith("--")) {
  console.error("usage: node scripts/check-spec-verification.mjs <spec-path> | --selftest")
  process.exit(EXIT.USAGE)
} else {
  process.exit(runFile(argv[0], process.cwd()))
}
