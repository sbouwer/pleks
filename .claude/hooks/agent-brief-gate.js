/**
 * .claude/hooks/agent-brief-gate.js — PreToolUse on the Agent tool: a spawn of a contract-bearing
 * agent must name its artefact, and must not ask for the answer inline.
 *
 * @kit agent-brief-gate v2 — tracked. Edit it in dev-standards and re-adopt; a local change here is
 * a fork, and `check-kit-drift.mjs` will say so. The tables are in `agent-brief-gate.config.mjs`.
 *
 * Register: settings.json → hooks.PreToolUse, matcher "Agent|Task" (the tool was `Task` before it was
 * `Agent`; both are gated), command `node "$CLAUDE_PROJECT_DIR/.claude/hooks/agent-brief-gate.js"`.
 *
 * WHY IT EXISTS. The handoff protocol (playbooks/4-AGENT-PIPELINES.md §3) sends an agent's work to
 * `.handoff/<task-slug>/<NN>-<agent>.md` and its reply to a five-line block. Every spine said so,
 * and measured across the estate on 2026-09-30 it mostly did not happen: of nine runs, the two
 * whose brief named a `.handoff` path returned the block; the ones briefed "return your result as
 * text" or "return the table" returned 5–18k characters inline, and one did both. The agent
 * followed the nearest instruction, which was the caller's. The spines now say the contract
 * outranks such a brief (grounder v8, census v11, walker v9, implementer v6, db-inspector v6) —
 * but that is attention against attention, and this hook moves the rule to the caller's tool call,
 * where the harness decides it.
 *
 * WHAT IT DECIDES, and nothing else:
 *   - a BRIEFED type whose prompt names no `.handoff/<slug>/<NN>-<that type>.md`  → deny
 *   - a BRIEFED type whose prompt asks for the answer inline                      → deny
 *   - a REDIRECT type (default: Explore, general-purpose, and a spawn naming none) → deny, naming
 *     the spined agent to use instead
 *   - anything else, and every other tool                                         → no decision
 *   - input it cannot read                                                        → ask
 *
 * A DENY, NOT AN ASK, because the fix is the caller's and needs no human: the reason reaches the
 * model (hooks docs: "Claude Code cancels the tool call and feeds permissionDecisionReason back to
 * Claude"), and it carries the brief form to re-send. An ask would put a person in a loop the model
 * can close alone.
 *
 * A PASS EMITS NO DECISION. Emitting `allow` would pre-approve the spawn and skip whatever the
 * project's settings say about the Agent tool; this hook only ever takes permission away.
 *
 * WHAT IT CANNOT SEE, stated so it is not read as covered:
 *   - Whether the agent then writes the artefact, or replies with the block only. That happens after
 *     the spawn. `check-handoff-contract` reads the artefact on disk; the reply itself is held by
 *     the spine alone until a SubagentStop check exists (its stdin carries `agent_type` and
 *     `agent_transcript_path` per the docs; what a `block` decision does there is undocumented,
 *     so it is not built on an assumption).
 *   - An inline request phrased in a way the patterns below do not read. They are a floor: the
 *     common phrasings, each probed in both directions, with negation honoured ("do not return it
 *     inline" passes). A caller determined to ask for an inline answer can.
 *   - Whether the slug is a good one, or NN the right step. It checks the shape, not the routing.
 *
 * v2 (2026-09-30) carries the three markers below. v1 shipped without them, and the kit's own
 * check-hook-registration fails a hook that lacks them, so every project adopting v1 exactly as
 * shipped went red. Found by yoros (CF-14), whose local fork these lines are, verbatim. Canon's
 * gate could not see it because canon does not install this hook; `tools/check-kit-hooks.mjs` now
 * reads every kit hook for these markers, whether canon runs it or not.
 */
// @event PreToolUse
// @matcher Agent|Task
// @no-twin A settings.json permission rule sees the agent type and never the prompt, so the brief
// half (an artefact named, nothing asked inline) cannot be spelled there at all. The probe suite in
// agent-brief-gate.probe.mjs is the backstop: if this hook is deleted or stops matching, `npm run
// check` goes red.
import { BRIEFED, REDIRECT } from "./agent-brief-gate.config.mjs";

const SPAWN_TOOLS = new Set(["Agent", "Task"]);

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The artefact path the prompt names for `type`, or null. Either slash: a brief is prose. */
function namedArtefact(prompt, type) {
  const re = new RegExp(`\\.handoff[\\\\/][A-Za-z0-9][A-Za-z0-9._-]*[\\\\/]\\d{2}-${escapeRe(type)}\\.md\\b`);
  const m = re.exec(prompt);
  return m ? m[0] : null;
}

/*
 * Phrasings that ask for the work in the reply. Two shapes: a verb followed closely by an inline
 * destination ("return it as text", "give me the list in your reply"), and "return the <product>"
 * for the products a contract agent writes to its artefact. `contract`, `block` and `verdict` are
 * NOT products — "return the contract block" is the correct brief, and a pattern refusing it would
 * be the over-matching gate that fails while looking safe.
 */
const INLINE = [
  /\b(?:return|give|send|reply with|report back|paste|print|output|list)\b[^.\n]{0,60}?\b(?:as (?:plain )?text|inline|in (?:full|your reply|the reply|your response|your answer|your final message))\b/i,
  /\breturn (?:me )?(?:the|a|your) (?:full |complete |whole )?(?:table|list|report|findings|results?|answer|output|sql|map|diff)\b/i,
];
const NEGATED = /\b(?:not|never|don't|do not|no|nothing)\b[^.\n]{0,30}$/i;

/** The first inline request in the prompt that is not negated just before it, or null. */
function inlineRequest(prompt) {
  for (const re of INLINE) {
    const g = new RegExp(re.source, "gi");
    for (let m = g.exec(prompt); m !== null; m = g.exec(prompt)) {
      if (!NEGATED.test(prompt.slice(Math.max(0, m.index - 40), m.index))) return m[0];
    }
  }
  return null;
}

function briefForm(type) {
  return (
    `Re-brief it as: "pipeline: <P0–P7, or —> · step <n> of <m>, or — · artefact: ` +
    `.handoff/<task-slug>/<NN>-${type}.md · input: <the previous step's artefact, if any>", then the ` +
    `task. Ask for nothing inline: the agent writes its work to that file and replies with the ` +
    `contract block only, which you relay verbatim (playbooks/4-AGENT-PIPELINES.md §3).`
  );
}

function decide(input) {
  if (!SPAWN_TOOLS.has(input.tool_name)) return null;
  const ti = input.tool_input && typeof input.tool_input === "object" ? input.tool_input : {};
  const type = typeof ti.subagent_type === "string" && ti.subagent_type !== "" ? ti.subagent_type : "general-purpose";
  const prompt = typeof ti.prompt === "string" ? ti.prompt : "";

  if (Object.hasOwn(REDIRECT, type)) {
    const to = REDIRECT[type];
    return {
      decision: "deny",
      reason:
        `agent-brief-gate: "${type}" is not spawned in this project — it has no spine, so nothing ` +
        `sends its work to an artefact, and every run comes back inline. Spawn "${to}" instead. ` +
        briefForm(to),
    };
  }
  if (!BRIEFED.has(type)) return null;

  if (namedArtefact(prompt, type) === null) {
    return {
      decision: "deny",
      reason: `agent-brief-gate: the ${type} brief names no artefact (.handoff/<task-slug>/<NN>-${type}.md). ` + briefForm(type),
    };
  }
  const asked = inlineRequest(prompt);
  if (asked !== null) {
    return {
      decision: "deny",
      reason:
        `agent-brief-gate: the ${type} brief asks for the answer inline ("${asked}"). Its spine puts ` +
        `the work in the artefact whatever the brief says, so this only costs a contradiction. ` +
        briefForm(type),
    };
  }
  return null;
}

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let verdict;
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""));
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("hook input is not an object");
    }
    verdict = decide(input);
  } catch {
    // A gate that cannot read its input must interrupt, never wave through.
    verdict = { decision: "ask", reason: "agent-brief-gate: could not parse hook input — failing to a prompt, not to silence" };
  }
  process.stdout.write(
    JSON.stringify(
      verdict === null
        ? {}
        : { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: verdict.decision, permissionDecisionReason: verdict.reason } },
    ),
  );
});
