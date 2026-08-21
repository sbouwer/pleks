/**
 * .claude/statusline.js — always-visible context budget, and the session's live permission mode.
 *
 * WHY THIS EXISTS RATHER THAN THE HOOK ALONE. `.claude/hooks/context-budget.js` measures the same
 * thing, but it can only reach the MODEL: its `additionalContext` is injected into the prompt, and
 * its `systemMessage` field — tried on 2026-08-20 — does NOT render to the human at all. So the
 * participant who is paying, and the only one who can run /compact, was structurally unable to see
 * the number. That is the whole reason this file exists.
 *
 * A statusline is strictly the better surface for a running gauge:
 *   · always visible, so there is no threshold to cross before it says anything
 *   · costs ZERO tokens — it never enters the conversation
 *   · shows the trend, not just the moment it crossed a line
 *
 * The hook keeps the model-facing half (batching, delegation economics) because that half IS
 * actionable by the model. This keeps the human-facing half. Neither duplicates the other.
 *
 * ONE WRITER. This reads the cumulative figures from the state file the hook maintains and never
 * writes it. A statusline re-renders on a timer; scanning 54 subagent transcripts and rewriting
 * state at that rate would make the budget display a measurable line item in the budget it displays.
 * So this does exactly one stat and one 512KB positioned read, via `contextNow`.
 *
 * SECOND REMIT, added 2026-08-21: the permission mode, for exactly the reason above, one field over.
 * A session-level mode (CLI arg or UI selection) OUTRANKS `permissions.defaultMode` in settings.json
 * and is written to no file, so a session can run in ask-mode while every settings file on disk says
 * `acceptEdits` — and from inside the session the three states are indistinguishable: allowed,
 * prompted, and mode-overridden all look identical to the model, which cannot see a prompt at all.
 * The participant who is the only one able to CHANGE the mode was structurally unable to SEE it.
 *
 * ⚠ IT READS THE TRANSCRIPT, NOT THE PAYLOAD, AND THAT IS THE WHOLE POINT. Two earlier cuts read the
 * payload's mode field — first as `permissionMode`, a typo for `permission_mode`, then correctly
 * spelled. Both were wrong, and the second was wrong in the more expensive way: `permission_mode` on
 * a payload is the CONFIGURED DEFAULT out of settings.json, while the transcript's `{"type":"mode"}`
 * record is the LIVE session state, cycled by Shift+Tab (normal → acceptEdits → plan). In the
 * session that produced this file the two disagreed for its entire length — 200 `mode: normal`
 * records against a payload saying `acceptEdits` — because `defaultMode` was never applied by the
 * VS Code extension at all. An instrument reading the payload reports WHAT WAS ASKED FOR, in a bug
 * whose entire nature is that what was asked for did not take: it renders silence and calls that
 * agreement. The fix was not a better pattern against the same field — it was reading a different
 * channel. Three VS Code restarts and two rebuilt instruments were spent before anyone did.
 *
 * FAILS TO A PLAIN LINE, NEVER TO AN ERROR. A statusline that throws renders its stack trace into
 * the UI on every frame.
 */
const { WARN, STOP, CACHE_READ_MULTIPLIER, snapshotNow, loadState } = require("./hooks/context-budget.js");

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";

const fmt = (n) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

/**
 * Colour tracks the decision, not the magnitude: green while a turn is cheap, yellow once
 * compaction would start paying for itself, red once a plain grep costs what a large edit costs.
 */
function colourFor(tokens) {
  if (tokens >= STOP) return RED;
  if (tokens >= WARN) return YELLOW;
  return GREEN;
}

function render(input) {
  const parts = [];

  const model = input.model && (input.model.display_name || input.model.id);
  if (model) parts.push(`${DIM}${model}${RESET}`);

  let context = null, liveMode = null;
  try {
    const snap = snapshotNow(input.transcript_path);
    context = snap.context;
    liveMode = snap.liveMode;
  } catch { /* fall through to no gauge */ }

  // The session's LIVE permission mode — read from the TRANSCRIPT's `{"type":"mode"}` record, never
  // from the payload's `permission_mode`.
  //
  // This distinction cost three VS Code restarts, two rebuilt instruments and a withdrawn result.
  // `permission_mode` on a payload is the CONFIGURED default from settings.json; the transcript's
  // `mode` record is what the session is ACTUALLY in, cycled by Shift+Tab (normal → acceptEdits →
  // plan) and written to no file. On 2026-08-21 they disagreed for an entire session: 200 records
  // of `mode: normal` — which prompts on every write — against a payload that said `acceptEdits`
  // throughout, because `permissions.defaultMode` was never applied by the VS Code extension.
  //
  // So an instrument built on the payload reports WHAT WAS ASKED FOR, in a bug whose entire nature
  // is that what was asked for did not take. It would have rendered silence and called it agreement.
  // Shown whenever the mode is anything other than acceptEdits, and `normal` is called out by name
  // because it is the one that silently reintroduces a prompt on every edit.
  // THREE states, three renderings — never two renderings for three states, which is the exact
  // defect this whole feature exists to correct. `null` means no `{"type":"mode"}` record fell
  // inside the 512KB tail window, NOT that the mode is fine. Collapsing it into the quiet branch
  // would reproduce the original bug one layer down: silence meaning both "agreement" and "I could
  // not measure", in the one instrument built because silence had meant both. Records run roughly
  // one per twenty lines, so the window almost always holds one — but "almost always" is the
  // reasoning this file rejects everywhere else, and `ctx —` twelve lines below already makes the
  // same distinction for the same reason.
  // REPORTS THE VALUE, PREDICTS NOTHING — and the missing half of that sentence is the finding.
  // This rendered RED with "writes WILL prompt" until 2026-08-21, off a field that turned out to be
  // constant, so it was a permanent false alarm on the one surface that is always visible. Red is a
  // claim about CONSEQUENCE, and the consequence is what is not known: this session ran in
  // `acceptEdits` and a prompt still happened, so "acceptEdits ⇒ no prompts" is already false.
  // Nothing here can be coloured by severity until something can actually detect a prompt.
  // Dim and factual is the whole remit: the human can see the prompt, they just could not see the
  // mode, and that asymmetry is what this exists to close.
  parts.push(`${DIM}perm ${liveMode || "?"}${RESET}`);

  if (context === null || context === undefined) {
    // Nothing measurable yet — a fresh session before its first assistant turn. Saying "0k" would
    // be a claim; saying nothing is the honest state.
    parts.push(`${DIM}ctx —${RESET}`);
  } else {
    const c = colourFor(context);
    const perTurn = fmt(context * CACHE_READ_MULTIPLIER);
    parts.push(`${c}ctx ${fmt(context)}${RESET} ${DIM}~${perTurn}/turn${RESET}`);
    if (context >= STOP) parts.push(`${RED}/compact${RESET}`);
  }

  const state = input.cwd ? loadState(input.cwd) : null;
  if (state) {
    const agents = state.agents ? Object.keys(state.agents).length : 0;
    if (agents > 0) {
      const spend = Object.values(state.agents).reduce((s, a) => s + (a.billable || 0), 0);
      parts.push(`${DIM}${agents} agents ${fmt(spend)}${RESET}`);
    }
  }

  return parts.join(` ${DIM}·${RESET} `);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let line = "";
  try {
    line = render(JSON.parse(raw.replace(/^﻿/, "")));
  } catch {
    line = "";                                          // a blank statusline beats a stack trace
  }
  process.stdout.write(line);
});

module.exports = { render, colourFor, fmt };
