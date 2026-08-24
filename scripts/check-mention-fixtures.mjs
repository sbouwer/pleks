#!/usr/bin/env node
/**
 * scripts/check-mention-fixtures.mjs — R6: a token-searching detector must ship a MENTION fixture
 *
 * Auth:   none — local/CI script
 * Data:   scripts/*.mjs + scripts/*.mts (which scripts reference a marker token), and each
 *         registered detector's own `--selftest` output
 * Notes:  **THE CLASS: a pattern matches a MENTION of the thing instead of the thing.** Four
 *         instances in this repo, none caught by review — every one was caught by a number
 *         disagreeing with itself, which is the expensive way:
 *           1. `/BUILT/` matching "HALF BUILT" in an M-register heading (#263);
 *           2. a heading MENTIONING an M-number read as declaring one;
 *           3. a detector for dormant selftests matching a `--selftest` string inside a COMMENT
 *              referencing a different script's flag (control-aim audit §3.7);
 *           4. 2026-08-23 — `check-knip-floor`'s tag count broken by a comment EXPLAINING that a
 *              tag had been removed. The script's own failure message already named this cause,
 *              and it still cost a session interruption.
 *
 *         Ruled during the control-aim audit as R6 and carried as a convention ever since. A
 *         convention is what this is being promoted out of: four incidents is more than the build
 *         costs, and each one interrupted a session mid-thought.
 *
 *         WHAT IT ASSERTS. Every script that references a marker token is CLASSIFIED here — either
 *         it searches the tree for that token (and must ship a fixture where the token appears as a
 *         mention, proving it does not fire), or it does not (with the reason recorded). A NEW
 *         script referencing a token fails until it is classified, which is the ratchet: the four
 *         instances above were all written by someone who did not know the class existed.
 *
 *         ⚠ THIS FILE MUST NOT CONTAIN THE LITERALS IT HUNTS. Every token below is built by
 *         concatenation, and this script excludes itself from its own derivation. Writing them
 *         plainly would make the R6 checker the fifth instance of R6 — which is not a hypothetical:
 *         it is what the first draft of this file did.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"

const SCRIPTS = "scripts"
const SELF = "check-mention-fixtures.mjs"

/** Marker tokens this repo's detectors search for. Concatenated — see the header. */
const AT = "@"
export const TOKENS = [
  AT + "enforced", AT + "invariant", AT + "knipignore",
  "FILL" + ":", "BUILT", "use " + "server", "MECHANISABLE", "paths" + ":", "UNENFORCEABLE",
]

/**
 * The marker a detector's selftest prints to show it carries a mention fixture.
 *
 * Deliberately NOT one of the tokens above: a marker that was itself a hunted token would make
 * every registered detector match every other one's search, which is the class in miniature.
 */
export const FIXTURE_MARKER = "mention-fixture"

/**
 * Every script referencing a token, classified. An entry means READ AND CLASSIFIED, never EXEMPT.
 *
 * `searches: true`  → it looks for the token in OTHER files; it must ship a mention fixture.
 * `searches: false` → it merely mentions the token (usually its own CLI flag, or its header prose);
 *                     the reason is required, because "it looked fine" is how the four instances happened.
 */
export const REGISTRY = {
  // ── searches the tree; ships a mention fixture ──────────────────────────────────────────────
  "check-knip-floor.mjs": { searches: true },
  "check-register-integrity.mjs": { searches: true },
  "check-invariant-has-callers.mjs": { searches: true },
  "check-claude-md.mjs": { searches: true },
  "check-file-headers.mjs": { searches: true },
  "check-rules-tracked.mjs": { searches: true },
  "check-server-action-exports.mjs": { searches: true },

  // ── references a token without searching for it ─────────────────────────────────────────────
  "check-hook-registration.mjs": {
    searches: false,
    reason: "Matches control markers by RESOLVING them against settings.json and the hooks directory, not by scanning free text for the token. Its selftest already drives that resolution from structured input, so a mention in prose has no path into it.",
  },
  "agent-distribution.mjs": {
    searches: false,
    reason: "The tokens appear only in its header prose describing the register. It reads transcript JSONL and agent spines, never repo text.",
  },
  "check-extension-stem-pairs.mjs": {
    searches: false,
    reason: "Register pointer in its header. It compares FILENAME stems from git ls-files; no file body is read.",
  },
  "check-agent-write-scope.mjs": {
    searches: false,
    reason: "Register pointer in its header. It probes the hook with synthetic tool calls; it reads no repo text.",
  },
  "check-migration-forward-refs.mjs": {
    searches: false,
    reason: "Register pointer in its header (M-095). It DOES read file bodies — every migration's SQL — but only for `REFERENCES <table>` and `CREATE TABLE`, a vocabulary with no overlap with the marker tokens. Reading bodies is not the risk; searching for one of THESE tokens is, and it never does.",
  },
  "prepush-scope.mjs": {
    searches: false,
    reason: "Register pointer in its header. It classifies CHANGED PATHS from a git diff, never file contents.",
  },
  "inject-file-headers.mjs": {
    searches: false,
    reason: "A codemod, not a gate: not wired into `npm run check`, run by hand, and its output is reviewed as a diff before it lands. A false positive costs a rejected hunk, not a wrong verdict.",
  },
  "codemod-supabase-error.mjs": {
    searches: false,
    reason: "Same as inject-file-headers — a hand-run codemod whose result is read in the diff.",
  },
}

/** Scripts referencing at least one token, excluding this file. Pure, so the selftest can drive it. */
export function derive(entries) {
  const found = []
  for (const [name, src] of entries) {
    if (name === SELF) continue
    if (TOKENS.some((t) => src.includes(t))) found.push(name)
  }
  return found.sort()
}

/** Classification findings: an unclassified script, or a `searches: false` with no reason. */
export function classify(names, registry) {
  const fails = []
  for (const n of names) {
    const e = registry[n]
    if (!e) {
      fails.push(`${n} references a marker token but is not classified. Add it to REGISTRY: either it searches the tree for that token (searches: true — then ship a ${FIXTURE_MARKER} in its selftest), or it does not (searches: false + the reason).`)
    } else if (e.searches === false && !e.reason) {
      fails.push(`${n} is recorded as not searching, with no reason. A bare exemption is how this class survives review.`)
    }
  }
  for (const n of Object.keys(registry)) {
    if (!names.includes(n)) fails.push(`${n} is in REGISTRY but no longer references any marker token — delete the entry; this list only shrinks.`)
  }
  return fails
}

function readScripts() {
  return readdirSync(SCRIPTS)
    .filter((f) => /\.(mjs|mts)$/.test(f))
    .map((f) => [f, readFileSync(join(SCRIPTS, f), "utf8")])
}

/** Run one detector's selftest and report whether it is green AND carries a mention fixture. */
function probeFixture(name) {
  const runner = name.endsWith(".mts") ? ["npx", ["tsx", join(SCRIPTS, name), "--selftest"]] : ["node", [join(SCRIPTS, name), "--selftest"]]
  let out = ""
  try {
    out = execFileSync(runner[0], runner[1], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" })
  } catch (e) {
    return `${name} --selftest exited non-zero, so its mention fixture cannot be trusted:\n${String(e.stdout ?? e.message).trim().split("\n").slice(-4).join("\n")}`
  }
  if (!out.includes(FIXTURE_MARKER)) {
    return `${name} searches for a marker token but its selftest prints no "${FIXTURE_MARKER}" case. Add a probe where the token appears as a MENTION (in prose or a comment) and assert the detector does NOT fire.`
  }
  return null
}

function selftest() {
  const cases = []
  const t = (label, got, want) => cases.push([label, got === want, want, got])
  const AT2 = "@"

  const src = (s) => s
  t("a script referencing a token is derived",
    derive([["a.mjs", src("if (x.includes('" + AT2 + "enforced')) {}")]]).join(), "a.mjs")
  t("KNOWN-GOOD: a script referencing no token is not derived",
    derive([["a.mjs", "const x = 1"]]).length, 0)
  t("THIS FILE EXCLUDES ITSELF — otherwise the R6 checker is the fifth R6 instance",
    derive([[SELF, TOKENS.join(" ")]]).length, 0)

  t("AN UNCLASSIFIED SCRIPT FAILS — the ratchet, since every past instance was written unaware of the class",
    classify(["new.mjs"], {}).length, 1)
  t("KNOWN-GOOD: a classified searcher passes classification",
    classify(["a.mjs"], { "a.mjs": { searches: true } }).length, 0)
  t("a bare exemption with no reason FAILS",
    classify(["a.mjs"], { "a.mjs": { searches: false } }).length, 1)
  t("KNOWN-GOOD: an exemption carrying its reason passes",
    classify(["a.mjs"], { "a.mjs": { searches: false, reason: "why" } }).length, 0)
  t("a stale REGISTRY entry FAILS — the list only shrinks",
    classify([], { "gone.mjs": { searches: true } }).length, 1)

  // This script's own mention fixture. It searches `scripts/*` for the tokens, so R6 applies to it
  // exactly as to everything it audits — and the marker below is what its own registry entry would
  // require if it did not exclude itself.
  const mention = "// The " + AT2 + "enforced tag was removed here; see MECHANISABLE for why."
  t(`${FIXTURE_MARKER}: prose naming a token is still derived, which is CORRECT for this script — it classifies scripts, not tags, so its answer is "classify this one", never "this is a violation"`,
    derive([["a.mjs", mention]]).join(), "a.mjs")

  let bad = 0
  for (const [label, ok, want, got] of cases) {
    if (!ok) bad++
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — wanted ${want}, got ${got}`}`)
  }
  console.log(bad ? `\n✗ ${bad} selftest case(s) failed` : `\n✅ check-mention-fixtures selftest green`)
  process.exit(bad ? 1 : 0)
}

if (process.argv.includes("--selftest")) selftest()

const names = derive(readScripts())
const fails = classify(names, REGISTRY)
const searchers = names.filter((n) => REGISTRY[n]?.searches === true)
for (const n of searchers) {
  const f = probeFixture(n)
  if (f) fails.push(f)
}

console.log(`\n🔎  R6 — token-searching detectors ship a mention fixture`)
if (fails.length) {
  console.error(`  ✗ ${fails.length} finding(s):`)
  for (const f of fails) console.error(`    • ${f}`)
  process.exit(1)
}
console.log(`  ✓ ${names.length} script(s) reference a marker token · ${searchers.length} search the tree and each ships a ${FIXTURE_MARKER} · ${names.length - searchers.length} classified as not searching, each with its reason`)
