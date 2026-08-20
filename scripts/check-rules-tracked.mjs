/**
 * scripts/check-rules-tracked.mjs — CI gate: every shared `.claude/` file must be tracked by git
 *
 * `.gitignore` ignores `.claude/` and re-includes the shared subtrees by negation, so a NEW file in
 * one of them is tracked only if the author noticed. That makes a control's EXISTENCE ON OTHER
 * MACHINES depend on someone remembering — and a control that is true on one machine and absent on
 * another is the same defect as a status line correct in INDEX and stale in the addendum: true
 * somewhere, false where it is read.
 *
 * ⚠ THIS CHECK COVERED ONLY `.claude/rules` AND ITS OWN REASONING SAID WHY THAT WAS TOO NARROW.
 * On 2026-08-19 the crawler layer was committed and only one of its three files landed:
 * `scripts/crawl.mjs` was outside `.claude/` so `git add -A` took it, while
 * `.claude/crawlers/INTENTIONAL.md` and `.claude/agents/crawler-doctrine.md` fell into the ignore
 * and were silently dropped. The commit message asserted all three. INTENTIONAL.md is a BUILD
 * BLOCKER — `scripts/crawl.mjs` refuses to run without it — so the crawler could not have run on
 * any other clone, and nothing anywhere would have said why. The check that would have caught it
 * existed, and was pointed at one directory out of five.
 *
 * Fails on:
 *   (a) a file on disk in a shared subtree that git does not track — the add was forgotten
 *   (b) a file git tracks that is gone from disk                   — deleted without `git rm`
 *   (c) a rules file with no `paths:` frontmatter — it never auto-loads, so it is present in the
 *       repo and dead in every session. Rules only: agents and crawlers have no such frontmatter.
 *
 * `.claude/skills/` is deliberately NOT covered: it is a vendored pack that arrives and leaves as a
 * set, and asserting per-file tracking over someone else's directory is the kind of scope creep
 * that earns a check an allowlist.
 *
 * Source: ADDENDUM_62F §15.5 (CD, 2026-08-16); widened 2026-08-19 after the miss above.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

/** Shared subtrees: everything here is meant to reach every clone. */
const DIRS = [
  { dir: ".claude/rules", ext: ".md", needsPaths: true },
  { dir: ".claude/agents", ext: ".md", needsPaths: false },
  { dir: ".claude/commands", ext: ".md", needsPaths: false },
  { dir: ".claude/crawlers", ext: ".md", needsPaths: false },
  { dir: ".claude/hooks", ext: ".js", needsPaths: false },
]

/**
 * Single files that are shared but sit at the top of `.claude/`.
 *
 * These need naming individually because `.gitignore` ignores `.claude/*` and re-includes only the
 * listed subtrees — a new top-level file is invisible to `git add -A` unless someone remembers a
 * negation. That is exactly how two crawler files were "committed" in a message and not on disk.
 */
const FILES = [".claude/settings.json", ".claude/statusline.js"]

const walk = (dir, ext) => {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).replaceAll("\\", "/")
    if (e.isDirectory()) out.push(...walk(p, ext))
    else if (e.name.endsWith(ext)) out.push(p)
  }
  return out
}

const trackedIn = (pathspec) =>
  // -z + split("\0") so a path with a space or a non-ASCII character cannot be mis-parsed into a
  // phantom "untracked" entry — the failure mode would be a red CI with nothing actually wrong.
  execFileSync("git", ["ls-files", "-z", "--", pathspec], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((p) => p.replaceAll("\\", "/"))

const untracked = []
const ghosts = []
const noPaths = []
let counted = 0

for (const { dir, ext, needsPaths } of DIRS) {
  if (!existsSync(dir)) continue
  const onDisk = walk(dir, ext).sort()
  const tracked = trackedIn(`${dir}/**`).filter((p) => p.endsWith(ext)).sort()
  counted += onDisk.length

  for (const f of onDisk) if (!tracked.includes(f)) untracked.push(f)
  for (const f of tracked) if (!onDisk.includes(f)) ghosts.push(f)
  if (needsPaths) {
    for (const f of onDisk) {
      const head = readFileSync(f, "utf8").slice(0, 400)
      if (!/^---[\s\S]*?\bpaths:/m.test(head)) noPaths.push(f)
    }
  }
}

for (const f of FILES) {
  if (!existsSync(f)) continue
  counted++
  if (!trackedIn(f).length) untracked.push(f)
}

// The enumeration asserts itself (L-10): zero files found is not a pass, it is a decayed walk
// reporting a clean tree. The floor is a real figure, not `> 0`.
const FLOOR = 20
if (counted < FLOOR) {
  console.error(`\n❌ .claude tracking — only ${counted} shared file(s) discovered (floor ${FLOOR}).`)
  console.error(`   The walk is broken or the tree moved; a scan of nothing reports everything tracked.\n`)
  process.exit(1)
}

console.log("🔎  .claude tracking")

if (!untracked.length && !ghosts.length && !noPaths.length) {
  console.log(`  ✓ all ${counted} shared .claude files tracked; every rule carries paths: frontmatter`)
  process.exit(0)
}

for (const f of untracked) {
  console.error(`  ✗ ${f} — ON DISK BUT UNTRACKED.`)
  console.error(`      Until it is committed, this does not exist on any other machine.`)
}
for (const f of ghosts) console.error(`  ✗ ${f} — TRACKED BUT MISSING FROM DISK. Deleted without \`git rm\`?`)
for (const f of noPaths) console.error(`  ✗ ${f} — no \`paths:\` frontmatter, so it never auto-loads.`)

process.exit(1)
