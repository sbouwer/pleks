#!/usr/bin/env node
/**
 * scripts/check-bash-gate.mjs — probes for the Bash PreToolUse gate.
 *
 * `bash-gate.js` is the OLDER of the two hooks and the one CLAUDE.md leans on hardest — force-push,
 * hard reset, `rm -rf /`, the push approval gate — and it was the one with no probe suite. Its
 * younger sibling `mcp-ddl-gate.js` has had `check-mcp-ddl-gate.mjs` since the day it was written.
 * The asymmetry is the finding: the gate nobody probed is the gate everything relies on.
 *
 * Three directions, because two are not enough for a rule list that both denies and asks:
 *   DENY  — the command must be refused outright
 *   ASK   — the command must reach a human, not be silently allowed
 *   ALLOW — ordinary work must NOT be gated, or the profile stalls and the gate gets removed
 *
 * The third is the one that decides whether this gate survives contact with a real session, and it
 * is where a DENY pattern that is too broad shows up: `git revert -n` is `--no-commit`, not
 * `--no-verify`, and denying it would be a false positive in the expensive direction.
 *
 * Real subprocess, real stdin payload — the hook has no exported function, deliberately (L-06).
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const HOOK = ".claude/hooks/bash-gate.js"

if (!existsSync(HOOK)) {
  console.log(`❌ ${HOOK} is missing — the gate this probe exists to verify is not installed`)
  process.exit(1)
}

function decide(payload) {
  const r = spawnSync("node", [HOOK], { input: payload, encoding: "utf8" })
  if (r.status !== 0) return { decision: `hook exited ${r.status}`, reason: r.stderr.slice(0, 200) }
  try {
    const o = JSON.parse(r.stdout).hookSpecificOutput
    return { decision: o.permissionDecision, reason: o.permissionDecisionReason }
  } catch {
    return { decision: "unparseable hook output", reason: r.stdout.slice(0, 200) }
  }
}

const bash = (command) => JSON.stringify({ tool_name: "Bash", tool_input: { command } })

const CASES = [
  // ── DENY ────────────────────────────────────────────────────────────────────────────────────
  ["force push, long flag", bash("git push --force origin main"), "deny"],
  ["force push, short flag", bash("git push -f origin main"), "deny"],
  ["force-with-lease is still a force push", bash("git push --force-with-lease origin main"), "deny"],
  ["hard reset", bash("git reset --hard HEAD~3"), "deny"],
  ["rm -rf on root", bash("rm -rf /"), "deny"],
  ["rm -rf on home", bash("rm -rf ~"), "deny"],

  // --no-verify: forbidden BY NAME in CLAUDE.md, and until 2026-08-19 refused by nothing. The
  // .githooks gates cannot see the flag that skips them, and no check can observe a hook that did
  // not run — so this hook is the only rung where it is visible at all.
  ["--no-verify on commit", bash('git commit -m "x" --no-verify'), "deny"],
  ["--no-verify before the message", bash('git commit --no-verify -m "x"'), "deny"],
  ["--no-verify on push", bash("git push --no-verify origin main"), "deny"],
  ["-n on commit is --no-verify", bash('git commit -n -m "x"'), "deny"],
  ["-n on push is --no-verify", bash("git push -n origin main"), "deny"],

  // ── ASK ─────────────────────────────────────────────────────────────────────────────────────
  ["an ordinary push reaches a human", bash("git push origin feature-branch"), "ask"],
  ["reading a .env file", bash("cat .env.local"), "ask"],
  ["supabase db push is a prod operation", bash("supabase db push"), "ask"],
  ["supabase db reset is a prod operation", bash("supabase db reset"), "ask"],
  ["unparseable payload fails to a prompt, not to silence", "{not json", "ask"],

  // ── ALLOW — the direction that decides whether the gate survives a real session ──────────────
  ["an ordinary commit", bash('git commit -m "fix: a thing"'), "allow"],
  ["status", bash("git status"), "allow"],
  ["a normal test run", bash("npm run check"), "allow"],
  ["a command substitution, which the permission system cannot allow-rule", bash('echo "$(git rev-parse HEAD)"'), "allow"],
  // `-n` means something DIFFERENT on each of these, and none of them is --no-verify. A DENY
  // pattern wide enough to catch them would be wrong in the direction that gets a gate deleted.
  ["git revert -n is --no-commit, not --no-verify", bash("git revert -n HEAD"), "allow"],
  ["git cherry-pick -n is --no-commit", bash("git cherry-pick -n abc1234"), "allow"],
  ["git merge -n is --no-stat", bash("git merge -n main"), "allow"],
  ["git log -n 5 is a count", bash("git log -n 5"), "allow"],
  // A soft reset is not a hard reset, and `rm -rf` on a real path is ordinary cleanup.
  ["git reset --soft", bash("git reset --soft HEAD~1"), "allow"],
  ["rm -rf on a project subdirectory", bash("rm -rf node_modules/.cache"), "allow"],
]

let failed = 0
for (const [name, payload, want] of CASES) {
  const { decision, reason } = decide(payload)
  const ok = decision === want
  if (!ok) failed++
  console.log(`  ${ok ? "✓" : "✗"} must ${want.padEnd(5)} — ${name}${ok ? "" : `\n      got ${decision}: ${reason}`}`)
}

// The reason text must NAME the offending command class, or an approval prompt tells the human
// nothing they can act on.
{
  const { reason } = decide(bash('git commit --no-verify -m "x"'))
  const named = /no-verify/i.test(reason)
  if (!named) failed++
  console.log(`  ${named ? "✓" : "✗"} must show  — the refusal names --no-verify rather than saying "denied"`)
}

console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — denies the bypasses, asks on the gates, allows ordinary work")
process.exit(failed ? 1 : 0)
