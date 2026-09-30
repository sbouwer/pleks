/**
 * Probes for agent-brief-gate.js — BOTH DIRECTIONS, per dev-standards LESSONS L-01.
 *
 * @kit agent-brief-gate-probe v1 — tracked.
 *
 * The allow half matters as much as the deny half. A gate that refused "reply with the contract
 * block only" would fail its job while looking maximally strict, and every caller would learn to
 * phrase briefs around it — which is the inline habit this hook exists to end, relocated.
 *
 * Populations:
 *   1. a well-formed brief for every BRIEFED type                    → no decision
 *   2. the same brief with the artefact missing, misnamed, or for another agent → deny
 *   3. inline phrasings (deny) and their negated or contract forms (no decision)
 *   4. every REDIRECT type, and a spawn naming none                  → deny, naming the target
 *   5. types in neither table, and every other tool                  → no decision
 *   6. the same rules inside a subagent (a census fanning out)
 *   7. malformed input                                               → ask
 *   8. the config's own coherence: every REDIRECT target is BRIEFED
 *
 * The agent cases are DERIVED from agent-brief-gate.config.mjs, so a project editing its tables
 * keeps a green probe that tests its own tables (M-KIT-06).
 *
 * Run: node .claude/hooks/agent-brief-gate.probe.mjs
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BRIEFED, REDIRECT } from "./agent-brief-gate.config.mjs";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "agent-brief-gate.js");

/** `raw` sends bytes verbatim — a malformed-input case must send garbage, not a JSON string. */
function run(payload, { raw = false } = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      try {
        const o = JSON.parse(out);
        resolve({ decision: o.hookSpecificOutput?.permissionDecision ?? "none", reason: o.hookSpecificOutput?.permissionDecisionReason ?? "" });
      } catch {
        resolve({ decision: "unparseable", reason: out });
      }
    });
    p.stdin.end(raw ? payload : JSON.stringify(payload));
  });
}

const spawnCall = (subagent_type, prompt, extra = {}) => ({
  tool_name: "Agent",
  tool_input: { ...(subagent_type === undefined ? {} : { subagent_type }), description: "probe", prompt },
  ...extra,
});
const good = (type, tail = "") =>
  `pipeline: — · step — of — · artefact: .handoff/probe-task/01-${type}.md\nFind every caller of foo().${tail}`;

const cases = [];
const add = (name, payload, want, { raw = false, reasonHas = null } = {}) => cases.push({ name, payload, want, raw, reasonHas });

// 1 + 2 — derived per BRIEFED type.
for (const t of BRIEFED) {
  add(`${t}: well-formed brief`, spawnCall(t, good(t)), "none");
  add(`${t}: backslash path`, spawnCall(t, `artefact: .handoff\\probe-task\\03-${t}.md — go`), "none");
  add(`${t}: no artefact named`, spawnCall(t, "Find every caller of foo()."), "deny", { reasonHas: `<NN>-${t}.md` });
  add(`${t}: step number not two digits`, spawnCall(t, `artefact: .handoff/probe-task/1-${t}.md`), "deny");
  add(`${t}: no slug directory`, spawnCall(t, `artefact: .handoff/01-${t}.md`), "deny");
  add(`${t}: empty slug`, spawnCall(t, `artefact: .handoff//01-${t}.md`), "deny");
  add(`${t}: path names another agent`, spawnCall(t, `artefact: .handoff/probe-task/01-${t}x.md`), "deny");
  add(`${t}: empty prompt`, spawnCall(t, ""), "deny");
}

// 3 — inline phrasing, on the first BRIEFED type; the phrase logic is type-independent.
const T = [...BRIEFED][0];
for (const phrase of [
  "Return your result as text.",
  "Return the table of hits.",
  "return the full list of call sites",
  "Give me the counts inline.",
  "Report back the findings in your reply.",
  "Reply with the SQL and its output in full.",
  "Return the SQL you ran.",
  "Return a full report of every hit.",
]) add(`${T}: inline — "${phrase}"`, spawnCall(T, good(T, `\n${phrase}`)), "deny", { reasonHas: "inline" });
for (const phrase of [
  "Reply with the contract block only.",
  "Return the contract block and nothing else.",
  "Do not return anything inline.",
  "Never paste the table in your reply.",
  "Write the table to the artefact.",
  "The list goes in the artefact; return a verdict.",
]) add(`${T}: not inline — "${phrase}"`, spawnCall(T, good(T, `\n${phrase}`)), "none");

// 4 — redirects, and a spawn that names no type at all.
for (const [from, to] of Object.entries(REDIRECT)) {
  add(`${from} → ${to}`, spawnCall(from, good(from)), "deny", { reasonHas: `"${to}"` });
}
if (Object.hasOwn(REDIRECT, "general-purpose")) {
  add("no subagent_type is general-purpose", spawnCall(undefined, "Look into this."), "deny", { reasonHas: `"${REDIRECT["general-purpose"]}"` });
}

// 5 — outside both tables.
for (const t of ["Plan", "crawler-doctrine", "claude-code-guide", "some-project-agent"]) {
  if (!BRIEFED.has(t) && !Object.hasOwn(REDIRECT, t)) add(`${t} passes untouched`, spawnCall(t, "anything"), "none");
}
add("Task is gated like Agent", { ...spawnCall(T, "no path"), tool_name: "Task" }, "deny");
add("Bash is not this hook's", { tool_name: "Bash", tool_input: { command: "ls" } }, "none");
add("Write is not this hook's", { tool_name: "Write", tool_input: { file_path: "x", content: "y" } }, "none");

// 6 — inside a subagent: the same rules, whoever spawns.
add("census fan-out, well-formed", spawnCall(T, good(T), { agent_type: "census", agent_id: "a1" }), "none");
add("census fan-out, no artefact", spawnCall(T, "count it", { agent_type: "census", agent_id: "a1" }), "deny");

// 7 — malformed.
add("garbage input asks", "{not json", "ask", { raw: true });
add("array input asks", [], "ask");
add("null input asks", "null", "ask", { raw: true });

let failed = 0;

// 8 — the config's own coherence, before any spawn.
for (const [from, to] of Object.entries(REDIRECT)) {
  if (!BRIEFED.has(to)) {
    failed++;
    console.log(`  ✗ config: REDIRECT sends "${from}" to "${to}", which is not BRIEFED — the replacement would itself be unbriefed`);
  }
}

const results = await Promise.all(cases.map((c) => run(c.payload, { raw: c.raw })));
cases.forEach((c, i) => {
  const r = results[i];
  const reasonOk = c.reasonHas === null || r.reason.includes(c.reasonHas);
  if (r.decision !== c.want || !reasonOk) {
    failed++;
    console.log(`  ✗ ${c.name}: want ${c.want}${c.reasonHas ? ` citing ${c.reasonHas}` : ""}, got ${r.decision}${r.reason ? ` — ${r.reason}` : ""}`);
  }
});

if (failed) {
  console.log(`\n❌ agent-brief-gate: ${failed} of ${cases.length} probe(s) failed`);
  process.exit(1);
}
console.log(`✅ agent-brief-gate: ${cases.length} of ${cases.length} probes pass (${BRIEFED.size} briefed types, ${Object.keys(REDIRECT).length} redirects)`);
