/**
 * scripts/check-rules-tracked.mjs — CI gate: every .claude/rules/*.md must be tracked by git
 *
 * `.gitignore` line 61 ignores `.claude/` wholesale, so every rules file is tracked only because
 * someone ran `git add -f`. That makes a rule's EXISTENCE ON OTHER MACHINES depend on an author
 * remembering an unusual flag — and a rule that is true on one machine and absent on another is the
 * same defect as a status line correct in INDEX and stale in the addendum: true somewhere, false
 * where it is read.
 *
 * These files carry the same authority as CLAUDE.md (see its PATH-SCOPED RULES section) and load
 * automatically by `paths:` frontmatter. A silently-untracked one is a rule that stops existing for
 * the next session, with nothing to notice it. This check closes that class rather than relying on
 * the next author catching it.
 *
 * Fails on:
 *   (a) a rules file on disk that git does not track   — the force-add was forgotten
 *   (b) a rules file git tracks that is gone from disk — deleted without `git rm`
 *
 * Also verifies each file carries `paths:` frontmatter, since a rule with no paths never loads and
 * is invisible in a subtler way — present in the repo, dead in every session.
 *
 * Source: ADDENDUM_62F §15.5 (CD, 2026-08-16).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const DIR = ".claude/rules"

if (!existsSync(DIR)) {
  console.log(`🔎  Rules tracking — ${DIR} absent, nothing to check`)
  process.exit(0)
}

const onDisk = readdirSync(DIR).filter(f => f.endsWith(".md")).sort()

// -z + split("\0") so a path with a space or a non-ASCII character can't be mis-parsed into a
// phantom "untracked" entry — the failure mode would be a red CI with nothing actually wrong.
const tracked = execFileSync("git", ["ls-files", "-z", "--", `${DIR}/*.md`], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .map(p => p.slice(DIR.length + 1))
  .sort()

const untracked = onDisk.filter(f => !tracked.includes(f))
const ghosts = tracked.filter(f => !onDisk.includes(f))
const noPaths = onDisk.filter(f => {
  const head = readFileSync(`${DIR}/${f}`, "utf8").slice(0, 400)
  return !/^---[\s\S]*?\bpaths:/m.test(head)
})

console.log("🔎  Rules tracking")

if (!untracked.length && !ghosts.length && !noPaths.length) {
  console.log(`  ✓ all ${onDisk.length} rules files tracked and carry paths: frontmatter`)
  process.exit(0)
}

for (const f of untracked) {
  console.error(`  ✗ ${DIR}/${f} — ON DISK BUT UNTRACKED.`)
  console.error(`      .claude/ is gitignored, so this needs:  git add -f ${DIR}/${f}`)
  console.error(`      Until then this rule does not exist on any other machine.`)
}
for (const f of ghosts) {
  console.error(`  ✗ ${DIR}/${f} — TRACKED BUT MISSING FROM DISK. Deleted without \`git rm\`?`)
}
for (const f of noPaths) {
  console.error(`  ✗ ${DIR}/${f} — no \`paths:\` frontmatter, so it never auto-loads.`)
}

process.exit(1)
