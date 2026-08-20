/**
 * .claude/hooks/context-budget.js — UserPromptSubmit annotator that keeps the token budget in view.
 *
 * WHY THIS EXISTS: measured over one session's transcript metadata — three compaction boundaries,
 * `cumulativeDroppedTokens: 4,344,909`. Every turn re-sends the whole conversation, so at 600k of
 * context a one-line `grep` costs the same billable-equivalent as a 200-line file write. Turn count
 * × context size IS the spend; output tokens were ~2% of it.
 *
 * And compaction is the lever, by a distance. From this repo's own `compactMetadata`:
 *   preTokens 1,001,754 → postTokens 16,754   (auto)
 *   preTokens   998,784 → postTokens 18,203   (auto)
 *   preTokens   687,984 → postTokens 15,444   (manual)
 * A ~60x reset. No amount of writing tighter tool calls competes with that.
 *
 * WHY A HOOK RATHER THAN PROSE. The instruction has to survive the very thing it is about. Prose in
 * CLAUDE.md is re-sent every turn and is therefore itself part of the problem, and a scoped rule
 * file is read-triggered (E1b) so a session that never reads a matching file never sees it. A
 * UserPromptSubmit hook re-injects at the top of every prompt, from OUTSIDE the conversation, and
 * costs a few dozen tokens to do it. It cannot go stale and it cannot fall out of context.
 *
 * TWO AUDIENCES, AND THEY GET DIFFERENT TEXT. This is the defect the first version shipped with:
 * it put "run /compact" into `additionalContext`, which goes to the MODEL — the one participant
 * that cannot run a slash command. The human, who can, saw nothing. So:
 *   systemMessage     → the human. Carries the /compact ask, because only they can act on it.
 *   additionalContext → the model. Carries the batching instruction, which only it can act on.
 * An instruction delivered to a party that cannot execute it is indistinguishable from no
 * instruction at all, while looking like a working control.
 *
 * WHAT IT CANNOT DO, stated because the absence is easy to mistake for a bug: no hook can TRIGGER
 * compaction. `PreCompact` fires when one is already happening, and a hook has no way to invoke a
 * slash command. Automatic compaction is a CLI-level feature (`--autocompact <auto|tokens>`,
 * 100k-1M); this hook's job is to make the number visible and to nag at the right threshold. A hook
 * that quietly did nothing while appearing to manage the budget would be the exact fail-open this
 * repo keeps finding.
 */
// @event UserPromptSubmit
// @matcher *
// @non-blocking this ANNOTATES a prompt, it does not gate a tool call. No blocking event can add
// context to a prompt, so UserPromptSubmit is the only place it can do its job — and it fails
// toward saying nothing, never toward stalling the session.
// @no-twin settings permissions match TOOLS, and this gates no tool — it annotates a prompt with a
// measurement. There is no permission rule that can express "tell me how big the context is", so
// the coarse layer has nothing to fall back to and the gap is recorded rather than implied.
const { readFileSync, statSync } = require("node:fs");

// Thresholds in tokens of live context. WARN is where a turn starts costing more than the work in
// it; STOP is where a compaction pays for itself within a handful of turns.
const WARN = 250_000;
const STOP = 450_000;

/**
 * Current context size, read backwards from the transcript tail.
 *
 * Whichever of these two lands FIRST scanning backwards is the truth:
 *
 *   a compact_boundary  → context was just reset; `compactMetadata.postTokens` is the new size.
 *   an assistant usage  → cache_read + cache_creation + input, i.e. what was actually sent, which
 *                         is what gets billed again on the next turn.
 *
 * Reading the usage line ALONE is wrong, and wrong in the expensive direction: at prompt-submit
 * time immediately after a compaction there is no post-compaction turn yet, so the newest usage
 * line is the PRE-compaction one. The first version of this hook did exactly that and reported
 * 687k to a session that had just been reset to 15k — nagging to compact at the one moment
 * compaction had already happened. A reminder that fires when the problem is solved is the
 * wallpaper this hook exists to avoid becoming.
 *
 * Sidechain lines are skipped: a subagent's usage is its own context window, not this session's.
 */
function contextTokens(transcriptPath) {
  const size = statSync(transcriptPath).size;
  const WINDOW = 512 * 1024;
  const fd = readFileSync(transcriptPath);
  const tail = fd.subarray(Math.max(0, size - WINDOW)).toString("utf8");
  const lines = tail.split(/\r?\n/);

  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let j;
    try { j = JSON.parse(lines[i]); } catch { continue; }   // a truncated first line is expected

    if (j.subtype === "compact_boundary") {
      const post = j.compactMetadata && j.compactMetadata.postTokens;
      if (typeof post === "number") return post;
      continue;
    }

    if (j.isSidechain) continue;                            // a subagent's window, not ours
    const u = j.message && j.message.usage;
    if (!u) continue;
    return (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);
  }
  return null;
}

/** Shared framing so both audiences see the same number and the same arithmetic. */
function figures(tokens) {
  return { k: Math.round(tokens / 1000), perTurn: Math.round((tokens * 0.1) / 1000) };
}

/**
 * For the HUMAN. Only they can run /compact, so only they are told to.
 * Silent below WARN — a message that always fires is wallpaper.
 */
function adviseUser(tokens) {
  if (tokens === null || tokens < WARN) return null;
  const { k, perTurn } = figures(tokens);

  if (tokens >= STOP) {
    return `⚠ CONTEXT ${k}k — ~${perTurn}k billable-equivalent per turn before any work happens. `
      + `Run /compact if this starts a new task: measured on this repo, compaction resets 1,001,754 `
      + `tokens to 16,754. To stop doing it by hand, restart with --autocompact 250000 (accepts 100k-1M; `
      + `the default fires at ~1M).`;
  }
  return `Context ${k}k (~${perTurn}k billable-equivalent per turn, whatever the turn does). `
    + `New task → /compact. Persistent fix: restart with --autocompact 250000.`;
}

/**
 * For the MODEL. It cannot run /compact, so telling it to is noise that costs tokens to deliver.
 * Batching is the half it can actually execute.
 */
function adviseAgent(tokens) {
  if (tokens === null || tokens < WARN) return null;
  const { k, perTurn } = figures(tokens);
  const urgency = tokens >= STOP ? "A plain grep now costs the same as a large edit. " : "";
  return `Context ${k}k, ~${perTurn}k billable-equivalent per turn. ${urgency}`
    + `Batch aggressively: independent reads, greps and writes go in ONE message, not one per turn. `
    + `Pipe long command output. Do not suggest /compact — you cannot run it and the user has already `
    + `been told separately.`;
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let additionalContext = "";
  let systemMessage = null;
  try {
    const input = JSON.parse(raw.replace(/^﻿/, ""));
    if (input.transcript_path) {
      const tokens = contextTokens(input.transcript_path);
      additionalContext = adviseAgent(tokens) ?? "";
      systemMessage = adviseUser(tokens);
    }
  } catch {
    // A hook that cannot measure must not guess, and must not block: this one only ever ADDS a
    // line, so failing silent costs a missed reminder rather than a stalled session.
  }

  const out = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } };
  if (systemMessage) out.systemMessage = systemMessage;
  process.stdout.write(JSON.stringify(out));
});

module.exports = { adviseUser, adviseAgent, contextTokens, WARN, STOP };
