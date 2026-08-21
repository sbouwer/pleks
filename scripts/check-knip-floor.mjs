#!/usr/bin/env node
/**
 * scripts/check-knip-floor.mjs — prove knip's green is a RESULT, not a collapsed analysis
 *
 * Auth:   none — local/CI script
 * Data:   knip.jsonc, and two `npx knip` runs (configured, and with the `tags` key removed)
 * Notes:  A knip run that analyses ZERO files reports zero findings and exits 0, which is
 *         indistinguishable at the gate from a clean tree. `.claude/rules/lint-rules.md` states the
 *         rule this implements — "every enumeration test asserts NON-EMPTY, as its own case" — and
 *         knip entered `npm run check` on 2026-08-21 with exactly that hole.
 *
 *         THE FLOOR IS A PARITY, NOT A MAGIC NUMBER. Every deliberate keep carries an
 *         `@knipignore` tag at its declaration; removing the `tags` key from the config un-silences
 *         precisely those. So the count of tags ON DISK must equal the count of findings WITHOUT
 *         the key. A hardcoded floor would rot the first time someone legitimately wires one up;
 *         this self-adjusts, and still fails loudly if the analysis stops seeing the tree (both
 *         numbers would not go to zero together — the disk count is a grep, not a knip run).
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

/** Strip `//` comments from JSONC. Deliberately line-based: knip.jsonc has no block comments. */
export function parseJsonc(text) {
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"))
}

/** Sum the counts in knip's `Unused exports (N)` / `Unused exported types (N)` headings. */
export function countFindings(stdout) {
  let total = 0
  for (const line of stdout.split("\n")) {
    const m = /^(Unused files|Unused dependencies|Unused devDependencies|Unused exports|Unused exported types|Duplicate exports) \((\d+)\)/.exec(line.trim())
    if (m) total += Number(m[2])
  }
  return total
}

/**
 * The assertion itself, pure so both directions are testable without running knip.
 * Returns a list of failure strings; empty means pass.
 */
export function evaluate({ configured, untagged, tagsOnDisk }) {
  const fails = []
  if (configured !== 0) {
    fails.push(`knip reports ${configured} unclassified finding(s). Every keep needs an @knipignore reason at its site, or an entry in knip.jsonc.`)
  }
  if (untagged === 0) {
    fails.push("THE ANALYSIS COLLAPSED: removing the `tags` key changed nothing, so knip is not seeing the tree. A green gate here would be meaningless.")
  }
  if (untagged !== tagsOnDisk) {
    // Name only what was OBSERVED, then offer the causes as candidates. The two directions have
    // different explanations and a message that asserts one of them is wrong half the time — the
    // failure mode this repo keeps re-finding in its own diagnostics (test/db/global-setup.ts).
    const more = untagged > tagsOnDisk
    fails.push(
      `parity broken: ${tagsOnDisk} @knipignore tag(s) on disk vs ${untagged} finding(s) with the tags key removed. ` +
      (more
        ? "MORE findings than tags — most likely a new untagged export (see above); could also be a tag knip does not associate with any declaration."
        : "FEWER findings than tags — a tag is on something knip never reports: wrong symbol name, a type covered by ignoreExportsUsedInFile, or a site already inside an ignored path."),
    )
  }
  return fails
}

function runKnip(configPath) {
  try {
    return execFileSync("npx", ["knip", "--no-progress", ...(configPath ? ["--config", configPath] : [])], {
      encoding: "utf8", stdio: "pipe", shell: true,
    })
  } catch (e) {
    return String(e.stdout ?? "") // knip exits non-zero when it finds issues
  }
}

function countTagsOnDisk() {
  // git-tracked source only: an untracked scratch file must not move the floor.
  const files = execFileSync("git", ["ls-files", "-z", "*.ts", "*.tsx"], { encoding: "utf8" })
    .split("\0").filter(Boolean)
  let n = 0
  for (const f of files) {
    const body = readFileSync(f, "utf8")
    n += (body.match(/@knipignore\b/g) ?? []).length
  }
  return n
}

function selftest() {
  const cases = [
    ["clean tree passes", { configured: 0, untagged: 40, tagsOnDisk: 40 }, 0],
    ["an unclassified finding FAILS", { configured: 3, untagged: 40, tagsOnDisk: 40 }, 1],
    ["A COLLAPSED ANALYSIS FAILS — the case this script exists for", { configured: 0, untagged: 0, tagsOnDisk: 40 }, 2],
    ["a tag on something knip never reports FAILS", { configured: 0, untagged: 39, tagsOnDisk: 40 }, 1],
    ["KNOWN-GOOD: the counts moving together still passes", { configured: 0, untagged: 12, tagsOnDisk: 12 }, 0],
  ]
  let bad = 0
  for (const [label, input, expected] of cases) {
    const got = evaluate(input).length
    const ok = got === expected
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — expected ${expected} failure(s), got ${got}`}`)
  }
  // The parsers, both directions.
  const parsed = countFindings("Unused files (4)\nnoise\nUnused exports (36)\n")
  if (parsed !== 40) { console.log(`  ✗ countFindings summed ${parsed}, expected 40`); bad++ }
  else console.log("  ✓ countFindings sums every category heading, not just the first")
  const empty = countFindings("Configuration hints (2)\ntypes/**/*.ts  no matches\n")
  if (empty !== 0) { console.log(`  ✗ configuration hints counted as findings (${empty})`); bad++ }
  else console.log("  ✓ KNOWN-GOOD: configuration hints are not findings")

  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : "\n✅ check-knip-floor selftest green")
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const cfg = parseJsonc(readFileSync("knip.jsonc", "utf8"))
delete cfg.tags
const tmp = join(mkdtempSync(join(tmpdir(), "knip-floor-")), "knip-notags.json")
writeFileSync(tmp, JSON.stringify(cfg, null, 2))

const configured = countFindings(runKnip(null))
const untagged = countFindings(runKnip(tmp))
const tagsOnDisk = countTagsOnDisk()

const fails = evaluate({ configured, untagged, tagsOnDisk })
if (fails.length) {
  console.error("✗ knip floor:")
  for (const f of fails) console.error(`   ${f}`)
  process.exit(1)
}
console.log(`✅ knip: 0 unclassified · ${tagsOnDisk} deliberate keeps, each tagged with its reason · analysis verified live`)
