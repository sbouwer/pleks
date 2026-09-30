#!/usr/bin/env node
/**
 * scripts/agent-distribution.mjs — what agents actually cost, per type, against their budgets.
 *
 * @kit agent-distribution v2 — tracked OUTSIDE its `KIT:CONFIG` region. Edit it in dev-standards and
 * re-adopt; a local change outside the region is a fork, and `check-kit-drift.mjs` will say so.
 *
 * PORTED FROM `pleks/scripts/agent-distribution.mjs` (pleks M-062), where it was written and run
 * first. The turn budget in every spine is UNENFORCEABLE: an agent has no reliable turn counter, it
 * estimates. So the mechanisable half is not enforcement but VISIBILITY — an overrun surfaces as a
 * report rather than sitting in a transcript nobody opens (L-22). It is also the instrument the
 * re-measure trigger in standards/AGENT-SPINES depends on: without a command to produce the second
 * distribution, that trigger is a pending.
 *
 * BUDGETS ARE READ FROM ONE MARKER PER AGENT FILE, never from prose and never from a copy here:
 *
 *     <!-- BUDGETS:walker v1 · turns 150 · return contract · artefact 6k -->
 *
 * Canon's spine file carries it beside its FRONTMATTER block, outside the SPINE region, so a budget
 * change is not a spine bump; `tools/propagate-spines.mjs` writes it into each project's agent file,
 * and `check-agent-spines` holds canon's marker equal to the budget clauses in the spine's own text.
 * The pleks version parsed the prose, and prose parsing measured a false zero for a year: grounder's
 * return budget was spelled a way the pattern did not read, its ceiling came back null, and null
 * rendered as "0 overruns" — the agent with the largest reports in the fleet carried a clean column.
 * A marker has one spelling, and a file with none says `absent` rather than a number.
 *
 * An agent that may spawn children adds `· width N`, its fan-out cap per run (census: 4).
 *
 * `return` is one of two forms and they are not interchangeable:
 *   return contract — the reply is the five-line contract block and nothing else; the work is in the
 *                     artefact. A reply larger than the block is the inline answer the handoff
 *                     protocol exists to stop, and is counted against a ceiling set in KIT:CONFIG.
 *   return Nk       — a token ceiling on the reply itself (crawler-doctrine, whose stdout is JSON).
 * `artefact Nk` governs the FILE on disk, read by a machine, and is never compared to the reply.
 *
 * EACH TYPE'S GENERATION IS DATED FROM GIT, per type. The trigger asks for runs UNDER THE CURRENT
 * BUDGETS; counting every run in the transcript tree answers a different question in the dangerous
 * direction (pleks's first live run reported the trigger MET on 27 runs that all predated the
 * budgets). pleks dated the generation by the newest agent file's mtime, which any edit to any
 * agent file moves, and which a fresh clone sets to the clone time. Here a type's generation is the
 * commit time of the commit that introduced its current marker line. A marker git does not hold at
 * HEAD — uncommitted, or no repository — dates nothing, and that type is left out of the trigger by
 * name rather than counted as current.
 *
 * FAN-OUT WIDTH IS COUNTED PER PARENT RUN — yoros's addition (yoros a5f26fa, its M-009), taken
 * into canon before any project adopted this row. pleks reported spawn EDGES per type and then
 * warned that width is per parent run: twelve children across four parents averaged three each,
 * which is not the claim "no parent exceeded three". yoros computed it instead of cautioning about
 * it — each child is keyed to the run id of the parent whose transcript holds its spawning call, and
 * a parent over its type's `width` is named. It REPORTS, it does not fail: a width exceeded once is
 * a fact worth seeing, not a build worth breaking. yoros read the cap from the census spine's
 * sentence; here it is the marker's `width`, which check-agent-spines holds equal to that sentence.
 *
 * v2 (2026-09-30), from the first two adoptions. yoros 236a8a4: v1 dropped the sentence yoros's own
 * copy printed when nothing fanned out — "the cap is untested rather than respected" — so a report
 * with no fan-out read as a cap holding. It is back, per capped type. And RECORD's default named
 * pleks's `docs/EXPERIMENTS.md E4`, a file neither life-therapy nor yoros has; both overrode it on
 * adoption. The default is now empty, and a MET trigger with no RECORD says so.
 *
 * NOT ON THE GATE. It reads the live transcript tree under ~/.claude/projects, which no CI runner
 * has. Its `--selftest` IS on the gate: the probes are hermetic, plus one KNOWN-GOOD read of the real
 * agent files, so the script is verified even where the measurement cannot be.
 *
 * Usage:
 *   node scripts/agent-distribution.mjs                          this project's transcripts
 *   node scripts/agent-distribution.mjs --root <dir> [--root …]  explicit projects/<slug> directories;
 *                                                                repeatable, runs seen twice count once
 *   node scripts/agent-distribution.mjs --agents <dir>           read budgets from another directory
 *   node scripts/agent-distribution.mjs --selftest [--agents <dir>]
 */
import { readdirSync, readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/* KIT:CONFIG measure — yours */
/**
 * Where this project keeps its agent files, how many top-level runs under the current budgets make a
 * second distribution worth recording, where that record goes, and the largest reply that still
 * reads as a contract block. The block is five labelled lines and a one-to-three-sentence Summary,
 * about 100–150 tokens; a reply several times that is an answer returned inline.
 */
const AGENTS_DIR = ".claude/agents";
const TRIGGER = 20;
const RECORD = "docs/EXPERIMENTS.md E4";
const CONTRACT_REPLY_MAX_TOKENS = 400;
/* KIT:CONFIG /measure */

const CHARS_PER_TOKEN = 4; // rough, and only ever used for the RETURNED reply

/** Claude Code names a project's transcript directory by replacing `:`, `\` and `/` with `-`. */
export function slugFor(cwd) {
  return cwd.toLowerCase().replace(/[:\\/]/g, "-");
}

/**
 * The BUDGETS marker for `agent` in `text`: the parsed values, `null` when the file carries none, or
 * `{ error }` when it carries one this grammar does not read. Malformed is not absent: a marker
 * someone wrote and got wrong must not read as a file that never declared a budget.
 */
export function budgetsMarker(text, agent) {
  const at = text.indexOf(`<!-- BUDGETS:${agent} `);
  if (at < 0) return null;
  const end = text.indexOf("-->", at);
  const line = end < 0 ? text.slice(at, at + 200) : text.slice(at, end + 3);
  const m = /^<!-- BUDGETS:([a-z-]+) v(\d+) · turns (\d+) · return (contract|\d+k) · artefact (\d+k|none)(?: · width (\d+))? -->$/.exec(line);
  if (!m || m[1] !== agent) {
    return { error: `malformed BUDGETS marker: "${line}" — the form is <!-- BUDGETS:${agent} vN · turns N · return contract|Nk · artefact Nk|none[ · width N] -->` };
  }
  return {
    line,
    version: Number(m[2]),
    turns: Number(m[3]),
    returnForm: m[4] === "contract" ? "contract" : "numeric",
    returnK: m[4] === "contract" ? null : Number(m[4].slice(0, -1)),
    artefactK: m[5] === "none" ? null : Number(m[5].slice(0, -1)),
    width: m[6] === undefined ? null : Number(m[6]),
  };
}

/** The agent type a file in the agents directory describes. Canon's spine files end `.spine.md`. */
export function typeOf(file) {
  return file.replace(/\.spine\.md$/, "").replace(/\.md$/, "");
}

/**
 * Budgets for every agent file in `agentsDir`, keyed by type. Each entry says which of three states
 * it is in, because they have different owners:
 *   marker     — parsed; the budget is what it says
 *   absent     — a file with no marker. `spined` says whether it carries a canon SPINE: if so, the
 *                marker was never propagated (run propagate-spines); if not, it is a local agent
 *                canon never budgeted
 *   malformed  — a marker this grammar cannot read; `error` says how
 * A type with no file at all is not here: a built-in the harness supplies (Explore, Plan).
 */
export function budgetsFrom(agentsDir) {
  const out = {};
  if (!existsSync(agentsDir)) return out;
  for (const f of readdirSync(agentsDir).filter((n) => n.endsWith(".md"))) {
    const type = typeOf(f);
    const text = readFileSync(join(agentsDir, f), "utf8");
    const m = budgetsMarker(text, type);
    if (m === null) out[type] = { state: "absent", file: f, spined: text.includes(`<!-- SPINE:${type} v`) };
    else if (m.error) out[type] = { state: "malformed", file: f, error: m.error };
    else out[type] = { state: "marker", file: f, ...m };
  }
  return out;
}

/**
 * When `file`'s current marker `line` entered this repository's history, in ms — or null when git
 * cannot say: not a repository, the line not at HEAD (an uncommitted marker dates nothing), or no
 * commit introducing it. `git log -S` finds the commits that changed how often the string occurs,
 * and the newest of them, with the string at HEAD, is the one that added it.
 */
export function generationOf(agentsDir, file, line) {
  const git = (...args) => spawnSync("git", ["-C", agentsDir, ...args], { encoding: "utf8", timeout: 20_000 });
  const top = git("rev-parse", "--show-prefix");
  if (top.status !== 0) return null;
  const rel = `${top.stdout.trim()}${file}`;
  const head = git("show", `HEAD:${rel}`);
  if (head.status !== 0 || !head.stdout.includes(line)) return null;
  const log = git("log", "-1", "--format=%ct", `-S${line}`, "--", file);
  const s = Number(log.stdout.trim());
  return log.status === 0 && s > 0 ? s * 1000 : null;
}

/** Every tool-use id a transcript mentions. The parent edge is recovered from these — see collect(). */
const TOOL_USE_ID = /toolu_[A-Za-z0-9_-]+/g;

/** One subagent run: how many turns it took, and how large the reply it handed back was. */
export function measureRun(jsonlPath) {
  let turns = 0;
  let peak = 0;
  let lastReport = 0;
  let compacted = false;
  const text = readFileSync(jsonlPath, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      continue;
    }
    if (j.subtype === "compact_boundary") compacted = true;
    const u = j.message?.usage;
    if (u) {
      turns++;
      const ctx = (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.input_tokens || 0);
      if (ctx > peak) peak = ctx;
    }
    // The LAST assistant text is the reply handed back — the only part that becomes permanent
    // weight in the caller's window. Intermediate output is not returned.
    const content = j.message?.content;
    if (j.message?.role === "assistant" && Array.isArray(content)) {
      const t = content.filter((c) => c.type === "text").map((c) => c.text || "").join("");
      if (t.trim()) lastReport = Math.round(t.length / CHARS_PER_TOKEN);
    }
  }
  return { turns, peak, report: lastReport, compacted, toolUseIds: new Set(text.match(TOOL_USE_ID) || []) };
}

/** The runs under one projects/<slug> directory, measured, with depth and spawning tool-use id. */
function runsUnder(projectDir) {
  const runs = [];
  if (!existsSync(projectDir)) return runs;
  for (const session of readdirSync(projectDir)) {
    const sub = join(projectDir, session, "subagents");
    if (!existsSync(sub)) continue;
    for (const f of readdirSync(sub).filter((n) => n.endsWith(".jsonl"))) {
      const id = f.replace(/^agent-/, "").replace(/\.jsonl$/, "");
      let type = "unknown";
      let depth = 1;
      let toolUseId = null;
      const meta = join(sub, `agent-${id}.meta.json`);
      if (existsSync(meta)) {
        try {
          const j = JSON.parse(readFileSync(meta, "utf8"));
          type = j.agentType || "unknown";
          // spawnDepth: 1 for a run the main session asked for, 2+ for one another agent asked
          // for. ABSENT means a sidecar written before nesting existed, which can only be top-level.
          depth = Number(j.spawnDepth) || 1;
          toolUseId = j.toolUseId || null;
        } catch {
          /* keep defaults */
        }
      }
      let m;
      try {
        m = measureRun(join(sub, f));
      } catch {
        continue;
      }
      let mtime = 0;
      try {
        mtime = statSync(join(sub, f)).mtimeMs;
      } catch {
        /* unknown age */
      }
      runs.push({ ...m, session, id, mtime, depth, toolUseId, type });
    }
  }
  return runs;
}

/**
 * Every subagent run under one or more projects/<slug> directories, grouped by agentType — with its
 * DEPTH and its PARENT.
 *
 * SEVERAL ROOTS because one project can have several: a repo moved between drives, or worked from
 * two checkouts, is two slugs and two transcript directories. A run seen under two roots (the same
 * session and agent id) is counted once.
 *
 * Depth and parent matter the moment an agent may spawn an agent. A nested fan-out arrives here as
 * "more runs of a type", so a per-type median silently describes two populations and the trigger
 * fires on inflated counts. Depth separates them; the parent says WHO fanned out.
 */
export function collect(projectDirs) {
  const seen = new Set();
  const runs = [];
  for (const dir of [projectDirs].flat()) {
    for (const r of runsUnder(dir)) {
      const key = `${r.session}/${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      runs.push(r);
    }
  }
  // Parent by CONTAINMENT: `toolUseId` is the id of the Agent call that created this run, so its
  // parent is whichever transcript holds that id. A run is never its own parent.
  // `parentId` is the owner's run id: a width cap is per PARENT RUN, and only the id can tell one
  // census spawning twelve from four censuses spawning three each (yoros M-009).
  for (const r of runs) {
    r.parent = "main";
    r.parentId = null;
    if (!r.toolUseId) continue;
    const owner = runs.find((o) => o.id !== r.id && o.toolUseIds.has(r.toolUseId));
    if (owner) {
      r.parent = owner.type;
      r.parentId = `${owner.session}/${owner.id}`;
    }
  }
  const byType = new Map();
  for (const r of runs) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type).push(r);
  }
  return byType;
}

/**
 * How many children each PARENT RUN spawned, widest first. Runs the main session asked for are not
 * counted: main has no width cap, and folding it in would make every busy session a runaway fan-out.
 */
export function widthByParent(byType) {
  const width = new Map();
  for (const runs of byType.values()) {
    for (const r of runs) {
      if (!r.parentId) continue;
      const at = width.get(r.parentId) ?? { parentId: r.parentId, parent: r.parent, children: 0 };
      at.children += 1;
      width.set(r.parentId, at);
    }
  }
  return [...width.values()].sort((a, b) => b.children - a.children);
}

/**
 * Each parent run judged against ITS type's `width`. `over` names the parents past their cap;
 * `uncapped` names the parent types with no width to judge by — an unknown cap is not a pass, so
 * the caller must say so rather than print a clean line.
 */
export function overWidth(width, budgets) {
  const over = [];
  const uncapped = new Set();
  for (const w of width) {
    const cap = budgets[w.parent]?.state === "marker" ? budgets[w.parent].width : null;
    if (cap === null) uncapped.add(w.parent);
    else if (w.children > cap) over.push({ ...w, cap });
  }
  return { over, uncapped: [...uncapped].sort() };
}

/**
 * The types that carry a `width` but have no parent run in `width` — their cap has never been
 * exercised. yoros's first live run printed this and v1 of the port dropped it (yoros 236a8a4): with no
 * fan-out, "no parent exceeded its cap" is vacuously true, and a report that prints nothing about the
 * cap reads as the cap holding. Untested is a different claim from respected.
 */
export function untestedCaps(width, budgets) {
  const exercised = new Set(width.map((w) => w.parent));
  return Object.entries(budgets)
    .filter(([type, b]) => b.state === "marker" && b.width !== null && b.width !== undefined && !exercised.has(type))
    .map(([type, b]) => ({ type, cap: b.width }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

const med = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const max = (a) => (a.length ? Math.max(...a) : 0);

/**
 * How many runs postdate a generation boundary. A run whose mtime could not be read counts as OLD:
 * the trigger must never fire on evidence it cannot date. `depth` filters to one layer of the spawn
 * tree; the trigger passes 1, because one ask that fans out to six is one ask.
 */
export function runsSince(runs, since, { depth } = {}) {
  let n = 0;
  for (const r of runs) {
    if (depth !== undefined && (r.depth ?? 1) !== depth) continue;
    if (r.mtime && r.mtime >= since) n++;
  }
  return n;
}

/**
 * The trigger count: top-level runs under each type's current budgets, summed over the types whose
 * generation git could date. `undated` names every budgeted type it could not, so a partial count is
 * never read as the whole.
 */
export function triggerCount(byType, generations) {
  let n = 0;
  const undated = [];
  const perType = {};
  for (const [type, runs] of byType) {
    if (!(type in generations)) continue;
    const g = generations[type];
    if (g === null) {
      undated.push(type);
      continue;
    }
    perType[type] = runsSince(runs, g, { depth: 1 });
    n += perType[type];
  }
  return { n, undated: undated.sort(), perType };
}

export function report(byType, budgets) {
  const rows = [];
  for (const [type, runs] of byType) {
    const turns = runs.map((r) => r.turns);
    const reports = runs.map((r) => r.report);
    const nestedRuns = runs.filter((r) => (r.depth ?? 1) > 1);
    const b = budgets[type];
    const marked = b?.state === "marker";
    // The reply ceiling, in tokens, whichever form the budget takes; null when there is none to read.
    let replyMax = null;
    if (marked) replyMax = b.returnForm === "contract" ? CONTRACT_REPLY_MAX_TOKENS : b.returnK * 1000;
    rows.push({
      type,
      runs: runs.length,
      turnMed: med(turns),
      turnMax: max(turns),
      repMed: med(reports),
      repMax: max(reports),
      nested: nestedRuns.length,
      maxDepth: max(runs.map((r) => r.depth ?? 1)),
      nestedTurnMed: med(nestedRuns.map((r) => r.turns)),
      nestedTurnMax: max(nestedRuns.map((r) => r.turns)),
      nestedRepMed: med(nestedRuns.map((r) => r.report)),
      nestedRepMax: max(nestedRuns.map((r) => r.report)),
      spawnedBy: [...new Set(runs.map((r) => r.parent || "main"))].sort(),
      // `no-spine`: no agent file at all, so a built-in the harness supplies — cost still counts,
      // but no budget is expected of it, and demanding one raises a finding nobody here can action.
      budgetState: b ? b.state : "no-spine",
      spined: b?.spined ?? false,
      error: b?.error ?? null,
      budgetTurns: marked ? b.turns : null,
      returnForm: marked ? b.returnForm : null,
      returnK: marked ? b.returnK : null,
      artefactK: marked ? b.artefactK : null,
      // NULL, not 0, when there is nothing to compare against. `0` is a measurement — "checked, and
      // none" — and a null budget rendering as that is the defect this marker exists to close.
      turnOverruns: marked ? turns.filter((t) => t > b.turns).length : null,
      replyOverruns: replyMax === null ? null : reports.filter((r) => r > replyMax).length,
      compacted: runs.filter((r) => r.compacted).length,
      peakMax: max(runs.map((r) => r.peak)),
    });
  }
  return rows.sort((a, b) => b.turnMax - a.turnMax);
}

// ── argv ─────────────────────────────────────────────────────────────────────────────────────
/** Every value following `flag` in `argv`, in order. */
export function flagValues(argv, flag) {
  const out = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) out.push(argv[i + 1]);
  });
  return out;
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const agentsArg = flagValues(argv, "--agents")[0];
const agentsDir = resolve(agentsArg ?? AGENTS_DIR);

// ── probes ───────────────────────────────────────────────────────────────────────────────────
if (isEntry && argv.includes("--selftest")) {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "agentdist-"));
  let failed = 0;
  const ok = (c, label, detail = "") => {
    if (!c) failed++;
    console.log(`  ${c ? "✓" : "✗"} ${label}${c ? "" : `\n      ${detail}`}`);
  };

  ok(slugFor(String.raw`c:\dev\pleks`) === "c--dev-pleks", "slugFor matches Claude Code's project-directory naming", slugFor(String.raw`c:\dev\pleks`));

  // ── the marker grammar ──
  {
    const W = "<!-- BUDGETS:walker v1 · turns 150 · return contract · artefact 6k -->";
    const w = budgetsMarker(`---\nx: y\n---\n\n${W}\n\n<!-- SPINE:walker v9 -->`, "walker");
    ok(w?.turns === 150 && w.returnForm === "contract" && w.returnK === null && w.artefactK === 6 && w.version === 1,
      "reads turns, a CONTRACT return and the artefact budget off one marker", JSON.stringify(w));
    const c = budgetsMarker("<!-- BUDGETS:crawler-doctrine v2 · turns 150 · return 4k · artefact none -->", "crawler-doctrine");
    ok(c?.returnForm === "numeric" && c.returnK === 4 && c.artefactK === null && c.version === 2,
      "reads a NUMERIC return ceiling, and `artefact none` as no artefact budget", JSON.stringify(c));
    ok(budgetsMarker("**Turn budget: 150 — a backstop.** **Artefact budget: 6k tokens.**", "walker") === null,
      "prose budget clauses are NOT read — the marker is the one spelling, and a file without it is absent");
    ok(w.width === null, "a marker with no `width` has no fan-out cap — null, never a default");
    const cw = budgetsMarker("<!-- BUDGETS:census v1 · turns 150 · return contract · artefact 4k · width 4 -->", "census");
    ok(cw?.width === 4 && cw.artefactK === 4, "reads the optional `width` — the fan-out cap per run", JSON.stringify(cw));
    ok(budgetsMarker(W, "census") === null, "another agent's marker is not this agent's budget");
    ok(budgetsMarker(W.replace("turns 150", "turns lots"), "walker")?.error?.includes("malformed"),
      "a marker this grammar cannot read is MALFORMED, not absent — someone wrote it and got it wrong");
    ok(budgetsMarker(W.replace(" -->", ""), "walker")?.error !== undefined, "…and so is an unclosed one");
  }

  // ── budgets from a directory: the three states ──
  {
    const d = join(tmp, "agents");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "walker.md"), "<!-- BUDGETS:walker v1 · turns 150 · return contract · artefact 6k -->\n<!-- SPINE:walker v9 -->\n");
    writeFileSync(join(d, "census.spine.md"), "<!-- BUDGETS:census v1 · turns 150 · return contract · artefact 4k -->\n<!-- SPINE:census v11 -->\n");
    writeFileSync(join(d, "grounder.md"), "<!-- SPINE:grounder v8 -->\n**Turn budget: 150**\n");
    writeFileSync(join(d, "local.md"), "a project's own agent, no spine\n");
    writeFileSync(join(d, "broken.md"), "<!-- BUDGETS:broken v1 · turns 9 -->\n");
    writeFileSync(join(d, "notes.txt"), "<!-- BUDGETS:notes v1 · turns 1 · return contract · artefact 1k -->\n");
    const b = budgetsFrom(d);
    ok(b.walker?.state === "marker" && b.walker.turns === 150, "a marked agent file yields its budget", JSON.stringify(b.walker));
    ok(b.census?.state === "marker" && b.census.artefactK === 4, "a canon `<type>.spine.md` is keyed by its type, not `census.spine`", JSON.stringify(Object.keys(b)));
    ok(b.grounder?.state === "absent" && b.grounder.spined === true,
      "a spined file with no marker is ABSENT and SPINED — the marker was never propagated", JSON.stringify(b.grounder));
    ok(b.local?.state === "absent" && b.local.spined === false, "a local agent with no spine is absent and says so", JSON.stringify(b.local));
    ok(b.broken?.state === "malformed", "a malformed marker is its own state", JSON.stringify(b.broken));
    ok(!("notes" in b), "a non-.md file contributes nothing");
    ok(Object.keys(budgetsFrom(join(tmp, "nope"))).length === 0, "a missing agents dir yields no budgets rather than throwing");
  }

  // ── the generation boundary, from git ──
  {
    const g = join(tmp, "repo");
    const agents = join(g, ".claude", "agents");
    mkdirSync(agents, { recursive: true });
    const git = (...args) => spawnSync("git", ["-C", g, ...args], {
      encoding: "utf8",
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-01T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-01T00:00:00Z" },
    });
    const V1 = "<!-- BUDGETS:walker v1 · turns 150 · return contract · artefact 6k -->";
    const V2 = "<!-- BUDGETS:walker v2 · turns 120 · return contract · artefact 6k -->";
    git("init", "-q");
    git("config", "user.email", "probe@example.invalid");
    git("config", "user.name", "probe");
    writeFileSync(join(agents, "walker.md"), "---\nname: walker\n---\n");
    git("add", "-A");
    git("commit", "-qm", "agent file, no marker");
    writeFileSync(join(agents, "walker.md"), `---\nname: walker\n---\n${V1}\n`);
    git("add", "-A");
    spawnSync("git", ["-C", g, "commit", "-qm", "marker v1"], {
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-10T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-10T00:00:00Z" },
    });
    writeFileSync(join(agents, "walker.md"), `---\nname: walker\n---\n${V1}\nsurface edited later\n`);
    git("add", "-A");
    spawnSync("git", ["-C", g, "commit", "-qm", "surface edit"], {
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-20T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-20T00:00:00Z" },
    });
    const when = generationOf(agents, "walker.md", V1);
    ok(when === Date.parse("2026-09-10T00:00:00Z"),
      "a type's generation is the commit that INTRODUCED its marker — not the file's last edit, not its mtime",
      when === null ? "null" : new Date(when).toISOString());
    writeFileSync(join(agents, "walker.md"), `---\nname: walker\n---\n${V2}\n`);
    ok(generationOf(agents, "walker.md", V2) === null, "an UNCOMMITTED marker dates nothing — null, never the clone or edit time");
    git("add", "-A");
    spawnSync("git", ["-C", g, "commit", "-qm", "marker v2"], {
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-09-25T00:00:00Z", GIT_COMMITTER_DATE: "2026-09-25T00:00:00Z" },
    });
    writeFileSync(join(agents, "walker.md"), `---\nname: walker\n---\n${V1}\n`);
    ok(generationOf(agents, "walker.md", V1) === null,
      "a marker REVERTED in the working tree is not dated by the commit that removed it — HEAD must hold the line");
    ok(generationOf(join(tmp, "agents"), "walker.md", V1) === null, "outside a repository the generation is unknown");
  }

  /** A synthetic transcript tree shaped the way Claude Code writes one. */
  const session = (name, agents, sess = "sess-1") => {
    const sub = join(tmp, name, sess, "subagents");
    mkdirSync(sub, { recursive: true });
    for (const [id, { type, turns, reportChars, boundary, depth, toolUseId, spawns }] of Object.entries(agents)) {
      const meta = { agentType: type };
      if (depth !== undefined) meta.spawnDepth = depth;
      if (toolUseId) meta.toolUseId = toolUseId;
      writeFileSync(join(sub, `agent-${id}.meta.json`), JSON.stringify(meta));
      const lines = [];
      for (let i = 0; i < turns; i++) {
        lines.push(JSON.stringify({ isSidechain: true, message: { role: "assistant", usage: { cache_read_input_tokens: 1000 * (i + 1), output_tokens: 5 } } }));
      }
      for (const s of spawns || []) lines.push(JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", id: s, name: "Agent" }] } }));
      if (boundary) lines.push(JSON.stringify({ type: "system", subtype: "compact_boundary" }));
      lines.push(JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "R".repeat(reportChars) }] } }));
      writeFileSync(join(sub, `agent-${id}.jsonl`), `${lines.join("\n")}\n`);
    }
    return join(tmp, name);
  };
  const marker = (turns, ret, art = "none") => budgetsMarker(`<!-- BUDGETS:x v1 · turns ${turns} · return ${ret} · artefact ${art} -->`, "x");
  const asBudget = (m) => ({ state: "marker", ...m });

  // ── the report: overruns counted, absences visible ──
  {
    const dir = session("proj", {
      a1: { type: "walker", turns: 100, reportChars: 400 },
      a2: { type: "walker", turns: 200, reportChars: 40000 },
      a3: { type: "crawler-doctrine", turns: 10, reportChars: 400 },
      a4: { type: "Explore", turns: 30, reportChars: 20000 },
    });
    const budgets = {
      walker: asBudget(marker(150, "contract", "6k")),
      "crawler-doctrine": asBudget(marker(150, "4k")),
    };
    const rows = report(collect(dir), budgets);
    const w = rows.find((r) => r.type === "walker");
    const c = rows.find((r) => r.type === "crawler-doctrine");
    const e = rows.find((r) => r.type === "Explore");
    ok(w.runs === 2 && c.runs === 1, "groups runs by agentType from the .meta.json sidecar", JSON.stringify(rows.map((r) => r.type)));
    ok(w.turnMed === 200 && w.turnMax === 200 && w.turnOverruns === 1, "counts turn overruns — 200 > 150, 100 is not", JSON.stringify(w));
    ok(w.replyOverruns === 1,
      `a CONTRACT-return agent whose reply is a 10k-token report is over — the block is ~150 tokens, the ceiling ${CONTRACT_REPLY_MAX_TOKENS}`, JSON.stringify(w));
    ok(c.turnOverruns === 0 && c.replyOverruns === 0, "KNOWN-GOOD: 0 means CHECKED-AND-CLEAN where a budget exists", JSON.stringify(c));
    ok(e.budgetState === "no-spine" && e.turnOverruns === null && e.replyOverruns === null,
      "a built-in with no agent file is no-spine, and NULL on both halves — never 0", JSON.stringify(e));
    const absent = report(collect(dir), { walker: { state: "absent", spined: true } }).find((r) => r.type === "walker");
    ok(absent.budgetState === "absent" && absent.turnOverruns === null && absent.replyOverruns === null,
      "an agent file with no marker is ABSENT and uncompared — the false zero this marker closes", JSON.stringify(absent));
    ok(rows[0].type === "walker", "sorts by turnMax so the worst offender is first", JSON.stringify(rows.map((r) => r.type)));
  }

  {
    const rows = report(collect(session("compacted", { b1: { type: "grounder", turns: 5, reportChars: 100, boundary: true } })), {});
    ok(rows[0].compacted === 1, "counts subagent compaction boundaries", JSON.stringify(rows[0]));
  }

  // ── several roots, one run counted once ──
  {
    const one = session("rootA", { r1: { type: "scout", turns: 3, reportChars: 100 }, r2: { type: "scout", turns: 4, reportChars: 100 } });
    const two = session("rootB", { r2: { type: "scout", turns: 4, reportChars: 100 }, r3: { type: "scout", turns: 5, reportChars: 100 } });
    ok(collect([one, two]).get("scout").length === 3,
      "two roots are read together, and a run under both (same session, same id) counts ONCE", String(collect([one, two]).get("scout").length));
    const other = session("rootC", { r2: { type: "scout", turns: 4, reportChars: 100 } }, "sess-2");
    ok(collect([one, other]).get("scout").length === 3, "…but the same agent id in ANOTHER session is another run");
    ok(collect(one).get("scout").length === 2, "a single root still works as a bare string");
  }

  // ── the trigger: dated per type, asks not fan-out ──
  {
    const runs = (n, mtime, depth = 1) => Array.from({ length: n }, (_, i) => ({ mtime, depth, id: `${mtime}-${depth}-${i}` }));
    const m = new Map([
      ["walker", [...runs(3, 100), ...runs(4, 300)]],
      ["census", [...runs(2, 500), ...runs(8, 500, 2)]],
      ["scout", runs(9, 900)],
      ["Explore", runs(50, 900)],
    ]);
    const t = triggerCount(m, { walker: 200, census: 400, scout: null });
    ok(t.perType.walker === 4, "only runs on or after THEIR type's generation count", JSON.stringify(t));
    ok(t.perType.census === 2, "REGRESSION: 2 asks that fanned out to 8 children count as 2, not 10", JSON.stringify(t));
    ok(t.undated.join() === "scout" && !("scout" in t.perType),
      "a type git could not date is left OUT and NAMED — never counted as current", JSON.stringify(t));
    ok(t.n === 6, "built-ins (no budget, no generation) do not feed a trigger about budgets", JSON.stringify(t));
    const pre = new Map([["walker", runs(27, 100)]]);
    ok(triggerCount(pre, { walker: 200 }).n === 0, "REGRESSION: 27 runs that all predate the budgets contribute 0, not 27");
    ok(runsSince([{ mtime: 0 }, { mtime: 500 }], 1) === 1, "a run with an unreadable mtime never counts");
  }

  // ── fan-out width per PARENT RUN (ported from yoros a5f26fa, its M-009) ──
  {
    // Two censuses. One stays inside a cap of 4; the other exceeds it. Per TYPE they total 7
    // children, the number that says nothing — the point is that only ONE parent breached.
    const dir = session("width", {
      p1: { type: "census", turns: 30, reportChars: 500, spawns: ["toolu_a", "toolu_b", "toolu_c", "toolu_d", "toolu_e"] },
      p2: { type: "census", turns: 20, reportChars: 400, spawns: ["toolu_f", "toolu_g"] },
      c1: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_a" },
      c2: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_b" },
      c3: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_c" },
      c4: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_d" },
      c5: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_e" },
      c6: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_f" },
      c7: { type: "census", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_g" },
      s1: { type: "scout", turns: 5, reportChars: 100, spawns: ["toolu_h"] },
      s2: { type: "scout", turns: 5, reportChars: 100, depth: 2, toolUseId: "toolu_h" },
    });
    const byType = collect(dir);
    const width = widthByParent(byType);
    ok(width.length === 3, "width is keyed by PARENT RUN, so three parents are three rows", JSON.stringify(width));
    ok(width[0].parentId === "sess-1/p1" && width[0].children === 5, "…and counts each parent's own children", JSON.stringify(width[0]));
    ok(width.find((w) => w.parentId === "sess-1/p2")?.children === 2, "…including the one that stayed inside the cap");
    const budgets = { census: { state: "marker", width: 4 }, scout: { state: "marker", width: null } };
    const { over, uncapped } = overWidth(width, budgets);
    ok(over.length === 1 && over[0].parentId === "sess-1/p1" && over[0].cap === 4, "exactly the parent over ITS type's cap is named", JSON.stringify(over));
    ok(uncapped.join() === "scout", "a parent type whose marker states no width is UNCAPPED and named — unknown is not a pass", JSON.stringify(uncapped));
    const perType = byType.get("census").filter((r) => (r.depth ?? 1) > 1).length;
    ok(perType === 7, "…while the per-TYPE total is 7, the number that answers a different question", String(perType));
    ok(overWidth(width, { census: { state: "marker", width: 5 }, scout: { state: "marker", width: 1 } }).over.length === 0,
      "KNOWN-GOOD: caps of 5 and 1 leave every parent clean");
    ok(overWidth(width, {}).uncapped.join() === "census,scout", "a parent type with no agent file at all is uncapped too");
    const main = collect(session("mainonly", {
      m1: { type: "grounder", turns: 5, reportChars: 100, toolUseId: "toolu_frommain" },
      m2: { type: "walker", turns: 5, reportChars: 100, toolUseId: "toolu_alsomain" },
    }));
    ok(widthByParent(main).length === 0, "KNOWN-GOOD: runs the MAIN session asked for produce no width rows");
    ok(widthByParent(new Map()).length === 0, "no runs yields no width rows");

    // Untested caps (yoros 236a8a4): a capped type no parent run exercised is named, never silent.
    const capped = { census: { state: "marker", width: 4 }, walker: { state: "marker", width: null } };
    const none = untestedCaps(widthByParent(main), capped);
    ok(none.length === 1 && none[0].type === "census" && none[0].cap === 4,
      "with no fan-out, a capped type is UNTESTED and named — a cap nothing exercised is not respected", JSON.stringify(none));
    ok(untestedCaps(width, capped).length === 0, "KNOWN-GOOD: a capped type with a parent run is tested, not named");
    ok(untestedCaps([], { census: { state: "malformed", width: 4 } }).length === 0, "only a readable marker states a cap — a malformed one is not called untested");
    ok(untestedCaps([], { census: { state: "marker", width: 0 } })[0]?.cap === 0, "a cap of 0 is a cap — named, not dropped as falsy");
  }

  // ── nesting: depth from the sidecar, parent by containment ──
  {
    const dir = session("nested", {
      p1: { type: "census", turns: 40, reportChars: 800, spawns: ["toolu_kid1", "toolu_kid2"] },
      k1: { type: "census", turns: 12, reportChars: 200, depth: 2, toolUseId: "toolu_kid1" },
      k2: { type: "census", turns: 14, reportChars: 300, depth: 2, toolUseId: "toolu_kid2" },
      lone: { type: "walker", turns: 20, reportChars: 400, toolUseId: "toolu_frommain" },
    });
    const byType = collect(dir);
    const kids = byType.get("census").filter((r) => r.depth === 2);
    const rows = report(byType, {});
    const c = rows.find((r) => r.type === "census");
    const w = rows.find((r) => r.type === "walker");
    ok(kids.length === 2 && kids.every((r) => r.parent === "census"), "a nested run's PARENT is the agent whose transcript holds its toolUseId");
    ok(w.spawnedBy.join() === "main", "a run whose toolUseId is in no subagent transcript is attributed to main");
    ok(byType.get("census").find((r) => r.id === "p1").parent === "main", "…and containment never makes a run its own parent");
    ok(c.nested === 2 && c.maxDepth === 2 && c.nestedTurnMed === 14, "the nested subset is counted and reported separately", JSON.stringify(c));
    const legacy = collect(session("legacy", { old1: { type: "grounder", turns: 5, reportChars: 100 } })).get("grounder")[0];
    ok(legacy.depth === 1 && legacy.parent === "main", "a sidecar with no spawnDepth reads as top-level");
  }

  {
    ok(collect(join(tmp, "does-not-exist")).size === 0, "a missing project dir yields nothing rather than throwing");
    ok(report(new Map(), {}).length === 0, "no runs yields no rows — the caller decides what that means");
    ok(flagValues(["--root", "a", "--root", "b", "--agents", "c"], "--root").join() === "a,b", "--root repeats");
    ok(flagValues(["--root", "--selftest"], "--root").length === 0, "…and a flag is never taken as a flag's value");
  }

  // ── KNOWN-GOOD: the real agent files ──
  // Every file that carries a canon SPINE must carry a marker this grammar reads. Canon passes
  // `--agents kit/agents`; a project reads its own .claude/agents. A directory that is not there
  // FAILS: a KNOWN-GOOD that passes by having nothing to read is the check satisfiable by deleting
  // its subject.
  {
    const live = budgetsFrom(agentsDir);
    const spined = Object.entries(live).filter(([, b]) => b.state === "marker" || b.spined || b.state === "malformed");
    ok(spined.length > 0, `KNOWN-GOOD: ${agentsDir} holds spined agent files to read`, `${Object.keys(live).length} file(s)`);
    const bad = spined.filter(([, b]) => b.state !== "marker").map(([t, b]) => `${t} (${b.state})`);
    ok(bad.length === 0, "KNOWN-GOOD: every spined agent file carries a readable BUDGETS marker", bad.join(", "));
  }

  rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — budgets from one marker, generations from git, overruns counted, absences visible");
  process.exit(failed ? 1 : 0);
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────
if (isEntry) {
  const explicit = flagValues(argv, "--root");
  const roots = explicit.length ? explicit.map((r) => resolve(r)) : [join(homedir(), ".claude", "projects", slugFor(process.cwd()))];
  const budgets = budgetsFrom(agentsDir);
  const present = roots.filter((r) => existsSync(r));
  for (const r of roots.filter((x) => !present.includes(x))) console.log(`⚠ no transcript directory at ${r} — an ABSENCE, not a clean result`);
  if (!present.length) {
    console.log("  Nothing to measure. Pass --root <projects/slug dir> if the transcripts live elsewhere.");
    process.exit(0);
  }

  const byType = collect(present);
  const rows = report(byType, budgets);
  const totalRuns = rows.reduce((s, r) => s + r.runs, 0);
  if (!totalRuns) {
    console.log(`⚠ ${present.join(", ")} holds no subagent runs. Absence, not zero.`);
    process.exit(0);
  }

  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  console.log(`\n🤖 agent distribution — ${totalRuns} run(s) across ${rows.length} type(s)`);
  for (const r of present) console.log(`   ${r}`);
  console.log(`   budgets: ${agentsDir}\n`);
  console.log(`   ${pad("type", 18)}${num("runs", 5)}  ${num("turns med/max", 14)}  ${num("reply med/max", 15)}  ${pad("budget", 14)}  over`);

  const budgetCell = (r) => {
    if (r.budgetState === "marker") return `${r.budgetTurns}/${r.returnForm === "contract" ? "contract" : `${r.returnK}k`}`;
    if (r.budgetState === "no-spine") return "built-in";
    return `— ${r.budgetState} —`;
  };
  let overruns = 0;
  for (const r of rows) {
    const over = (r.turnOverruns ?? 0) + (r.replyOverruns ?? 0);
    overruns += over;
    const parts = [];
    if (r.turnOverruns) parts.push(`${r.turnOverruns}t`);
    if (r.replyOverruns) parts.push(`${r.replyOverruns}r`);
    if (r.turnOverruns === null) parts.push("?t");
    if (r.replyOverruns === null) parts.push("?r");
    let flag = "";
    if (parts.length) flag = ` ${over ? "⚠" : "·"} ${parts.join(" ")}`;
    console.log(`   ${pad(r.type, 18)}${num(r.runs, 5)}  ${num(`${r.turnMed}/${r.turnMax}`, 14)}  ${num(`${r.repMed}/${r.repMax}`, 15)}  ${pad(budgetCell(r), 14)}${flag}`);
    if (r.nested) {
      const via = r.spawnedBy.filter((p) => p !== "main").join(",") || "?";
      console.log(`   ${pad(`  ↳ nested (d${r.maxDepth})`, 18)}${num(r.nested, 5)}  ${num(`${r.nestedTurnMed}/${r.nestedTurnMax}`, 14)}  ${num(`${r.nestedRepMed}/${r.nestedRepMax}`, 15)}  via ${via}`);
    }
  }

  const nestedTotal = rows.reduce((s, r) => s + r.nested, 0);
  if (nestedTotal) {
    const edges = new Map();
    for (const [type, runs] of byType) {
      for (const r of runs) {
        if ((r.depth ?? 1) === 1) continue;
        const key = `${r.parent} → ${type}`;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    console.log(`\n   spawn edges (${nestedTotal} nested run(s), deepest d${Math.max(...rows.map((r) => r.maxDepth))}):`);
    for (const [edge, n] of [...edges].sort((a, b) => b[1] - a[1])) console.log(`     ${edge}  ×${n}`);
    const width = widthByParent(byType);
    const { over, uncapped } = overWidth(width, budgets);
    console.log("\n   fan-out width, PER PARENT RUN:");
    for (const w of width) {
      const cap = budgets[w.parent]?.width ?? null;
      const flag = cap !== null && w.children > cap ? ` ⚠ over ${cap}` : "";
      const label = w.parent + " " + w.parentId.split("/").at(-1).slice(0, 8);
      console.log(`     ${pad(label, 24)} ${num(w.children, 3)} child(ren)${flag}`);
    }
    if (over.length) {
      console.log(`   ⚠ ${over.length} parent run(s) exceeded their type's width. Reported, not failed: a width exceeded`);
      console.log("     once is a fact worth seeing, and every child pays the startup context its parent paid.");
    }
    if (uncapped.length) console.log(`   ? no width in the BUDGETS marker of: ${uncapped.join(", ")} — those parents cannot be judged. Absence, not a pass.`);
    if (!over.length && !uncapped.length) console.log("   ✅ no parent run exceeded its type's width.");
  } else {
    console.log("\n   spawn depth: every run is top-level (d1). No agent has spawned an agent.");
  }
  // yoros's sentence (236a8a4), in both branches: fan-out by one type says nothing about another's cap.
  for (const u of untestedCaps(widthByParent(byType), budgets)) {
    console.log(`   · ${u.type}: the cap of ${u.cap} is untested rather than respected, which is a different claim —`);
    console.log("     no run of this type has spawned a child.");
  }

  const compacted = rows.reduce((s, r) => s + r.compacted, 0);
  const peak = Math.max(...rows.map((r) => r.peakMax));
  console.log(`\n   subagent compactions: ${compacted}  ·  peak subagent context: ${peak.toLocaleString()}`);

  const unchecked = rows.filter((r) => r.turnOverruns === null || r.replyOverruns === null);
  if (overruns) {
    console.log(`\n   ⚠ ${overruns} budget overrun(s). Budgets are BACKSTOPS — an overrun is a finding about how the`);
    console.log("   task was scoped, not automatically a fault in the agent. A contract-return reply over the");
    console.log(`   ceiling (${CONTRACT_REPLY_MAX_TOKENS} tokens) is an answer returned inline: read the brief that asked for it.`);
  } else if (unchecked.length) {
    // Never "no overruns" while a half went uncompared — that sentence is the false zero itself.
    console.log("\n   ✅ no overruns among the halves that COULD be compared.");
  } else {
    console.log("\n   ✅ no budget overruns.");
  }
  for (const r of unchecked) {
    if (r.budgetState === "no-spine") {
      console.log(`\n   · ${r.type}: a BUILT-IN with no agent file — out of fleet. Cost still counts: reply ${r.repMed}/${r.repMax} tokens over ${r.runs} run(s).`);
    } else if (r.budgetState === "absent") {
      console.log(`\n   ? ${r.type}: its agent file carries no BUDGETS marker — ${r.spined ? "a canon spine whose marker was never propagated: run propagate-spines" : "a local agent canon does not budget"}.`);
      console.log(`     Observed turns ${r.turnMed}/${r.turnMax}, reply ${r.repMed}/${r.repMax} tokens over ${r.runs} run(s) — JUDGE BY EYE.`);
    } else if (r.budgetState === "malformed") {
      console.log(`\n   ? ${r.type}: ${r.error}`);
    }
  }

  const generations = {};
  for (const [type, b] of Object.entries(budgets)) {
    if (b.state === "marker") generations[type] = generationOf(agentsDir, b.file, b.line);
  }
  if (Object.keys(generations).length === 0) {
    console.log(`\n   ⏱ re-measure trigger: NOT MEASURED — no agent file in ${agentsDir} carries a BUDGETS marker,`);
    console.log(`     so no run can be dated against a budget. This is an absence, not 0/${TRIGGER}.`);
    process.exit(0);
  }
  const trig = triggerCount(byType, generations);
  const dated = Object.entries(trig.perType).map(([t, n]) => `${t} ${n} since ${new Date(generations[t]).toISOString().slice(0, 10)}`);
  const verdict = trig.n >= TRIGGER ? "MET" : `${trig.n}/${TRIGGER}`;
  console.log(`\n   ⏱ re-measure trigger at ${TRIGGER} TOP-LEVEL runs under the current budgets: ${verdict}`);
  if (dated.length) console.log(`     ${dated.join(" · ")}`);
  if (trig.undated.length) {
    console.log(`     NOT COUNTED — no committed marker to date them by: ${trig.undated.join(", ")}. An uncommitted marker`);
    console.log("     dates nothing, so their runs cannot be told from the previous generation's.");
  }
  if (trig.n >= TRIGGER) {
    if (RECORD) console.log(`     Record this table in ${RECORD} beside the first distribution, then tighten against current-generation runs only.`);
    else console.log("     Record this table beside the first distribution — but RECORD in KIT:CONFIG measure names nowhere. Set it first.");
  }
  console.log("     Runs before a type's generation are excluded; nested runs never count — one ask that fans out to six is one ask.");
}
