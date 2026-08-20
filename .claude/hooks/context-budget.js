/**
 * .claude/hooks/context-budget.js — UserPromptSubmit gate that keeps the token budget in view.
 *
 * WHY THIS EXISTS: measured 2026-08-20 over 6,653 turns of one session — 6M output tokens, 31M
 * cache-write, and 3.0 BILLION cache-read. Output was ~2% of the bill. The cost is that EVERY turn
 * re-sends the whole conversation, so at 600k of context a one-line `grep` costs the same ~60k
 * billable-equivalent as a 200-line file write. Turn count × context size IS the spend; nothing
 * else is close.
 *
 * And the single most effective intervention was already visible in the data: one compaction took
 * per-turn context from 941k to 324k, cutting the cost of every subsequent turn by ~3x, instantly.
 * No amount of writing shorter tool calls competes with that.
 *
 * WHY A HOOK RATHER THAN PROSE. The instruction has to survive the very thing it is about. Prose in
 * CLAUDE.md is re-sent every turn and is therefore itself part of the problem, and a scoped rule
 * file is read-triggered (E1b) so a session that never reads a matching file never sees it. A
 * UserPromptSubmit hook re-injects at the top of every prompt, from OUTSIDE the conversation, and
 * costs a few dozen tokens to do it. It cannot go stale and it cannot fall out of context.
 *
 * WHAT IT CANNOT DO, stated because the absence is easy to mistake for a bug: no hook can TRIGGER
 * compaction. `PreCompact` fires when one is already happening. So this measures and escalates; the
 * act stays manual. A hook that quietly did nothing while appearing to manage the budget would be
 * the exact fail-open this repo keeps finding.
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
 * Current context size, read from the LAST assistant turn's usage in the transcript.
 *
 * cache_read + cache_creation is what the model was actually sent, which is the number that gets
 * billed again on the next turn. Reading backwards because only the tail matters and these files
 * reach 40MB.
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
    const u = j.message && j.message.usage;
    if (!u) continue;
    return (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);
  }
  return null;
}

/** The advice, scaled to the number. Silent below WARN — a warning that always fires is wallpaper. */
function advise(tokens) {
  if (tokens === null || tokens < WARN) return null;
  const k = Math.round(tokens / 1000);
  const perTurn = Math.round(tokens * 0.1 / 1000);

  if (tokens >= STOP) {
    return `⚠ CONTEXT ${k}k — every turn now costs ~${perTurn}k billable-equivalent BEFORE doing any work, `
      + `and a plain grep costs the same as a large edit. If this prompt starts a NEW TASK, run /compact `
      + `first: measured, one compaction took per-turn context from 941k to 324k. If it continues the `
      + `current task, batch aggressively — independent reads, greps and file writes go in ONE message, `
      + `not one per turn.`;
  }
  return `Context ${k}k (~${perTurn}k billable-equivalent per turn, whatever the turn does). `
    + `New task → /compact first. Same task → batch independent tool calls into one message.`;
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let additionalContext = "";
  try {
    const input = JSON.parse(raw.replace(/^﻿/, ""));
    if (input.transcript_path) {
      const advice = advise(contextTokens(input.transcript_path));
      if (advice) additionalContext = advice;
    }
  } catch {
    // A hook that cannot measure must not guess, and must not block: this one only ever ADDS a
    // line, so failing silent costs a missed reminder rather than a stalled session.
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext },
  }));
});

module.exports = { advise, contextTokens, WARN, STOP };
