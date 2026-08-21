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
 * The stdin payload has carried `permissionMode` all along beside `model` and `transcript_path`;
 * this file used two of the three and discarded the one that settles it. Three VS Code restarts and
 * a hook-sentinel probe were spent searching files for a variable that was never in a file. The
 * participant who is the only one able to CHANGE the mode was structurally unable to SEE it.
 *
 * FAILS TO A PLAIN LINE, NEVER TO AN ERROR. A statusline that throws renders its stack trace into
 * the UI on every frame.
 */
const { WARN, STOP, CACHE_READ_MULTIPLIER, contextNow, loadState } = require("./hooks/context-budget.js");

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

  // The session's LIVE permission mode, which outranks `permissions.defaultMode` in settings.json
  // and lives in no file — it is a CLI arg or a UI selection. Shown only when it disagrees with
  // what this project's settings ask for, so the common case stays quiet and a disagreement is
  // loud. Silence here is a positive claim that settings won.
  // Both spellings: the hook payload uses `permission_mode`, the statusline payload `permissionMode`.
  // Reading one only is a silent miss — undefined and "agrees with settings" render identically.
  const mode = input.permission_mode || input.permissionMode;
  if (mode && mode !== "acceptEdits") {
    parts.push(`${YELLOW}perm ${mode}${RESET}`);
  }

  let context = null;
  try { context = contextNow(input.transcript_path); } catch { /* fall through to no gauge */ }

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
