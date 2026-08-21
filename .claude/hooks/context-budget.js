/**
 * .claude/hooks/context-budget.js — UserPromptSubmit annotator that keeps the token budget in view.
 *
 * WHY THIS EXISTS: every turn re-sends the whole conversation, so at 600k of context a one-line
 * `grep` costs the same billable-equivalent as a 200-line file write. Turn count × context size IS
 * the spend; output tokens were ~2% of it. Measured on this repo's own transcript metadata —
 * `cumulativeDroppedTokens: 4,344,909` across three compactions in one session.
 *
 * Compaction is the lever, by a distance. From this repo's own `compactMetadata`:
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
 * TWO AUDIENCES, AND THEY GET DIFFERENT TEXT. The first version shipped a defect here: it put
 * "run /compact" into `additionalContext`, which goes to the MODEL — the one participant that
 * cannot run a slash command. The human, who can, saw nothing.
 *   systemMessage     → the human. The /compact ask, because only they can act on it.
 *   additionalContext → the model. Batching and delegation economics, which only it can act on.
 * An instruction delivered to a party that cannot execute it is indistinguishable from no
 * instruction at all, while looking like a working control.
 *
 * THREE NUMBERS, NEVER SUMMED. They are different units and adding them produces nonsense:
 *   context NOW      a SNAPSHOT — what each turn re-sends. This is what drives the thresholds.
 *   main cumulative  a TOTAL — what this session's turns have cost since tracking began.
 *   agent cumulative a TOTAL — what delegations cost, once each, in their own windows.
 * Delegation is a trade: an agent keeps 50 files out of the main window and pays for its own. The
 * trade is only judgeable if both sides are visible, which is why agent spend is reported at all.
 *
 * WHERE AGENT SPEND ACTUALLY LIVES. Not in the main transcript. Measured on this session: 6,750
 * main turns, ZERO carrying `isSidechain`, despite 32 `Agent` tool calls. Subagent transcripts are
 * separate files under `<transcript-dir>/<sessionId>/subagents/agent-*.jsonl`, each with an
 * `agent-*.meta.json` naming its `agentType`. An earlier version of this hook skipped
 * `isSidechain` lines in the main transcript, which was correct in principle and dead code in
 * practice — it guarded against something that never appears there.
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
const { openSync, readSync, closeSync, statSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");
const { join, dirname, basename } = require("node:path");

// ── thresholds ───────────────────────────────────────────────────────────────────────────────
// WARN sits deliberately BELOW the 300k --autocompact threshold this repo recommends. If the two
// were equal the tier could never fire: compaction would pre-empt its own warning and the text
// would be unreachable.
const WARN = 180_000;
const STOP = 450_000;

// ── pricing ──────────────────────────────────────────────────────────────────────────────────
// Anthropic bills a cache READ at ~10% of the base input rate and a cache WRITE at ~125%. These
// are the published multipliers, not measurements, and they are the only assumption behind every
// number this hook prints — so they are named rather than inlined. If pricing changes, this is the
// one place to edit. A turn's marginal cost is context × CACHE_READ, because the whole conversation
// is re-sent as a cache read on the next turn.
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

// How much of the tail to read for the snapshot. Large enough to contain the last usage line even
// after a run of big tool results; small enough that reading it is free.
const WINDOW = 512 * 1024;

// If the hook has not run for a long stretch the delta can be enormous. Past this, stop pretending
// the cumulative figure is complete and say so, rather than reading hundreds of MB to preserve it.
const MAX_DELTA = 8 * 1024 * 1024;

const STATE_FILE = ".claude/.context-budget.state.json";

/**
 * Read a byte range without loading the file.
 *
 * The version this replaces called readFileSync() and then subarray()'d the tail — so `WINDOW`
 * bounded the PARSING and not the READING. On this repo's own transcript that was a 41.5MB read
 * and allocation on every single prompt: the hook written to police I/O cost was the most
 * I/O-expensive thing in the session.
 */
function readRange(path, start, end) {
  const len = end - start;
  if (len <= 0) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(len);
    const got = readSync(fd, buf, 0, len, start);
    return buf.subarray(0, got).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

const inputTokens = (u) =>
  (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);

/** What a turn actually cost, with each component at its own rate. */
const billable = (u) =>
  (u.input_tokens || 0) +
  (u.cache_creation_input_tokens || 0) * CACHE_WRITE_MULTIPLIER +
  (u.cache_read_input_tokens || 0) * CACHE_READ_MULTIPLIER +
  (u.output_tokens || 0);

function loadState(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, STATE_FILE), "utf8"));
  } catch {
    return null;                                        // absent or corrupt — both mean "start over"
  }
}

function saveState(cwd, state) {
  try {
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    writeFileSync(join(cwd, STATE_FILE), JSON.stringify(state));
  } catch {
    // Losing the state file costs an accurate cumulative, not a working hook.
  }
}

/**
 * Walk the main transcript's tail, returning the snapshot and the cumulative delta.
 *
 * Reads from whichever is EARLIER: the last recorded offset (so nothing is missed for the
 * cumulative) or `size - WINDOW` (so the snapshot always has enough tail to find a usage line).
 * Lines before the recorded offset are parsed for the snapshot but NOT counted again — hence the
 * byte-offset tracking, which is the only way to tell "already counted" from "new".
 *
 * The snapshot rule: scanning BACKWARDS, whichever lands first wins.
 *   compact_boundary → context was just reset; `postTokens` is the new size.
 *   assistant usage  → cache_read + cache_creation + input, i.e. what was actually sent.
 * Reading the usage line alone is wrong in the expensive direction: at prompt-submit time straight
 * after a compaction there is no post-compaction turn yet, so the newest usage line is the PRE-
 * compaction one. That shipped once, reporting 687k to a session that had just been reset to 15k.
 */
function readMain(path, prevOffset) {
  const size = statSync(path).size;
  if (size < prevOffset) prevOffset = 0;                // truncated or replaced — recount

  let start = Math.min(prevOffset, Math.max(0, size - WINDOW));
  let gap = false;
  if (size - start > MAX_DELTA) {                       // too far behind to reconstruct honestly
    start = Math.max(0, size - WINDOW);
    gap = true;
  }

  const text = readRange(path, start, size);
  const lines = text.split("\n");

  const parsed = [];
  let offset = start;
  let addedTokens = 0, addedBillable = 0, addedTurns = 0, sawBoundary = false;

  for (const line of lines) {
    const lineStart = offset;
    offset += Buffer.byteLength(line, "utf8") + 1;      // +1 for the newline that split removed
    if (!line.trim()) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }   // a truncated first line is expected
    parsed.push(j);

    if (lineStart < prevOffset) continue;               // already counted on an earlier run
    if (j.subtype === "compact_boundary") { sawBoundary = true; continue; }
    const u = j.message && j.message.usage;
    if (!u || j.isSidechain) continue;
    addedTurns++;
    addedTokens += inputTokens(u);
    addedBillable += billable(u);
  }

  let context = null;
  for (let i = parsed.length - 1; i >= 0 && context === null; i--) {
    const j = parsed[i];
    if (j.subtype === "compact_boundary") {
      const post = j.compactMetadata && j.compactMetadata.postTokens;
      if (typeof post === "number") context = post;
      continue;
    }
    if (j.isSidechain) continue;
    const u = j.message && j.message.usage;
    if (u) context = inputTokens(u);
  }

  return { context, size, addedTokens, addedBillable, addedTurns, sawBoundary, gap };
}

/**
 * The snapshot alone, with no state read, no state write and no subagent scan.
 *
 * For callers that run FAR more often than once per prompt — the statusline re-renders on a timer,
 * so it must not scan 54 subagent files or rewrite the state file each time. Passing an offset
 * beyond any real file size forces `start` to `size - WINDOW`: one stat and one positioned read.
 * The statusline reads cumulative figures from the state file the hook already maintains, so there
 * is exactly one writer.
 */
function contextNow(transcriptPath) {
  return readMain(transcriptPath, Number.MAX_SAFE_INTEGER).context;
}

/**
 * Sum every subagent transcript, reading only what has grown since last time.
 *
 * Finished agents never grow, so on a steady-state prompt this stats N files and reads none of
 * them. Invocations are counted from the `.meta.json` sidecars rather than from turns — counting
 * turns would report "300 agents" for 27 delegations.
 */
function readAgents(transcriptPath, prev) {
  const dir = join(dirname(transcriptPath), basename(transcriptPath).replace(/\.jsonl$/, ""), "subagents");
  const files = prev && typeof prev === "object" ? { ...prev } : {};
  const out = { files, tokens: 0, billableTotal: 0, invocations: 0, types: {} };
  if (!existsSync(dir)) return out;

  let entries;
  try { entries = readdirSync(dir); } catch { return out; }

  for (const name of entries) {
    if (name.endsWith(".meta.json")) {
      out.invocations++;
      try {
        const meta = JSON.parse(readFileSync(join(dir, name), "utf8"));
        const t = meta.agentType || "unknown";
        out.types[t] = (out.types[t] || 0) + 1;
      } catch { /* a half-written sidecar still counts as an invocation */ }
      continue;
    }
    if (!name.endsWith(".jsonl")) continue;

    let size;
    try { size = statSync(join(dir, name)).size; } catch { continue; }
    const rec = files[name] || { offset: 0, tokens: 0, billable: 0 };
    if (size > rec.offset) {                            // only growing files are read at all
      const text = readRange(join(dir, name), rec.offset, size);
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let j;
        try { j = JSON.parse(line); } catch { continue; }
        const u = j.message && j.message.usage;
        if (!u) continue;
        rec.tokens += inputTokens(u);
        rec.billable += billable(u);
      }
      rec.offset = size;
      files[name] = rec;
    }
    out.tokens += rec.tokens;
    out.billableTotal += rec.billable;
  }
  return out;
}

/**
 * Everything the advice needs, and the state to persist.
 *
 * Session identity is the transcript PATH, not an inode. `fs.Stats.ino` is documented as "not
 * always available" on Windows and is commonly 0 there, so an inode comparison would either always
 * match (0 === 0, never resetting on a genuinely new file) or always differ. Path plus a
 * size-went-backwards check covers both real cases: a new session gets a new path, and a truncated
 * or rewritten file is caught by `size < prevOffset` in readMain.
 */
function measure(transcriptPath, cwd) {
  const prev = cwd ? loadState(cwd) : null;
  const fresh = !prev || prev.transcript !== transcriptPath;

  const size = statSync(transcriptPath).size;
  // First sight of a session starts counting from the tail, never from byte 0 — reconstructing a
  // 41MB history would be exactly the unbounded read this hook exists to avoid. Cumulative is
  // labelled "since tracking began" whenever that start point was not the beginning.
  const prevOffset = fresh ? Math.max(0, size - WINDOW) : (prev.main.offset || 0);
  const main = readMain(transcriptPath, prevOffset);
  const agents = readAgents(transcriptPath, fresh ? null : prev.agents);

  const prevMain = fresh ? { tokens: 0, billable: 0, turns: 0, sinceCompact: 0 } : prev.main;
  const state = {
    transcript: transcriptPath,
    main: {
      offset: main.size,
      tokens: (prevMain.tokens || 0) + main.addedTokens,
      billable: (prevMain.billable || 0) + main.addedBillable,
      turns: (prevMain.turns || 0) + main.addedTurns,
      sinceCompact: main.sawBoundary ? main.addedBillable : (prevMain.sinceCompact || 0) + main.addedBillable,
      partial: fresh ? prevOffset > 0 : Boolean(prevMain.partial || main.gap),
    },
    agents: agents.files,
  };
  if (cwd) saveState(cwd, state);

  return {
    context: main.context,
    mainBillable: state.main.billable,
    mainTurns: state.main.turns,
    mainPartial: state.main.partial,
    agentBillable: agents.billableTotal,
    agentInvocations: agents.invocations,
    agentTypes: agents.types,
  };
}

/**
 * Scale to k or M. Cumulative agent spend reaches tens of millions, and the first live run of this
 * hook printed "~55687k billable-equivalent" — technically correct and unreadable at a glance,
 * which defeats the point of a figure whose only job is to inform a decision in passing.
 */
const k = (n) => (n >= 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

/**
 * For the HUMAN. Only they can run /compact, so only they are told to.
 * Silent below WARN — a message that always fires is wallpaper. The MODEL channel does emit a bare
 * figure down there (see adviseAgent); the user has the statusline for the same number, so the
 * observability that tier buys is already theirs.
 */
function adviseUser(m) {
  if (!m || m.context === null || m.context < WARN) return null;
  const perTurn = k(m.context * CACHE_READ_MULTIPLIER);
  const since = m.mainPartial ? " since tracking began" : "";
  const spend = `Session${since}: ~${k(m.mainBillable)} billable-equivalent over ${m.mainTurns} turns`
    + (m.agentInvocations ? `, plus ~${k(m.agentBillable)} across ${m.agentInvocations} agents.` : ".");

  if (m.context >= STOP) {
    return `⚠ CONTEXT ${k(m.context)} — ~${perTurn} billable-equivalent per turn before any work happens. `
      + `Run /compact if this starts a new task: measured on this repo, compaction resets 1,001,754 `
      + `tokens to 16,754. To stop doing it by hand, start with --autocompact 300000 (accepts 100k-1M; `
      + `the default fires at ~1M). ${spend}`;
  }
  return `Context ${k(m.context)} (~${perTurn} billable-equivalent per turn, whatever the turn does). `
    + `New task → /compact. Persistent fix: start with --autocompact 300000. ${spend}`;
}

/**
 * For the MODEL. It cannot run /compact, so telling it to is noise that costs tokens to deliver.
 * Batching and delegation are the levers it can actually pull — and delegation needs its running
 * cost visible, or "spawn an agent" looks free at the point of decision.
 *
 * Three tiers, not two: a bare `ctx 47k` below WARN, the batching advice at WARN, the urgency line
 * at STOP. The bare tier exists so a working hook is DISTINGUISHABLE from an absent one.
 */
function adviseAgent(m) {
  if (!m || m.context === null) return null;

  // BELOW WARN: the bare figure, no advice. Silence was ambiguous in the direction that matters —
  // below-threshold, hook-not-registered and crashed-and-failed-silent all produced byte-identical
  // output, so "the hook is working" was not observable from inside the conversation at all. The
  // fail-silent path a few lines down is what makes that ambiguity reachable, and it is worth
  // keeping; ~10 tokens a turn is the whole price of telling the three cases apart. `null` still
  // means UNMEASURABLE, which is now a distinct signal rather than the same silence.
  if (m.context < WARN) return `ctx ${k(m.context)}`;

  const perTurn = k(m.context * CACHE_READ_MULTIPLIER);
  const urgency = m.context >= STOP ? "A plain grep now costs the same as a large edit. " : "";
  const delegation = m.agentInvocations
    ? `Agents so far: ${m.agentInvocations} invocations, ~${k(m.agentBillable)} billable-equivalent. `
      + `Delegation wins only when the agent READS a lot and RETURNS a little — an agent that reads `
      + `three files and returns a long report costs more than doing it inline. `
    : "";
  return `Context ${k(m.context)}, ~${perTurn} billable-equivalent per turn. ${urgency}`
    + `Batch aggressively: independent reads, greps and writes go in ONE message, not one per turn. `
    + `Pipe long command output. ${delegation}`
    + `Do not suggest /compact — you cannot run it and the user has already been told separately.`;
}

// Only consume stdin when this file IS the process. `.claude/statusline.js` requires it as a
// library, and without this guard that require would register a stdin handler which then prints the
// hook's JSON onto the statusline's stdout — corrupting the status bar with a hook payload. The
// same collision made this hook's own RSS probe pass vacuously before it was caught, so the
// failure mode is demonstrated rather than hypothetical.
if (require.main === module) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    let additionalContext = "";
    let systemMessage = null;
    try {
      const input = JSON.parse(raw.replace(/^﻿/, ""));
      if (input.transcript_path) {
        const m = measure(input.transcript_path, input.cwd);
        additionalContext = adviseAgent(m) ?? "";
        systemMessage = adviseUser(m);
      }
      // The session's LIVE permission mode, reported to the MODEL because it cannot observe one.
      // A session-level mode outranks permissions.defaultMode and is written to no file, so from
      // inside a turn "allowed", "prompted" and "mode-overridden" are indistinguishable. The
      // statusline carries this too, but a statusline is not rendered on every surface — measured
      // 2026-08-21, the VS Code panel shows none, which is the same invisibility this hook's own
      // header describes one participant over. Reported ONLY on disagreement with settings.json;
      // silence is a positive claim that settings won.
      // ONLY on disagreement. The always-on tier has a hard size budget (its own probe caps it at
      // 92 chars) and two more probes require EMPTY output when there is nothing to say, so a line
      // on every turn would make this the wallpaper the file was written to replace. Agreement and
      // an absent field are both silent here; presence of the field is settled out of band rather
      // than by spending the budget on a permanent line.
      // The hook payload spells this `permission_mode`; the statusline payload has used
      // `permissionMode`. Read BOTH — a key typo here is indistinguishable from agreement, and the
      // first cut of this line read only the camelCase spelling and reported silence for two turns.
      const mode = input.permission_mode || input.permissionMode;
      if (mode && mode !== "acceptEdits") {
        additionalContext += `${additionalContext ? "\n" : ""}[perm] ${mode} overrides defaultMode acceptEdits`;
      }
    } catch {
      // A hook that cannot measure must not guess, and must not block: this one only ever ADDS a
      // line, so failing silent costs a missed reminder rather than a stalled session.
    }

    const out = { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext } };
    if (systemMessage) out.systemMessage = systemMessage;
    process.stdout.write(JSON.stringify(out));
  });
}

module.exports = {
  adviseUser, adviseAgent, measure, readMain, readAgents, readRange, contextNow, loadState,
  WARN, STOP, CACHE_READ_MULTIPLIER, CACHE_WRITE_MULTIPLIER, STATE_FILE,
};
