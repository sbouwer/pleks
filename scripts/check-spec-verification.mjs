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
 *           3  UNRULED   fresh, but refuted / not-found / undecidable rows carry no ruling
 *           4  USAGE     bad invocation, unreadable file
 *           5  MISCITED  a ruling cites an M-entry that does not exist, or an M-entry names this
 *                        spec as its covering spec and no row cites it back
 *
 *         `--selftest` probes all of these BOTH directions on temporary fixtures.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"

export const EXIT = { FRESH: 0, STALE: 1, ABSENT: 2, UNRULED: 3, USAGE: 4, MISCITED: 5 }

/**
 * Results a row may carry. `confirmed` needs no ruling; the other three do.
 *
 * `undecidable` exists because `not-found` was making a determination it could not support.
 * A citation into `brief/` — a OneDrive symlink outside version control — cannot be classified
 * as rot (true when written, decayed since) or as fabrication (wrong at authoring), because there
 * is no history to date it against. Every CODE citation in the first seven-spec pass was
 * classifiable on exactly that basis; the `brief/`-internal ones were not, and recording them
 * `not-found` put an unverifiable claim under an anchor that made it look checked.
 *
 * Use it for a claim whose truth cannot be established BY ANY READ — not for one that is merely
 * hard, and not as a hiding place for a claim you did not chase. If a longer search would settle
 * it, it is not undecidable.
 */
const NEEDS_RULING = new Set(["refuted", "not-found", "undecidable"])
const RESULTS = new Set(["confirmed", "refuted", "not-found", "undecidable"])

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
  const unclassifiable = []
  for (const line of body.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("|")) continue
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|")
    if (cells.length < 5) continue
    // A CLAIM row is identified by its leading `#` cell being a bare integer. Header rows carry
    // `#`, separator rows carry `---`, and a table that isn't ours carries something else — those
    // are skipped. Everything else IS a claim row and must classify.
    if (!/^\d+$/.test(cells[0].trim())) continue
    const result = cells[cells.length - 2].trim().toLowerCase().replace(/`/g, "")
    if (!RESULTS.has(result)) {
      unclassifiable.push(cells[0].trim())
      continue
    }
    rows.push({ result, ruling: cells[cells.length - 1], claim: cells[1]?.trim() ?? "" })
  }
  // A claim row the parser cannot classify is a HARD failure, never a silent skip. Dropping it
  // fails toward false proof: the first real multi-spec run stamped seven specs whose refuted rows
  // carried an explanatory clause in the Result cell ("refuted — actual set is …"), and the
  // instrument reported one of them FRESH, "15 claims — 15 confirmed", on a table of 20 rows
  // holding 3 refutations. The Result cell is a TOKEN; explanation belongs in the Claim cell or
  // in prose beneath the table.
  if (unclassifiable.length > 0)
    return {
      malformed:
        `${unclassifiable.length} claim row(s) carry a Result cell that is not exactly ` +
        `confirmed / refuted / not-found — row(s) ${unclassifiable.join(", ")}. ` +
        `Put the bare token in Result and the explanation elsewhere.`,
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

/**
 * Both directions of the row↔register correspondence.
 *
 * Filing a gap and marking the row are TWO acts, and doing one leaves the other artefact lying.
 * The 25A pass did exactly that: M-107 was written into the register and its row's Ruling cell
 * stayed `—`, so the block reported UNRULED over a gap that was already filed. Harmless in that
 * direction — it overstates the outstanding work. The INVERSE is not harmless: a row reading
 * `gap-filed:M-113` over an M-113 that was never written is a fabricated citation inside the very
 * instrument built to catch fabricated citations, and it reads as closed.
 *
 * Direction A  a Ruling citing `M-NNN` requires a `### M-NNN` heading in the register.
 * Direction B  a register entry whose `Covering spec:` names THIS spec requires a row citing it.
 *
 * An unreadable register is a FINDING, never a skip — "the register could not be read" must not
 * resolve to "the citations are fine", which is the vacuous-pass shape probed for across this repo.
 */
export function citationFindings(rows, specPath, registerText) {
  if (registerText === null) return ["the M-register could not be read, so no citation could be checked"]

  const entries = new Map()
  let current = null
  for (const line of registerText.split("\n")) {
    const heading = /^#{2,4}\s+(M-\d+[a-z]?)\b/.exec(line)
    if (heading) {
      current = heading[1]
      if (!entries.has(current)) entries.set(current, null)
      continue
    }
    // Greedy `(\S.*)` + trim(), NOT a lazy `(.+?)\s*$` — the lazy form backtracks super-linearly
    // on a long line, which sonarjs/super-linear-regex caught on this script's first commit.
    const covering = /^\s*-\s+\*\*Covering spec:\*\*\s*(\S.*)$/.exec(line)
    if (covering && current) entries.set(current, covering[1].trim())
  }

  const cited = new Set()
  for (const r of rows) for (const m of r.ruling.matchAll(/\bM-\d+[a-z]?\b/g)) cited.add(m[0])

  const findings = []
  for (const id of [...cited].sort())
    if (!entries.has(id)) findings.push(`a ruling cites ${id}, which has no entry in the register`)

  // The spec's own identity as the register spells it — `ADDENDUM_25A_COMPANY_CONTACTS §7` must
  // match a path ending `ADDENDUM_25A_COMPANY_CONTACTS.md`. Compared on the stem so a section
  // suffix, a `.md` and a directory prefix all fall away.
  const stem = specPath.replace(/\\/g, "/").split("/").pop().replace(/\.md$/i, "").toLowerCase()
  for (const [id, covering] of entries) {
    if (!covering || covering.toUpperCase() === "NEW") continue
    const coveringStem = covering.split(/\s+/)[0].replace(/\.md$/i, "").toLowerCase()
    if (coveringStem !== stem) continue
    if (!cited.has(id))
      findings.push(`${id} names this spec as its covering spec, but no row's ruling cites it back`)
  }
  return findings
}

const readRegister = (cwd) => {
  try {
    return readFileSync(join(cwd, "docs", "MECHANISABLE.md"), "utf8")
  } catch {
    return null
  }
}

export function evaluate(text, cwd, specPath = "") {
  const parsed = parseVerificationBlock(text)
  if (parsed === null) return { code: EXIT.ABSENT, message: "UNVERIFIED — no SPEC-VERIFIED block" }
  if (parsed.malformed) return { code: EXIT.ABSENT, message: `UNVERIFIED — ${parsed.malformed}` }

  const anc = ancestryOf(parsed.sha, cwd)
  if (!anc.ok) return { code: EXIT.STALE, message: `STALE — ${anc.why}`, ...parsed }

  const unruled = parsed.rows.filter((r) => NEEDS_RULING.has(r.result) && !isRuled(r.ruling))
  const counts = parsed.rows.reduce((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {})
  const tally = `${parsed.rows.length} claims — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`

  // Citation integrity PREEMPTS the unruled count, because it is a defect in the block itself
  // rather than work not yet done, and because it names the specific row to fix. The tally rides
  // along so the unruled figure is not lost while the miscite is being corrected.
  const miscited = citationFindings(parsed.rows, specPath, readRegister(cwd))
  if (miscited.length > 0) {
    return {
      code: EXIT.MISCITED,
      message: `MISCITED — ${tally}; ${miscited.map((f) => `\n  · ${f}`).join("")}`,
      miscited,
      ...parsed,
    }
  }

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
    // The regression this check exists for. A refuted row that explains itself IN the Result cell
    // used to be dropped on the floor, so a spec with three refutations reported FRESH and
    // "15 claims — 15 confirmed". Found by the first seven-spec run, not by a probe — which is the
    // point of writing this one down.
    ["absent: a claim row whose Result cell is prose, not a token", block(head, "| 1 | x | `a.ts` | confirmed | — |\n| 2 | y | `b.ts` | refuted — actual set is wider | — |"), EXIT.ABSENT],
    // The pass direction of that same rule: a row that is NOT a claim (no integer in `#`) is still
    // ignored rather than failing the block, so a notes row under the table costs nothing.
    ["fresh: a stray non-claim table row is ignored, not failed", block(head, "| 1 | x | `a.ts` | confirmed | — |\n| n/a | note | — | see above | — |"), EXIT.FRESH],
    // `undecidable` — a claim no read can settle. A `brief/`-internal citation is the founding case:
    // that tree is a OneDrive symlink outside version control, so rot and fabrication are
    // indistinguishable there. It NEEDS a ruling like the other two.
    ["unruled: an undecidable row with an em-dash", block(head, "| 1 | x | `brief/legal/X.md` | undecidable | — |"), EXIT.UNRULED],
    ["fresh: an undecidable row that CARRIES a ruling", block(head, "| 1 | x | `brief/legal/X.md` | undecidable | intent-not-observation |"), EXIT.FRESH],
    // …and it is a TOKEN like the rest: the near-miss spelling must not be quietly accepted.
    ["absent: `undecideable` is not the token", block(head, "| 1 | x | `a.ts` | undecideable | — |"), EXIT.ABSENT],
    // MISCITED end-to-end, through evaluate against the REAL register: M-106 exists, M-99999 does not.
    ["fresh: a ruling citing a real register entry passes", block(head, "| 1 | x | `a.ts` | refuted | gap-filed:M-106 |"), EXIT.FRESH],
    ["miscited: a ruling citing an M-entry that does not exist", block(head, "| 1 | x | `a.ts` | refuted | gap-filed:M-99999 |"), EXIT.MISCITED],
  ]

  // Citation correspondence, probed HERMETICALLY against a fixture register — the evaluate-level
  // probes above ride on the live one, which proves the wiring but would drift with the register.
  const reg = [
    "### M-500 — a thing",
    "- **Covering spec:** ADDENDUM_TEST_SPEC §4",
    "### M-501 — another thing",
    "- **Covering spec:** NEW",
    "### M-502 — a third",
    "- **Covering spec:** ADDENDUM_OTHER_SPEC",
  ].join("\n")
  const row = (ruling) => [{ result: "refuted", ruling, claim: "x" }]
  const P = "brief/build/_ADDENDUM/ADDENDUM_TEST_SPEC.md"
  const cite = [
    ["cite: KNOWN-GOOD — a ruling citing an existing entry, cited back", citationFindings(row("gap-filed:M-500"), P, reg), 0],
    // Direction A ISOLATED — M-500 is cited so direction B is satisfied, leaving only the bad cite.
    ["cite: A RULING CITING A NONEXISTENT ENTRY FAILS — fabrication inside the anti-fabrication tool", citationFindings(row("gap-filed:M-500 and M-999"), P, reg), 1],
    ["cite: AN ENTRY NAMING THIS SPEC WITH NO ROW CITING BACK FAILS — the 25A shape, M-107 filed and the row left `—`", citationFindings(row("spec-corrected"), P, reg), 1],
    ["cite: KNOWN-GOOD — `Covering spec: NEW` binds to no spec and is never demanded", citationFindings(row("gap-filed:M-500"), "ADDENDUM_TEST_SPEC.md", reg), 0],
    ["cite: KNOWN-GOOD — an entry covering ANOTHER spec is not this spec's business", citationFindings(row("gap-filed:M-500"), P, reg), 0],
    ["cite: both directions are reported together, not just the first", citationFindings(row("gap-filed:M-999"), "x/ADDENDUM_OTHER_SPEC.md", reg), 2],
    ["cite: AN UNREADABLE REGISTER IS A FINDING, never a silent pass", citationFindings(row("gap-filed:M-500"), P, null), 1],
    ["cite: a section suffix in `Covering spec` does not defeat the match", citationFindings(row("x"), P, reg), 1],
    // mention-fixture: this script SEARCHES text for `M-NNN`, so it owns the mention problem in its
    // own vocabulary — an M-number written in prose must not be mistaken for a declaration or a
    // citation. Both directions of the parser have that exposure and both are pinned here.
    [
      "mention-fixture: an M-number in a register entry's BODY PROSE does not declare an entry — only a heading that opens with one",
      citationFindings(
        row("gap-filed:M-500"),
        P,
        "### M-500 — a thing\n- **Covering spec:** ADDENDUM_TEST_SPEC\n- see also M-777, which is only mentioned here\n",
      ),
      0,
    ],
    [
      "mention-fixture: an M-number in the CLAIM cell is not a citation — only the Ruling cell cites",
      citationFindings(
        [{ result: "refuted", ruling: "spec-corrected", claim: "the header cites M-999 as its basis" }],
        "x/ADDENDUM_UNCOVERED.md",
        "### M-500 — a thing\n- **Covering spec:** ADDENDUM_OTHER_SPEC\n",
      ),
      0,
    ],
  ]

  const names = Object.fromEntries(Object.entries(EXIT).map(([k, v]) => [v, k]))
  let failed = 0
  for (const [name, text, want] of cases) {
    const got = evaluate(text, cwd).code
    const pass = got === want
    if (!pass) failed++
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name} — want ${names[want]}, got ${names[got]}`)
  }

  for (const [name, got, want] of cite) {
    const pass = got.length === want
    if (!pass) failed++
    console.log(`  ${pass ? "ok  " : "FAIL"}  ${name} — want ${want} finding(s), got ${got.length}`)
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
  const r = evaluate(text, cwd, path)
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
