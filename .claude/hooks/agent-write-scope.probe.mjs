/**
 * Probes for agent-write-scope.js — BOTH DIRECTIONS, per dev-standards LESSONS L-01.
 *
 * @kit agent-write-scope-probe v4 — tracked OUTSIDE its `KIT:CONFIG` regions.
 *
 * This gate has a second failure mode the other two do not, and the probe list is shaped around it.
 * `agent_type` is absent in the main session (E7), so a hook that read the field wrongly — a typo, a
 * rename, a payload shape that changed — would decide "not a subagent" for EVERY call and report
 * nothing wrong while gating nothing at all. That is the 2026-08-30 scar's shape exactly: a probe
 * that could not fire, reporting green.
 *
 * So the suite runs three populations, not two:
 *   1. subagent calls that must be stopped   — the planted violations
 *   2. subagent calls that must go through   — the known-good half
 *   3. MAIN-SESSION calls that must be untouched — the half that catches a gate which
 *      can never fire, and equally one that fires on everything
 *
 * Run: node .claude/hooks/agent-write-scope.probe.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs";
import os from "node:os";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "agent-write-scope.js");
// The SAME module the hook reads, resolved from this file rather than from the cwd (KIT-MODES R-2).
// This import is the whole of M-KIT-06's repair: the suite's agent cases are built from the
// project's table, so editing the table cannot fail the probe that verifies it.
import { SCOPES, SPAWNERS } from "./agent-write-scope.config.mjs";
/* KIT:CONFIG cwd — the absolute project root the synthesised payloads claim to come from.
 * It only has to be internally consistent: the hook resolves `file_path` against it, so the
 * absolute-path cases below must be built from the same string.
 *
 * ⚠ IT IS NEVER RESOLVED AGAINST THE DISK, so use any absolute path in your platform's shape —
 * it does not have to be, and should not be, where this repo actually sits. The default used to
 * read `C:/dev/your-project` and the sentence here used to say "Set it to your checkout", which
 * asked for a value STRONGER than the requirement two lines after conceding the requirement. The
 * extra strength is a machine identity written into a tracked file, which then travels to every
 * clone and to every other machine. Reported by the life-therapy session, 2026-09-09, whose own
 * CLAUDE.md forbids hardcoding that path because the repo has already moved once.
 *
 * It must stay a LITERAL. Deriving it from `process.cwd()` would make the absolute-path cases pass
 * for a different reason on every host — they would stop testing the hook's path resolution and
 * start testing that two calls to `cwd()` agree. */
const CWD = "/synthetic-root/project";
/* KIT:CONFIG /cwd */

/**
 * `raw` sends bytes verbatim. The first version of a malformed-input probe elsewhere passed a
 * STRING through JSON.stringify, which produces perfectly valid JSON — so nothing was malformed,
 * the hook read its field off a string, got `undefined`, and ALLOWED, while the probe recorded a
 * pass. Send garbage as garbage.
 */
function run(payload, { raw = false } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => resolve(JSON.parse(out).hookSpecificOutput.permissionDecision));
    p.stdin.end(raw ? payload : JSON.stringify(payload));
  });
}

/** A subagent Write/Edit call. */
const write = (agent, file, tool = "Write") => ({
  agent_type: agent,
  agent_id: "probe",
  cwd: CWD,
  tool_name: tool,
  tool_input: { file_path: file },
});

/** A subagent Bash call. */
const bash = (agent, command) => ({
  agent_type: agent,
  agent_id: "probe",
  cwd: CWD,
  tool_name: "Bash",
  tool_input: { command },
});

/** A subagent trying to spawn a subagent of its own. */
const spawn_ = (agent) => ({
  agent_type: agent,
  agent_id: "probe",
  cwd: CWD,
  tool_name: "Agent",
  tool_input: { subagent_type: "census", prompt: "count the things" },
});

/** The SAME call, from the main session — no `agent_type`, which is the whole signal (E7). */
const main = (tool_name, tool_input) => ({ cwd: CWD, tool_name, tool_input });

/* ── The v2 manifest fixtures ───────────────────────────────────────────────
 *
 * These are the ONLY cases in this suite that touch a real filesystem, and they have to. Every
 * other case is decided from the payload alone, which is why `CWD` can be a path no machine has;
 * the manifest is decided from a FILE, so a synthesised payload cannot exercise it. Building the
 * fixture in a temp directory keeps that true without a probe run depending on the state of
 * whatever checkout it happens to be started from — a probe that passes only in a tree someone
 * prepared by hand is the 2026-08-30 scar in a new costume.
 *
 * Each root gets its own directory rather than one root being rewritten between cases, so the
 * suite has no ordering dependency and a single case can be read in isolation. */
const roots = [];
function fixture(manifest, { ageMs = 0 } = {}) {
  const root = fs.mkdtempSync(join(os.tmpdir(), "aws-probe-"));
  roots.push(root);
  fs.mkdirSync(join(root, ".handoff"), { recursive: true });
  if (manifest !== null) {
    const at = join(root, ".handoff", "write-manifest.json");
    fs.writeFileSync(at, typeof manifest === "string" ? manifest : JSON.stringify(manifest));
    // Freshness is the file's mtime, so ageing the fixture is how the expiry is tested at all.
    // There is no field to falsify — which is the property the hook was written for.
    if (ageMs > 0) {
      const then = new Date(Date.now() - ageMs);
      fs.utimesSync(at, then, then);
    }
  }
  return root;
}

/** A subagent write rooted at a fixture rather than at the synthetic CWD. */
const at = (root, agent, file, tool = "Edit") => ({
  agent_type: agent,
  agent_id: "probe",
  cwd: root,
  tool_name: tool,
  tool_input: { file_path: file },
});

/* ── WHO THE PROJECT DECLARED ────────────────────────────────────────────────
 *
 * Everything below this line is derived from `agent-write-scope.config.mjs` — the file the project
 * edits — and nothing below it names an agent canon happens to ship. Until 2026-09-09 the opposite
 * was true: this suite asserted `grounder` writing to `.handoff/`, `crawler-doctrine` writing
 * nothing and `census` alone spawning, so a project with different agents failed roughly 25 of 51
 * probes for configuring the hook exactly as the hook told it to (M-KIT-06).
 *
 * A path outside every declared scope, and how it is chosen. It sits at the PROJECT ROOT, so it is
 * outside any root that is a subdirectory — which is every root except `.` itself. An agent scoped
 * to the whole checkout therefore has no "outside", and its deny cases are SKIPPED with that
 * reason rather than quietly dropped: a suite that silently stops exercising a direction is the
 * 2026-08-30 scar, and skipping loudly is the only honest version.
 */
/** The no-manifest fixture, used by every unrestricted-scope case below. */
const NONE = fixture(null);

const OUTSIDE = "zz-outside-every-declared-scope.ts";
const WHOLE_TREE = (roots) => roots.some((r) => [".", "./", ""].includes(String(r).trim()));

const SKIPS = [];
const skip = (why) => SKIPS.push(why);

const scoped = Object.entries(SCOPES).filter(([, s]) => Array.isArray(s) && s.length > 0);
const empty = Object.entries(SCOPES).filter(([, s]) => Array.isArray(s) && s.length === 0);
const free = Object.entries(SCOPES).filter(([, s]) => s === null).map(([a]) => a);
const ANY = Object.keys(SCOPES)[0];
const BOUNDED = scoped[0]?.[0];
const FREE = free[0];

/** An agent name the project's table does not carry, for the "nobody scoped this" cases. */
const UNSCOPED = ["general-purpose", "Explore", "zz-nobody-scoped-this"].find(
  (n) => !(n in SCOPES) && !SPAWNERS.has(n),
);

const DERIVED = [];
for (const [agent, roots] of scoped) {
  for (const root of roots) {
    DERIVED.push({ want: "allow", why: `${agent} writing inside its declared root ${root}`, payload: write(agent, `${root}/probe-task/01-${agent}.md`) });
  }
  if (WHOLE_TREE(roots)) {
    skip(`${agent}: scoped to the whole checkout, so no path inside the project is outside it — the deny direction is UNEXERCISED for this agent`);
  } else {
    DERIVED.push({ want: "deny", why: `${agent} writing outside every root it declared`, payload: write(agent, OUTSIDE, "Edit") });
    DERIVED.push({ want: "deny", why: `${agent}: a \`..\` escape out of ${roots[0]} is still outside it`, payload: write(agent, `${roots[0]}/probe-task/../../${OUTSIDE}`) });
    DERIVED.push({ want: "deny", why: `${agent}: an ABSOLUTE path outside the scope is still outside it`, payload: write(agent, `${CWD}/${OUTSIDE}`, "Edit") });
  }
}
for (const [agent] of empty) {
  DERIVED.push({ want: "deny", why: `${agent} writes no files at all — not even the artefact directory`, payload: write(agent, `.handoff/probe-task/01-${agent}.md`) });
  DERIVED.push({ want: "deny", why: `${agent}: and no source file either — an empty scope is a scope, not an absence`, payload: write(agent, OUTSIDE) });
}
for (const agent of free) {
  // Rooted at a fixture, never at CWD: a manifest left over from real work in the installer's own
  // checkout would flip these to allow and the suite would report green on a gate it had stopped
  // exercising. Every case whose verdict depends on a FILE owns the directory it reads.
  DERIVED.push({ want: "allow", why: `${agent}: its own artefact is in scope by definition, before any manifest`, payload: at(NONE, agent, `.handoff/probe-task/02-${agent}.md`, "Write") });
  DERIVED.push({ want: "ask", why: `${agent}: unrestricted means bounded by the run's manifest — undeclared is visible, not silent`, payload: at(NONE, agent, OUTSIDE) });
}
for (const agent of Object.keys(SCOPES)) {
  DERIVED.push(
    SPAWNERS.has(agent)
      ? { want: "allow", why: `${agent} MAY fan out — the project put it in SPAWNERS`, payload: spawn_(agent) }
      : { want: "deny", why: `${agent} may not spawn — it is scoped and not in SPAWNERS`, payload: spawn_(agent) },
  );
}
for (const agent of SPAWNERS) {
  if (agent in SCOPES) continue;
  DERIVED.push({ want: "allow", why: `${agent} is in SPAWNERS with no write scope — spawning is gated on WHO, never on a path`, payload: spawn_(agent) });
}

/* ── The manifest arm, which needs an agent with an unrestricted scope ────────
 * The fixtures' paths are canon's and synthetic — they exist only in a temp directory — so the
 * only thing the project's table decides here is WHOSE run is being bounded. */
const MANIFEST_CASES = [];
if (FREE === undefined) {
  skip("the manifest arm: no agent in the table has an unrestricted (`null`) scope, so there is nothing for a run manifest to refine — 11 cases UNEXERCISED");
} else {
  const SCOPED_F = fixture({ agent: FREE, paths: ["components/brand/", "lib/rail.ts"] });
  const STALE = fixture({ agent: FREE, paths: ["components/brand/"] }, { ageMs: 3 * 3600_000 });
  const CORRUPT = fixture("{ not json at all");
  const NO_PATHS = fixture({ agent: FREE, paths: [] });
  MANIFEST_CASES.push(
    // The register's own planted violation: an agent scoped to components/brand/ edits lib/nav.ts.
    // Before v2 this was the documented residual exposure, and it was allowed.
    { want: "deny", why: `${FREE} scoped by the run to components/brand/ reaching lib/nav.ts`, payload: at(SCOPED_F, FREE, "lib/nav.ts") },
    { want: "deny", why: "…and a `..` escape out of a declared root is still outside it", payload: at(SCOPED_F, FREE, "components/brand/../../etc/hosts") },
    { want: "allow", why: "a directory the manifest names", payload: at(SCOPED_F, FREE, "components/brand/mark-timing.ts") },
    { want: "allow", why: "a single FILE the manifest names — roots are paths, not only directories", payload: at(SCOPED_F, FREE, "lib/rail.ts") },
    { want: "allow", why: "its own artefact, undeclared and always in scope", payload: at(SCOPED_F, FREE, ".handoff/task/02-artefact.md", "Write") },
    // Every unusable manifest ASKS. None denies — that is the direction that keeps the gate on.
    { want: "ask", why: "STALE at 3h — yesterday's scope must not authorise today's task", payload: at(STALE, FREE, "components/brand/mark-timing.ts") },
    { want: "ask", why: "unparseable JSON must not read as an empty scope, which would deny everything", payload: at(CORRUPT, FREE, "components/brand/mark-timing.ts") },
    { want: "ask", why: "an empty paths list is a declaration nobody finished writing", payload: at(NO_PATHS, FREE, "components/brand/mark-timing.ts") },
  );
  const OTHER = Object.keys(SCOPES).find((a) => a !== FREE);
  if (OTHER === undefined) skip("the wrong-agent manifest case: the table carries only one agent, so no manifest can name a different one");
  else MANIFEST_CASES.push({ want: "ask", why: "a manifest scoping a DIFFERENT agent is not this run's declaration", payload: at(fixture({ agent: OTHER, paths: ["components/brand/"] }), FREE, "components/brand/mark-timing.ts") });

  if (BOUNDED === undefined) skip("the no-widening case: no agent has a bounded path scope, so there is nothing a manifest could try to widen");
  else MANIFEST_CASES.push({ want: "deny", why: "a manifest cannot widen an agent that already has a path scope", payload: at(SCOPED_F, BOUNDED, "components/brand/mark-timing.ts") });
}

/* ── CANON'S OWN, and they do not move ───────────────────────────────────────
 *
 * These are the assurances the kit makes on every project's behalf, and they live outside every
 * KIT:CONFIG region on purpose. Moving one of them into the table above would not fail loudly — it
 * would quietly hand a project the power to switch it off, which is strictly worse than the defect
 * the split repaired. If a case's verdict does not depend on WHO the project scoped, it belongs
 * here; if it does, it belongs in DERIVED. */
const UNIVERSAL = [
  // The commit denial applies to any subagent, scoped or not — it is gated on WHAT IS RUN.
  ...(ANY === undefined ? [] : [
    { want: "deny", why: "a subagent committing — the spine says it never does, now something says so too", payload: bash(ANY, 'git commit -m "refactor: sweep the tokens"') },
    { want: "deny", why: "`git -C` defeats a flags-then-subcommand parser; it must not defeat this one", payload: bash(ANY, "git -C . commit -m x") },
    { want: "deny", why: "pushing from a subagent — it ends at a report, the caller publishes", payload: bash(ANY, "git push origin develop") },
    { want: "deny", why: "cherry-pick creates a commit by a side door", payload: bash(ANY, "git cherry-pick a1b2c3d") },
    { want: "deny", why: "rebase rewrites the caller's branch", payload: bash(ANY, "git rebase main") },
    { want: "allow", why: "git show is how an agent reads a frozen tree", payload: bash(ANY, "git show main:package.json") },
    { want: "allow", why: "git merge-base — the hyphen guard, not \\b", payload: bash(ANY, "git merge-base main HEAD") },
    { want: "allow", why: "read-only git is most of how a report-only spine works", payload: bash(ANY, "git log --oneline -20 && git diff --stat") },
    { want: "allow", why: "git status is the post-run check itself", payload: bash(ANY, "git status --porcelain") },
    { want: "allow", why: "the check gate must never stall a subagent", payload: bash(ANY, "npm run check") },
    { want: "ask", why: "a subagent write with no recognisable path field", payload: { agent_type: ANY, cwd: CWD, tool_name: "Write", tool_input: {} } },
  ]),
  // NotebookEdit's path field is a path like any other, and the claim is about the FIELD, not the
  // agent — so it needs any agent with somewhere it may not write.
  ...(BOUNDED === undefined || WHOLE_TREE(SCOPES[BOUNDED]) ? [] : [
    { want: "deny", why: "NotebookEdit's path field is a path like any other", payload: { ...write(BOUNDED, "x"), tool_name: "NotebookEdit", tool_input: { notebook_path: OUTSIDE } } },
  ]),

  // The MAIN SESSION is untouched. Without this population a hook that decided "subagent" for
  // every call — or for none — still reports a clean sweep above (E7, the 2026-08-30 scar).
  { want: "allow", why: "the main session dispatches agents — that is the whole protocol", payload: main("Agent", { subagent_type: ANY ?? "grounder", prompt: "map it" }) },
  { want: "allow", why: "main session editing source, which this gate has no opinion about", payload: main("Edit", { file_path: OUTSIDE }) },
  { want: "allow", why: "main session commits — that is the protocol, not a violation", payload: main("Bash", { command: 'git commit -m "feat: the hook"' }) },
  { want: "allow", why: "main session writing what a subagent may not — it is the wrapper", payload: main("Write", { file_path: ".claude/anything.json" }) },
  { want: "allow", why: "pushing to main is bash-gate's call, not this one — one gate, one question", payload: main("Bash", { command: "git push origin main" }) },

  // Unscoped and malformed.
  ...(UNSCOPED === undefined ? [] : [
    { want: "ask", why: "an agent nobody scoped is visible, not silent — and not forbidden", payload: write(UNSCOPED, "scripts/x.mjs") },
    { want: "ask", why: "…and the same for an unscoped agent trying to spawn", payload: spawn_(UNSCOPED) },
  ]),
  { want: "ask", why: "unparseable bytes must interrupt, not wave through", raw: true, payload: "{ this is not json" },
  { want: "ask", why: "valid JSON that is not an object must ALSO interrupt", raw: true, payload: '"a bare string parses fine and has no agent_type"' },
];
if (UNSCOPED === undefined) skip("the unscoped-agent cases: every candidate name is in the project's table, so `ask` has no subject here");
if (ANY === undefined) skip("the commit-denial arm: the table is EMPTY, so no subagent exists to run a command — 11 cases UNEXERCISED");

const CASES = [...DERIVED, ...MANIFEST_CASES, ...UNIVERSAL];

let failed = 0;
for (const c of CASES) {
  const got = await run(c.payload, { raw: c.raw === true });
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} want ${c.want.padEnd(5)} got ${got.padEnd(5)}  scope: ${c.why}`);
}

for (const root of roots) fs.rmSync(root, { recursive: true, force: true });

// SKIPS ARE PRINTED AND COUNTED, and the last line carries them. A suite whose cases are derived
// from a project's table can lose a whole direction to a table that does not reach it — an agent
// scoped to the whole checkout has no "outside", a table with no unrestricted agent exercises no
// manifest state. Silence there is the 2026-08-30 scar exactly: a probe that cannot fire, reporting
// green. So the count of what was NOT exercised sits in the one line most readers see.
for (const s of SKIPS) console.log(`⊘ SKIPPED  ${s}`);

const agents = Object.keys(SCOPES).length;
const shape = `${DERIVED.length} derived from your ${agents} agent(s), ${MANIFEST_CASES.length} manifest, ${UNIVERSAL.length} canon's own`;
console.log(
  failed === 0
    ? `\n${SKIPS.length ? "⚠" : "✅"} ${CASES.length} agent-write-scope probes pass (${shape})` +
      (SKIPS.length ? ` — but ${SKIPS.length} arm(s) were SKIPPED, so this run does not exercise them.` : " — subagent denied, subagent allowed, main session untouched, and every manifest state decided.")
    : `\n❌ ${failed} of ${CASES.length} agent-write-scope probes FAILED (${shape}).`,
);
process.exit(failed === 0 ? 0 : 1);
