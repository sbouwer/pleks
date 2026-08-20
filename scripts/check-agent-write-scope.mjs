#!/usr/bin/env node
/**
 * scripts/check-agent-write-scope.mjs — probes for the subagent write-scope gate.
 *
 * Probes BOTH directions, and the second direction is the one that matters here: a planted write
 * outside `.claude/handoff/` must be DENIED, and an ordinary write must still be ALLOWED. A gate
 * that denies everything looks identical to a working gate right up until it blocks the main
 * session, and a gate that can never fire looks identical to a working gate forever.
 *
 * The channel is a PreToolUse payload on stdin, so every fixture is a real subprocess invocation
 * with a real payload — never a direct call into logic the harness does not use (L-06).
 *
 * `agent_type` as the discriminator is E7's finding (docs/EXPERIMENTS.md); the reason the gate has
 * to exist at all is E8's. Both carry a re-run trigger on CLI major upgrade.
 */
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"

const HOOK = ".claude/hooks/agent-write-scope.js"
const CWD = process.cwd()

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

/** A subagent write. Omit `agentType` to model the main session, which carries no identity fields. */
const write = (agentType, filePath, tool = "Write") =>
  JSON.stringify({
    session_id: "s",
    cwd: CWD,
    hook_event_name: "PreToolUse",
    tool_name: tool,
    tool_input: { file_path: filePath, content: "x" },
    ...(agentType ? { agent_id: "a1", agent_type: agentType } : {}),
  })

const CASES = [
  // --- PLANTED VIOLATIONS: a read-only spine reaching into the tree ---
  ["grounder editing source", write("grounder", "lib/constants.ts", "Edit"), "deny"],
  ["walker editing the diff it is reviewing", write("walker", "app/page.tsx", "Edit"), "deny"],
  ["census rewriting a baseline", write("census", "eslint-rules/baseline.json"), "deny"],
  ["db-inspector writing a migration", write("db-inspector", "supabase/migrations/003_leases.sql"), "deny"],
  ["grounder writing to .claude but not handoff", write("grounder", ".claude/settings.json", "Edit"), "deny"],
  ["an absolute path outside the scope", write("grounder", `${CWD}/package.json`, "Edit"), "deny"],
  // Traversal is the way a path check gets defeated: the string starts with the allowed prefix and
  // the resolved path does not. Compared after `path.resolve`, so this lands outside and is denied.
  ["`..` traversal out of the handoff directory", write("grounder", ".claude/handoff/../../lib/env.ts", "Edit"), "deny"],
  ["crawler-doctrine outside both of its roots", write("crawler-doctrine", "docs/MECHANISABLE.md", "Edit"), "deny"],

  // --- KNOWN-GOOD: the half that catches a gate which can never fire ---
  ["grounder writing its own artefact", write("grounder", ".claude/handoff/m-048/01-grounder.md"), "allow"],
  ["walker writing its artefact", write("walker", ".claude/handoff/m-048/03-walker.md"), "allow"],
  ["census writing its artefact", write("census", ".claude/handoff/sweep/01-census.md"), "allow"],
  ["an absolute path INSIDE the scope", write("grounder", `${CWD}/.claude/handoff/x/01-grounder.md`), "allow"],
  ["crawler-doctrine writing its findings file", write("crawler-doctrine", ".claude/crawlers/FINDINGS.json", "Edit"), "allow"],
  ["implementer editing source — its entire remit", write("implementer", "lib/constants.ts", "Edit"), "allow"],
  ["implementer writing a new file", write("implementer", "lib/screening/newThing.ts"), "allow"],

  // --- THE MAIN SESSION MUST BE UNTOUCHED. This gate is about subagents; if it ever starts
  //     deciding main-session writes it will be turned off, and rightly. ---
  ["main session editing source", write(null, "lib/constants.ts", "Edit"), "allow"],
  ["main session editing settings", write(null, ".claude/settings.json", "Edit"), "allow"],

  // --- fail-closed, and the unscoped-agent case ---
  ["unparseable payload asks rather than allows", "{not json", "ask"],
  ["an agent type with no declared scope is asked, not waved through", write("general-purpose", "lib/constants.ts", "Edit"), "ask"],
  ["a write with no recognisable path field is asked", JSON.stringify({ cwd: CWD, tool_name: "Write", tool_input: {}, agent_type: "grounder" }), "ask"],
]

let failed = 0
for (const [name, payload, want] of CASES) {
  const { decision } = decide(payload)
  const ok = decision === want
  if (!ok) failed++
  console.log(`  ${ok ? "✓" : "✗"} must ${want.padEnd(5)} — ${name}${ok ? "" : `\n      got: ${decision}`}`)
}

// The denial has to tell the agent where its artefact DOES go, or it will retry somewhere else.
const shown = decide(write("grounder", "lib/env.ts", "Edit"))
const helpful = shown.reason.includes(".claude/handoff")
console.log(`  ${helpful ? "✓" : "✗"} must show  — the denial names the directory artefacts belong in`)
if (!helpful) failed++

// The handoff directory must be gitignored, or the post-run `git status --porcelain` control in
// §8 of the pipeline protocol reports every artefact as untracked noise and stops being read.
const ignored = spawnSync("git", ["check-ignore", "-q", ".claude/handoff/x/01-grounder.md"], { encoding: "utf8" })
const isIgnored = ignored.status === 0
console.log(`  ${isIgnored ? "✓" : "✗"} must ignore — .claude/handoff/ is gitignored`)
if (!isIgnored) failed++

console.log(
  failed
    ? `\n❌ ${failed} probe(s) wrong`
    : "\n✅ probes green — denies out-of-scope subagent writes, allows in-scope ones, leaves the main session alone",
)
process.exit(failed ? 1 : 0)
