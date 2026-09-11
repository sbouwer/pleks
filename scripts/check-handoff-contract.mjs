#!/usr/bin/env node
/**
 * scripts/check-handoff-contract.mjs — every handoff artefact carries a well-formed contract block.
 *
 * @kit check-handoff-contract v5 — tracked. Edit it in dev-standards and re-adopt; a local
 * change here is a fork, and `check-kit-drift.mjs` will say so.
 *
 * PORTED FROM `pleks/scripts/check-handoff-contract.mjs`. It arrives because of dev-standards
 * **L-63** — *"the propagation unit is the contract, not the files that changed"* — and because
 * this project was, until now, a live instance of exactly the failure L-63 records against
 * life-therapy: **all six spines here carry the return-contract block and nothing in the repo read
 * any of it.** The gate was green, every spine matched canon, and `check-agent-spines.mjs` passed,
 * because spines matching canon is what that checks. The defect is invisible from the authoring
 * seat — whoever writes a propagation list has the mechanism in their own tree.
 *
 * WHY THE BLOCK NEEDS A CHECK AT ALL: the return contract (4-AGENT-PIPELINES §3) is emitted to the
 * caller through the transcript, and nothing can inspect a transcript after the fact. An agent that
 * returns bullets of its own devising instead is a silent failure. So the spine also requires the
 * block as the artefact's FINAL section, on disk, where a check can reach it.
 *
 * THE MISSING-vs-NONE DISTINCTION IS THE POINT. `Promote    none` is a considered result and the
 * normal one for an entry agent; an ABSENT Promote line is a contract failure. Collapsing them
 * deletes the only signal this file carries.
 *
 * THE GLYPH IS DELIBERATE REDUNDANCY. The verdict line carries both a glyph and a word, and this
 * check asserts they agree. A verdict whose gloss contradicts its own state ("⛔ proceed") is a real
 * failure and is invisible in a bare word.
 *
 * ⚠ THE GLYPH SET IS READ OFF THE SPINES, NOT OFF THE PLAYBOOK, and they disagree — found while
 * porting this file, 2026-08-30. `kit/agents/grounder.spine.md` line 212 specifies
 * `✅ proceed` · `⚠️ decision-needed` · `⛔ stop` and says "there is no fourth pair"; all six spines
 * here ship that form. `playbooks/4-AGENT-PIPELINES.md` §3's worked examples use
 * `✅ Proceed` · `⏸ Decision needed` · `🛑 Stop` — three of six glyphs different, and capitalised.
 * Anyone learning the protocol from the playbook writes a block this check rejects. The spine wins
 * because the spine is what reaches the agent; the playbook is being corrected upstream.
 *
 * SCOPE AND ITS HONEST LIMIT: `.handoff/` is gitignored, so on a clean tree this validates ZERO
 * files and passes. A check that cannot fire is usually a defect; here it is the design, because
 * the directory is task-scoped scratch. The mitigations are that the live run REPORTS its
 * denominator — so "0 artefacts" is visible rather than implied — and that `--selftest` carries the
 * real fixtures in both directions.
 *
 * v5 (2026-09-11) READS THE ANCHOR INSTEAD OF ONLY SHAPING IT — life-therapy CF-2, CF-3, CF-4.
 * The anchor records when the agent started, what tree it started on, and (since the spines'
 * 2026-09-11 bump) which spine it ran. v4 checked that those fields existed and compared none of
 * them. v5 prints two tells: a cited file edited DURING the run (L-41), and a spine stamp that the
 * anchor's commit does not hold (L-39). Neither fails the gate. The exit code the gate's `&&` chain
 * reads is now on a probe's path: `--selftest` spawns this file against fixture roots, one per exit
 * (L-51). Before v5 a main-path `exit(0)` mutant left every probe green.
 *
 * Run: node scripts/check-handoff-contract.mjs             (wired into `npm run check`)
 *      node scripts/check-handoff-contract.mjs --selftest  (probes both directions, and every exit)
 *      node scripts/check-handoff-contract.mjs --root <dir> (another tree; what the exit probes use)
 */
import { readdirSync, readFileSync, statSync, existsSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/");
const HANDOFF = "/.handoff";

/**
 * The five labels, in the order the block prints them. Order is part of the contract — a human
 * scans the column, and `Agent`/`Verdict` are what they scan for first.
 */
const LABELS = ["Agent", "Verdict", "Summary", "Artefact", "Promote"];

/** Glyph → the verdict word it must accompany. There is no fourth pair. See the header note. */
const GLYPHS = { "✅": "proceed", "⚠": "decision-needed", "⛔": "stop" };
const VERDICTS = new Set(Object.values(GLYPHS));

/**
 * Agents whose SPINE emits the contract block. The check enforces it only for these, because a rule
 * cannot be enforced on an agent that was never told it.
 *
 * This is a rollout boundary, not an exemption: it WIDENS as spines gain the block, and every agent
 * added here must be added in the same commit that ships its spine. Skipped artefacts are NAMED on
 * every run — a hand-widened boundary WILL be forgotten, so it must be loud. That is the half of
 * the upstream design that made its own one-session lag recoverable.
 *
 * `crawler-doctrine` is deliberately absent and is NOT lag: its stdout is parsed as a single JSON
 * object, so a trailing fenced block would break the parse. Its spine says so under "Why you carry
 * no return-contract block, when every other agent does", so a later reader does not close it as a
 * gap. `main` is likewise absent — the main session has no spine, and `NN-main.md` is its own notes.
 */
export const CONTRACT_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"]);

/**
 * Agents whose spine specifies the machine-readable ANCHOR LINE. Kept as a separate name from the
 * set above even though the two are currently identical, because the split is what the next rollout
 * needs: upstream, widening one set switched on TWO assertions and four spines anchored in prose
 * against a check that greps for a line. The two sets are read independently, so an agent can
 * carry the block without the anchor line and the finding names which of the two it failed.
 */
export const ANCHOR_AGENTS = new Set(["grounder", "census", "walker", "db-inspector", "implementer"]);

/** Every `NN-<agent>.md` under a handoff root. Non-recursive past the task-slug level, by design. */
export function artefacts(root) {
  const base = `${root}${HANDOFF}`;
  if (!existsSync(base)) return [];
  const out = [];
  for (const slug of readdirSync(base)) {
    const dir = join(base, slug);
    try { if (!statSync(dir).isDirectory()) continue; } catch { continue; }
    for (const f of readdirSync(dir)) {
      if (/^\d{2}-[a-z-]+\.md$/.test(f)) out.push(join(dir, f).replace(/\\/g, "/"));
    }
  }
  return out.sort();
}

/** The agent name a `NN-<agent>.md` filename encodes, or null if the name does not parse. */
export function agentOf(path) {
  const m = /\/\d{2}-([a-z-]+)\.md$/.exec(path.replace(/\\/g, "/"));
  return m ? m[1] : null;
}

/** Split discovered artefacts into the ones the contract applies to and the ones it does not. */
export function partition(paths) {
  const enforced = [], skipped = [];
  for (const p of paths) (CONTRACT_AGENTS.has(agentOf(p)) ? enforced : skipped).push(p);
  return { enforced, skipped };
}

/**
 * Read one label's value. The block is column-aligned, so the separator is a RUN OF SPACES, not a
 * colon. Captured to end of line: matching `(\S+)` would read an unfilled placeholder's first token
 * as a valid value and wave the whole template through.
 *
 * `[ \t]` THROUGHOUT, never `\s`, and both reasons are load-bearing:
 *   1. QUADRATIC. `^\s*` under /m re-consumes the whole trailing newline run at every line start —
 *      upstream measured a 60k-blank-line artefact at 20 SECONDS, and this runs once per label.
 *   2. CORRECTNESS. `\s{2,}` as the column separator could cross a newline and read the NEXT line's
 *      text as this label's value, turning a malformed block into a plausible one.
 */
const valueOf = (text, l) => (text.match(new RegExp(`^[ \\t]*${l}[ \\t]{2,}(.+?)[ \\t]*$`, "m")) ?? [])[1];

/** Parse cap — refusing beats truncating; see the block in `checkArtefact`. */
const MAX_ARTEFACT_BYTES = 1024 * 1024;

/**
 * Validate one artefact's trailing contract block. Returns findings, empty when well-formed.
 *
 * Deliberately tolerant about WHERE the block sits (last section, not last byte) and strict about
 * WHAT it contains. An agent that adds a trailing newline has not broken the contract; an agent
 * that drops Promote has.
 */
export function checkArtefact(path, text, enforceAnchor = true) {
  const out = [];

  // Every bound below is per-pattern: each says "this regex stays linear", none says anything about
  // the SUM. `checkArtefact` runs ~8 passes over `text`, so a 200MB artefact is slow at linear time
  // — bounded complexity and bounded work are different claims. The producer is an AGENT, the least
  // controlled input this file sees. This is a REFUSAL, not a truncation: truncating would report a
  // well-formed contract for a file whose block sits past the cut, a false PASS on the exact input
  // that tripped the cap.
  if (text.length > MAX_ARTEFACT_BYTES) {
    out.push(
      `${path}: artefact is ${(text.length / 1024 / 1024).toFixed(1)}MB, over the ${MAX_ARTEFACT_BYTES / 1024 / 1024}MB parse cap — not parsed. ` +
      `A handoff artefact is prose around a few hundred bytes of contract block; this size means a runaway writer or a pasted binary.`,
    );
    return out;
  }

  const missing = LABELS.filter((l) => valueOf(text, l) === undefined);
  if (missing.length === LABELS.length) {
    out.push(`${path}: no contract block at all — the labelled lines are the agent's return, and this artefact carries none`);
    return out;
  }
  for (const l of missing) {
    out.push(`${path}: contract block is missing its ${l} line${l === "Promote" ? ' — "Promote    none" is a line, and its ABSENCE is the failure this check exists to separate from it' : ""}`);
  }

  // An artefact is a grounding claim, so an unanchored one is itself a finding (CLAUDE.md §8).
  // `[ \t]*`, NOT `\s*` — under /m, `\s` includes `\n`, so `^\s*` could consume an entire run of
  // blank lines before reaching `anchor:`: n line starts × n whitespace chars.
  //
  // THE QUALIFIER IS OPTIONAL, AND IT WAS ADDED BECAUSE v2 REJECTED A BETTER ANCHOR (v3,
  // 2026-09-09). The first real pipeline artefact this check ever saw in life-therapy was a
  // CROSS-REPO grounding run — one agent reading two repos — and it anchored both:
  //
  //     anchor: … · commit(life-therapy)=b0873a1 · commit(yoros)=7e9f127
  //
  // v2 required a literal `commit=` and fired `no anchor line carrying a commit` on an artefact
  // carrying two. The agent had done MORE than the template asks; the check read it as having done
  // nothing. That direction is the dangerous one: the finding names the agent, so the obvious
  // reading is that the agent misbehaved, and the obvious fix is to make it write a weaker anchor.
  //
  // The general form is L-75 from the other side. L-75 is a gate whose substring test matches the
  // NEIGHBOUR; this is a requirement whose exact-string test misses the SPECIALISATION. Both come
  // from spelling a pattern for the one example in front of you, and a requirement that only
  // accepts the reference spelling silently forbids every legitimate extension of it.
  //
  // BOUNDED at 64 and `[^)]`, deliberately: an unbounded `\(.*\)` inside a `.*` is the classic
  // nested-quantifier backtrack, and the input here is agent-written prose. A repo name is not 64
  // characters. `commitment=` does NOT satisfy this — `\bcommit` matches, the optional group is
  // absent, and the next character must be `=`; a probe below asserts that in both directions,
  // because the neighbour-match is the failure this pattern's own lesson is about.
  if (enforceAnchor && !/^[ \t]*anchor:.*\bcommit(?:\([^)]{1,64}\))?=/m.test(text)) {
    out.push(`${path}: no anchor line carrying a commit — an unanchored observation is a finding, not a fact`);
  }

  // An UNFILLED template passes every label test above — every line is present, it just says
  // `<pipeline id from the brief>`. A bare `—` is NOT a placeholder: it is the specified value for
  // "the brief named no pipeline". BOUNDED at 200: `<[^>]+>` is the classic unclosed-delimiter
  // quadratic, and ASCII art or a nested generic produces exactly that run of `<`.
  for (const l of LABELS) {
    const v = valueOf(text, l);
    if (v !== undefined && /<[^>]{1,200}>/.test(v)) {
      out.push(`${path}: ${l} still holds the spine's placeholder ("${v}") — the block was copied, not filled in`);
    }
  }

  const verdict = valueOf(text, "Verdict");
  if (verdict !== undefined && !/<[^>]{1,200}>/.test(verdict)) {
    // Strip the variation selector: ⚠️ is ⚠ + U+FE0F, and only one of those spellings is typed.
    const v = verdict.replace(/️/g, "");
    const glyph = Object.keys(GLYPHS).find((g) => v.startsWith(g));
    const word = [...VERDICTS].find((w) => new RegExp(`\\b${w}\\b`).test(v));
    if (!glyph) out.push(`${path}: Verdict "${verdict}" carries no state glyph — must open with ${Object.keys(GLYPHS).join(" ")}`);
    if (!word) out.push(`${path}: Verdict "${verdict}" names no state — must be one of ${[...VERDICTS].join(", ")}`);
    if (glyph && word && GLYPHS[glyph] !== word) {
      out.push(`${path}: Verdict glyph and word disagree — "${glyph}" means ${GLYPHS[glyph]}, the line says ${word}`);
    }
  }
  return out;
}

// ── v5: the two tells the anchor makes computable ─────────────────────────────────────────────────
// Both PRINT and neither fails. An artefact's conclusion may stand on another leg (at pleks it did),
// so a tell is a reason to re-read a paragraph, not a verdict on the agent.

/** The anchor line's fields, or null when there is none. Every pattern stops at the line's end. */
export function anchorOf(text) {
  const line = /^[ \t]*anchor:[^\n]*$/m.exec(text)?.[0];
  if (!line) return null;
  const utc = /\butc=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/.exec(line)?.[1] ?? null;
  const stamp = /\bspine=([a-z-]+) v(\d+)\b/.exec(line);
  // The same bounded key the anchor requirement accepts, so a cross-repo anchor yields every SHA.
  const commits = [...line.matchAll(/\bcommit(?:\([^)]{1,64}\))?=([0-9a-f]{4,40})\b/g)].map((m) => m[1]);
  return {
    utc,
    utcMs: utc ? Date.parse(utc) : null,
    spine: stamp ? { agent: stamp[1], version: stamp[2] } : null,
    commits,
  };
}

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * The repo-relative file a backtick span cites, or null when it cites none. Read off the one real
 * artefact life-therapy has: citations come as `lib/auth.ts:24-57`, `login/mfa/actions.ts:11-13,
 * 44-58`, `lib/supabase/middleware.ts:updateSession`, and bare `proxy.ts` — so everything from the
 * first `:` is a locator, not the path. Routes (`/admin`), packages (`@supabase/ssr`), globs,
 * directories, `..` and absolute paths are not citations of a file in this tree.
 */
export function candidateOf(span) {
  const head = span.trim().split(":")[0].replace(/^\.\//, "");
  if (!head || head.length > 200 || /[\s*?|{}<>"'=,;\\]/.test(head) || /^[/@~-]/.test(head)) return null;
  const segs = head.split("/");
  const last = segs.at(-1);
  const dot = last.lastIndexOf(".");
  if (segs.some((s) => s === "" || s === "..") || dot <= 0 || !/^[A-Za-z0-9]{1,8}$/.test(last.slice(dot + 1))) return null;
  return head;
}

/** Every cited file → the artefact lines citing it. The span is bounded, so a stray backtick is linear. */
export function citations(text) {
  const out = new Map();
  text.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/`([^`\n]{1,300})`/g)) {
      const c = candidateOf(m[1]);
      if (!c) continue;
      if (!out.has(c)) out.set(c, []);
      const at = out.get(c);
      if (at.at(-1) !== i + 1) at.push(i + 1);
    }
  });
  return out;
}

/**
 * Where a cited path lands in THIS tree: `{path, mtimeMs}`, `{unresolved: why}`, or null for a bare
 * name that matches no file (`user.id` is an identifier, not a citation). Exact first; then a unique
 * suffix among `files`, because artefacts cite `rate-limit-db.ts` as often as `lib/rate-limit-db.ts`.
 * An AMBIGUOUS suffix is unresolved rather than guessed. A cross-repo artefact citing a path that
 * also exists here resolves here — the one wrong answer this cannot see.
 */
export function makeResolver(root, files, stat = statSync) {
  const mtime = (rel) => {
    try {
      const s = stat(join(root, rel));
      return s.isFile() ? s.mtimeMs : null;
    } catch {
      return null;
    }
  };
  return (cand) => {
    const direct = mtime(cand);
    if (direct !== null) return { path: cand, mtimeMs: direct };
    const hits = (files ?? []).filter((f) => f === cand || f.endsWith(`/${cand}`));
    if (hits.length > 1) return { unresolved: `${hits.length} files end in it` };
    if (hits.length === 1) {
      const m = mtime(hits[0]);
      return m === null ? { unresolved: "listed by git, not on disk" } : { path: hits[0], mtimeMs: m };
    }
    if (!cand.includes("/")) return null;
    return { unresolved: files ? "no such file here" : "no such file here, and git ls-files did not answer" };
  };
}

/**
 * L-41's tell (life-therapy CF-4). A cited file whose mtime falls inside (anchor utc, artefact
 * mtime] was edited WHILE the agent ran — a dispatcher and its agents share one tree — so the
 * paragraph citing it may rest on bytes the agent never read. QUARANTINED, never failed.
 *
 * BOTH BOUNDS ARE THE POINT. Before utc, the agent read the edited bytes. After the artefact was
 * written, the edit is staleness — a different lesson — and marking it would bury this one under
 * every file anyone has touched since. Lower bound exclusive, upper inclusive. `utc=` is floored to
 * the second, so an edit in that same second before the agent read the clock is marked too, which
 * errs toward re-reading. An artefact edited after it was written moves its own upper bound; it has
 * stopped being the agent's artefact, and this cannot tell.
 *
 * An artefact with no `utc=` predates the anchor and is NOT MEASURED, never passed. A cited path
 * that does not resolve is NAMED: "I could not look" must not read as "nothing moved".
 */
export function tell(text, { writtenMs, resolvePath }) {
  const a = anchorOf(text);
  if (!a || a.utcMs === null) return { measured: false, why: "no anchor utc= — written before the anchor, or without it" };
  if (writtenMs <= a.utcMs) return { measured: false, why: `written ${iso(writtenMs)}, not after its own anchor ${a.utc}` };
  const quarantined = [], unresolved = [];
  let resolved = 0;
  for (const [cand, lines] of citations(text)) {
    const r = resolvePath(cand);
    if (!r) continue;
    if (r.unresolved) {
      unresolved.push(`${cand} (${r.unresolved})`);
      continue;
    }
    resolved++;
    if (r.mtimeMs > a.utcMs && r.mtimeMs <= writtenMs) quarantined.push({ path: r.path, lines, mtimeMs: r.mtimeMs });
  }
  return { measured: true, utc: a.utc, writtenMs, resolved, quarantined, unresolved };
}

/**
 * The agents the L-41 tell applies to. NOT the implementer: it edits the files it cites, so every
 * one would be marked by its own hand and the tell would say nothing. Named on every run it skips.
 */
export const TELL_AGENTS = new Set(["grounder", "census", "walker", "db-inspector"]);

/**
 * L-39's tell (life-therapy CF-3). The anchor stamps `spine=<agent> vN`, copied from the template
 * of the spine the agent RAN; the spine the tree held at the anchor's commit is read from GIT, never
 * from the working tree — an in-turn edit is the case this exists to expose, and the working tree
 * has moved since in any case. A difference means the agent ran a spine its starting tree did not
 * hold: the harness does not reload an agent file edited mid-session. PRINTED, never failed.
 *
 * No stamp means the artefact predates the field (spines before 2026-09-11): counted, not failed. A
 * cross-repo anchor carries a commit per repo; the first whose tree holds the spine is this repo's,
 * because a foreign SHA does not resolve here.
 */
export function compareStamp(text, readSpineAt) {
  const a = anchorOf(text);
  if (!a?.spine) return { kind: "unstamped" };
  const { agent, version } = a.spine;
  if (!a.commits.length) return { kind: "unmeasured", why: "the anchor names no commit to read the spine at" };
  for (const sha of a.commits) {
    const blob = readSpineAt(sha, agent);
    if (blob === null) continue;
    const held = new RegExp(`<!--\\s*SPINE:${agent}\\s+v(\\d+)\\s*-->`).exec(blob)?.[1];
    if (!held) return { kind: "unmeasured", why: `.claude/agents/${agent}.md at ${sha} carries no SPINE marker` };
    return held === version ? { kind: "match", sha } : { kind: "mismatch", sha, agent, stamped: version, held };
  }
  return { kind: "unmeasured", why: `no anchor commit (${a.commits.join(", ")}) holds .claude/agents/${agent}.md in this repo` };
}

/** `git show <sha>:<spine>` — the committed bytes, never the working tree's. Null when git says no. */
export function gitSpineReader(root) {
  return (sha, agent) => {
    const r = spawnSync("git", ["show", `${sha}:.claude/agents/${agent}.md`], { cwd: root, encoding: "utf8", timeout: 10_000 });
    return r.status === 0 ? r.stdout : null;
  };
}

/** Tracked and untracked-unignored files, for suffix resolution. Null when git does not answer. */
export function gitFiles(root) {
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", timeout: 20_000, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.split("\0").filter(Boolean) : null;
}

/** The lines the live pass prints for the tells. Never a finding; the exit code does not read them. */
export function tellLines(root, paths) {
  const lines = [];
  if (!paths.length) return lines;
  const resolvePath = makeResolver(root, gitFiles(root));
  const readSpineAt = gitSpineReader(root);
  const n = { measured: 0, resolved: 0, quarantined: 0, skipped: 0, stamped: 0, mismatched: 0, unstamped: 0 };
  for (const f of paths) {
    const rel = f.replace(`${root}/`, "");
    const text = readFileSync(f, "utf8");
    if (text.length > MAX_ARTEFACT_BYTES) continue;
    if (TELL_AGENTS.has(agentOf(f))) {
      const t = tell(text, { writtenMs: statSync(f).mtimeMs, resolvePath });
      if (!t.measured) {
        lines.push(`   L-41 · ${rel}: NOT MEASURED — ${t.why}`);
      } else {
        n.measured++;
        n.resolved += t.resolved;
        n.quarantined += t.quarantined.length;
        for (const q of t.quarantined) {
          lines.push(`   ⚑ QUARANTINED ${rel}:${q.lines.join(",")} cites ${q.path} — edited ${iso(q.mtimeMs)}, inside the run (${t.utc} → ${iso(t.writtenMs)}); what that paragraph says may rest on bytes the agent never read (L-41)`);
        }
        if (t.unresolved.length) {
          lines.push(`   L-41 · ${rel}: ${t.unresolved.length} cited path(s) NOT MEASURED, they do not resolve here: ${t.unresolved.join(" · ")}`);
        }
      }
    } else {
      n.skipped++;
    }
    const s = compareStamp(text, readSpineAt);
    if (s.kind === "unstamped") n.unstamped++;
    else n.stamped++;
    if (s.kind === "mismatch") {
      n.mismatched++;
      lines.push(`   ⚑ SPINE ${rel} stamps ${s.agent} v${s.stamped}; .claude/agents/${s.agent}.md at ${s.sha} is v${s.held} — the agent ran a spine its starting tree did not hold (L-39): read its instructions as v${s.stamped}'s before calling it disobedient`);
    }
    if (s.kind === "unmeasured") lines.push(`   L-39 · ${rel}: NOT MEASURED — ${s.why}`);
  }
  lines.push(`   L-41 · ${n.measured} artefact(s) measured, ${n.resolved} citation(s) resolved, ${n.quarantined} edited during their run` +
    (n.skipped ? ` · ${n.skipped} implementer artefact(s) not measured — it edits what it cites` : ""));
  lines.push(`   L-39 · ${n.stamped} stamped, ${n.mismatched} ran a spine their commit did not hold · ${n.unstamped} predate the stamp`);
  return lines;
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0;
  const ok = (c, l) => {
    if (!c) failed++;
    console.log(`  ${c ? "✓" : "✗"} ${l}`);
  };

  const GOOD = [
    "anchor: task=redirect-map · agent=grounder · utc=2026-08-30T09:14:02Z · commit=93b9437",
    "",
    "## 1. Machinery map",
    "…",
    "## Contract",
    "",
    "```",
    "Agent      grounder · P1 · step 1 of 3",
    "Verdict    ✅ proceed — nothing to decide",
    "",
    "Summary    Mapped. Buildable as specified. 12 sites, 2 need a naming call.",
    "",
    "Artefact   .handoff/redirect-map/01-grounder.md",
    "Promote    none",
    "```",
    "",
  ].join("\n");

  ok(checkArtefact("a.md", GOOD).length === 0, "KNOWN-GOOD: a well-formed block with Promote none is clean");

  // THE distinction. Both have "no promotion" as the outcome; only one is a defect.
  ok(checkArtefact("a.md", GOOD.replace(/^Promote.*$/m, "")).some((f) => f.includes("Promote")),
    "a MISSING Promote line fires — it is a contract failure");
  ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("Promote")),
    "…and a PRESENT `Promote    none` does NOT fire — the considered answer is the normal one");

  ok(checkArtefact("a.md", GOOD.replace(/^Summary.*$/m, "")).some((f) => f.includes("Summary")), "a missing Summary line fires");
  ok(checkArtefact("a.md", GOOD.replace(/^Agent.*$/m, "")).some((f) => f.includes("Agent")), "a missing Agent routing line fires");
  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · — · —")).length === 0,
    "KNOWN-GOOD: `—` in the routing slots is the SPECIFIED value when the brief named none, not a placeholder");

  ok(checkArtefact("a.md", "# Just a map\n\n## 1. Machinery map\nstuff\n").some((f) => f.includes("no contract block at all")),
    "an artefact with NO block at all fires once, not five times");
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "")).some((f) => f.includes("anchor")),
    "a missing anchor fires — an unanchored observation is a finding");

  // ── The qualified commit key (v3) ────────────────────────────────────────────────────────────
  // The KNOWN-GOOD is the load-bearing half here: v2 passed every probe it had while rejecting a
  // real artefact, because nothing exercised an anchor RICHER than the template's.
  {
    const twoRepos = GOOD.replace(
      "commit=93b9437",
      "commit(life-therapy)=b0873a1 · commit(yoros)=7e9f127");
    ok(!checkArtefact("a.md", twoRepos).some((f) => f.includes("anchor")),
      "KNOWN-GOOD: a CROSS-REPO anchor naming a commit per repo passes — the artefact v2 rejected");
    ok(checkArtefact("a.md", twoRepos).length === 0,
      "…and is otherwise clean, so the qualifier did not merely move the failure elsewhere");
    ok(!checkArtefact("a.md", GOOD).some((f) => f.includes("anchor")),
      "KNOWN-GOOD: the plain unqualified `commit=` still passes — the qualifier is optional");

    // The neighbour, which is the whole reason the qualifier is a bounded group and not `.*`.
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "commitment=high")).some((f) => f.includes("anchor")),
      "`commitment=` does NOT satisfy the anchor — a requirement that matches its own neighbour is L-75 inverted");
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "committed to=93b9437")).some((f) => f.includes("anchor")),
      "…nor does a word that merely starts with `commit` and then drifts");
    ok(checkArtefact("a.md", GOOD.replace("commit=93b9437", "commit(unclosed=93b9437")).some((f) => f.includes("anchor")),
      "…nor an UNCLOSED qualifier — `[^)]{1,64}` requires the bracket to shut, not just to open");

    // An anchor line that exists and carries no commit at all must still fire: the line's presence
    // is not the claim, the commit is. This is the case a looser `anchor:.*` would wave through.
    ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, "anchor: task=t · agent=grounder")).some((f) => f.includes("anchor")),
      "an anchor line with NO commit key still fires — the commit is the claim, not the label");
  }

  // The anchor split, both directions.
  ok(!checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).some((f) => f.includes("anchor")),
    "…and is SILENT for a spine that never specified the anchor line — the split, not a qualified tag");
  ok(checkArtefact("a.md", GOOD.replace(/^anchor:.*$/m, ""), false).length === 0,
    "…while that same artefact is otherwise fully checked — the split withholds one assertion, not the check");
  // SUBSET, not STRICT subset: encoding a transient rollout state as an invariant is how the
  // upstream version of this probe broke the moment the rollout caught up.
  ok([...ANCHOR_AGENTS].every((a) => CONTRACT_AGENTS.has(a)),
    "ANCHOR_AGENTS ⊆ CONTRACT_AGENTS — an anchor rule on an unenforced agent would be unreachable");

  // The glyph pair, both directions — and the spine's vocabulary, not the playbook's.
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⛔ proceed — nothing to decide")).some((f) => f.includes("disagree")),
    "a glyph contradicting its own word fires — the whole reason the state is encoded twice");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⚠️ decision-needed — one call for Main")).length === 0,
    "KNOWN-GOOD: ⚠️ with its variation selector pairs with decision-needed and is clean");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "proceed")).some((f) => f.includes("no state glyph")),
    "a bare word with no glyph fires");
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "✅ looks-fine")).some((f) => f.includes("names no state")),
    "an invented verdict word fires");
  // The playbook's own worked example must fail against the spine's vocabulary. This probe is the
  // canon divergence recorded in the header, asserted rather than described — if the playbook is
  // corrected upstream and the spine changes with it, this is the probe that goes red and says so.
  ok(checkArtefact("a.md", GOOD.replace("✅ proceed — nothing to decide", "⏸ Decision needed — 2 of 12 sites")).some((f) => f.includes("no state glyph")),
    "playbook §3's `⏸ Decision needed` is NOT the spine's vocabulary — the divergence, asserted");

  ok(checkArtefact("a.md", GOOD.replace("grounder · P1 · step 1 of 3", "grounder · <pipeline id from the brief> · step <N> of <M>")).some((f) => f.includes("placeholder")),
    "an UNFILLED template echoed back fires — it passes every label test and is still not a report");

  // Discovery, walked for real.
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const tmp = mkdtempSync(join(tmpdir(), "handoff-")).replace(/\\/g, "/");
  // Built from ONE segment, deliberately: upstream, a fixture assembled from parts survived a move
  // of the handoff root and silently stopped matching production.
  mkdirSync(join(tmp, ".handoff", "redirect-map"), { recursive: true });
  writeFileSync(join(tmp, ".handoff", "redirect-map", "01-grounder.md"), GOOD);
  writeFileSync(join(tmp, ".handoff", "redirect-map", "notes.md"), "scratch, not an artefact");
  ok(artefacts(tmp).length === 1, "discovery finds NN-<agent>.md and ignores scratch files beside it");
  ok(artefacts(join(tmp, "nope")).length === 0, "a tree with no handoff directory yields nothing rather than throwing");
  rmSync(tmp, { recursive: true, force: true });

  ok(agentOf(".handoff/t/01-grounder.md") === "grounder", "agentOf reads the agent out of the filename");
  ok(agentOf(".handoff/t/03-db-inspector.md") === "db-inspector", "…including a hyphenated agent name");
  ok(agentOf("notes.md") === null, "…and returns null rather than guessing when the name does not parse");

  const P = (n) => `.handoff/t/${n}`;
  const split = partition([
    P("01-grounder.md"), P("02-census.md"), P("03-walker.md"),
    P("04-db-inspector.md"), P("05-implementer.md"),
    P("06-crawler-doctrine.md"), P("07-main.md"),
  ]);
  ok(split.enforced.length === 5, "MUST ENFORCE — all five spines that carry the block");
  ok(["grounder", "census", "walker", "db-inspector", "implementer"].every((a) => split.enforced.some((p) => agentOf(p) === a)),
    "…and each of the five is named individually, so dropping one fails here rather than silently narrowing the aperture");
  // The boundary must still EXCLUDE something, or it has stopped being a boundary.
  ok(split.skipped.length === 2, "MUST SKIP — crawler-doctrine (stdout is parsed JSON) and main (no spine)");
  ok(split.skipped.some((p) => agentOf(p) === "crawler-doctrine") && split.skipped.some((p) => agentOf(p) === "main"),
    "…and those two specifically — a skip list that drifted to something else is not this exemption");
  ok(partition([P("06-crawler-doctrine.md")]).enforced.length === 0,
    "a crawler-doctrine artefact is skipped even when it DOES carry a block — the boundary is by agent, not by content");

  // ── ReDoS bounds, both directions. The bound must not break the match: a silently disabled check
  // is the failure this whole discipline keeps finding, so the placeholder fires FIRST and the
  // timing asserts second.
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", "Promote    <what to promote>")).some((f) => f.includes("placeholder")),
    "KNOWN-GOOD: an ordinary placeholder still fires with the 200-char bound in place");
  ok(checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(199)}>`)).some((f) => f.includes("placeholder")),
    "…and one exactly at the bound still fires");
  // THE HONEST COST, asserted rather than left implicit: past 200 chars a placeholder is not
  // detected. The spine's longest real placeholder is 31 characters, so the aperture is cheap — but
  // a probe is where a cost like this stays visible.
  ok(!checkArtefact("a.md", GOOD.replace("Promote    none", `Promote    <${"x".repeat(201)}>`)).some((f) => f.includes("placeholder")),
    "…and one PAST the bound does not — the aperture the bound buys, stated");

  const timed = (text) => {
    const t0 = process.hrtime.bigint();
    checkArtefact("a.md", text);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  // THRESHOLD 1000ms. It separates linear from quadratic and the gap is ~100× (upstream measured
  // 58ms vs 5850ms), so a tighter line buys no discriminating power and turns a loaded machine into
  // a red build with no code change — which is how a timing probe gets deleted rather than fixed.
  const THRESHOLD_MS = 1000;
  const bracketMs = timed(GOOD.replace("Promote    none", `Promote    ${"<".repeat(120_000)}`));
  ok(bracketMs < THRESHOLD_MS, `a 120k-'<' run with no '>' completes in ${bracketMs.toFixed(0)}ms — bounded, not quadratic`);
  const blankMs = timed(`${"\n".repeat(60_000)}anchor: task=t · commit=abc1234\n${GOOD}`);
  ok(blankMs < THRESHOLD_MS, `a 60k-newline blank region completes in ${blankMs.toFixed(0)}ms — [ \\t]* cannot cross lines`);

  // The parse cap, both directions.
  ok(checkArtefact("a.md", GOOD).length === 0, "KNOWN-GOOD: an ordinary artefact is nowhere near the parse cap");
  {
    const over = checkArtefact("a.md", `${GOOD}\n${"x".repeat(1024 * 1024)}`);
    ok(over.length === 1 && over[0].includes("parse cap"),
      "an artefact past the parse cap is REFUSED with one finding — not truncated, which would report a well-formed contract for a file whose block sits past the cut");
  }

  // ── v5: the path a citation names ────────────────────────────────────────────────────────────
  // Every shape below is one the real life-therapy artefact carries, in both directions.
  {
    const cases = [
      ["lib/auth.ts:24-57", "lib/auth.ts"],
      ["login/mfa/actions.ts:11-13, 44-58", "login/mfa/actions.ts"],
      ["lib/supabase/middleware.ts:updateSession", "lib/supabase/middleware.ts"],
      ["app/(admin)/admin/(dashboard)/users/[id]/reset-mfa-button.tsx", "app/(admin)/admin/(dashboard)/users/[id]/reset-mfa-button.tsx"],
      [".claude/rules/schema-changes.md", ".claude/rules/schema-changes.md"],
      ["./lib/x.ts", "lib/x.ts"],
      ["proxy.ts", "proxy.ts"],
      ["/api/auth/role", null], ["@supabase/ssr", null], ["../yoros/lib/x.ts", null], [".handoff", null],
      [".claude/rules/", null], ["supabase.auth.getUser()", null], ["C:\\dev\\life-therapy\\lib\\x.ts", null],
      ["backup.?code|recovery.?code", null], ["prisma.student.findUnique", null], ["model Student { id String }", null],
    ];
    const wrong = cases.filter(([span, want]) => candidateOf(span) !== want);
    ok(wrong.length === 0, `a citation's path is read off every span shape the real artefact carries (${cases.length} cases)` +
      (wrong.length ? ` — wrong: ${wrong.map(([s]) => `\`${s}\` → ${candidateOf(s)}`).join(", ")}` : ""));
    const cited = citations("see `lib/a.ts:3` and `lib/a.ts:9`\nthen `/admin` and `b.ts`\n");
    ok(JSON.stringify([...cited]) === JSON.stringify([["lib/a.ts", [1]], ["b.ts", [2]]]),
      "citations() maps each file to the lines citing it, once per line, and skips what is not a file");
  }

  // ── v5: L-41's window, both bounds, both directions ──────────────────────────────────────────
  // The resolver is faked so the window itself is probed with exact times; the real resolver and
  // real mtimes are exercised by the spawned run below.
  {
    const T0 = Date.parse("2026-08-31T06:00:32Z");
    const W = T0 + 241_000;
    const mt = { "lib/in.ts": T0 + 60_000, "lib/before.ts": T0 - 60_000, "lib/after.ts": W + 60_000, "lib/at-utc.ts": T0, "lib/at-written.ts": W };
    const resolvePath = (c) => (c in mt ? { path: c, mtimeMs: mt[c] } : c.includes("/") ? { unresolved: "no such file here" } : null);
    const art = (cites) => `anchor: task=t · agent=grounder · utc=2026-08-31T06:00:32Z · commit=93b9437\n${cites.map((c) => `- \`${c}\``).join("\n")}\n`;
    const q = (cites) => tell(art(cites), { writtenMs: W, resolvePath }).quarantined.map((x) => x.path);
    ok(q(["lib/in.ts"]).length === 1, "a cited file edited INSIDE the run is QUARANTINED");
    ok(q(["lib/before.ts"]).length === 0, "KNOWN-GOOD: one edited before the anchor is not — the agent read those bytes");
    ok(q(["lib/after.ts"]).length === 0, "KNOWN-GOOD: one edited AFTER the artefact was written is not — that is staleness, a different lesson");
    ok(q(["lib/at-utc.ts"]).length === 0, "…the lower bound is exclusive: an mtime equal to utc= is not inside the run");
    ok(q(["lib/at-written.ts"]).length === 1, "…the upper bound is inclusive: an mtime equal to the artefact's is");
    const t = tell(art(["lib/gone.ts", "user.id"]), { writtenMs: W, resolvePath });
    ok(t.unresolved.length === 1 && t.unresolved[0].startsWith("lib/gone.ts"),
      "a cited path that does not resolve is NAMED, not passed — and a bare identifier is not a citation");
    ok(!tell(art(["lib/in.ts"]).replace(/ · utc=\S+/, ""), { writtenMs: W, resolvePath }).measured,
      "an artefact with no utc= predates the anchor: NOT MEASURED, never passed");
    ok(!tell(art(["lib/in.ts"]), { writtenMs: T0 - 1, resolvePath }).measured,
      "an artefact written before its own anchor is NOT MEASURED — its window is empty, not clean");
    ok([...CONTRACT_AGENTS].filter((a) => !TELL_AGENTS.has(a)).join() === "implementer",
      "the tell skips exactly the implementer — the one agent that edits what it cites, and what the skip line names");
  }

  // ── v5: the resolver, with a faked stat ──────────────────────────────────────────────────────
  {
    const disk = { "/r/lib/rate-limit-db.ts": 5, "/r/a/actions.ts": 6, "/r/b/actions.ts": 7 };
    const stat = (p) => {
      const k = p.replace(/\\/g, "/");
      if (!(k in disk)) throw new Error("ENOENT");
      return { isFile: () => true, mtimeMs: disk[k] };
    };
    const r = makeResolver("/r", ["lib/rate-limit-db.ts", "a/actions.ts", "b/actions.ts"], stat);
    ok(r("lib/rate-limit-db.ts")?.path === "lib/rate-limit-db.ts", "an exact repo-relative path resolves");
    ok(r("rate-limit-db.ts")?.path === "lib/rate-limit-db.ts", "a bare name with ONE suffix match resolves to it");
    ok(r("actions.ts")?.unresolved?.includes("2 files"), "an AMBIGUOUS suffix is unresolved, not guessed");
    ok(r("user.id") === null && r("lib/nope.ts")?.unresolved, "a bare non-match is an identifier; a slashed one is named unresolved");
  }

  // ── v5: L-39's stamp, against a faked git ────────────────────────────────────────────────────
  {
    const at = { "93b9437": "<!-- SPINE:grounder v7 -->\nbody", b0873a1: "<!-- SPINE:grounder v6 -->", "1111111": "no marker" };
    const readAt = (sha, agent) => (agent === "grounder" && sha in at ? at[sha] : null);
    const anch = (fields) => `anchor: task=t · agent=grounder · ${fields} · utc=2026-08-31T06:00:32Z\n`;
    ok(compareStamp(anch("spine=grounder v7 · commit=93b9437"), readAt).kind === "match", "KNOWN-GOOD: a stamp its commit holds is silent");
    const mm = compareStamp(anch("spine=grounder v6 · commit=93b9437"), readAt);
    ok(mm.kind === "mismatch" && mm.stamped === "6" && mm.held === "7", "a stamp its commit does NOT hold is reported with both versions");
    ok(compareStamp(anch("commit=93b9437"), readAt).kind === "unstamped", "an artefact with no stamp predates the field: counted, not failed");
    ok(compareStamp(anch("spine=grounder v6 · commit(yoros)=7e9f127 · commit(life-therapy)=b0873a1"), readAt).kind === "match",
      "a cross-repo anchor is read at the commit that resolves HERE, not at the first one written");
    ok(compareStamp(anch("spine=grounder v6 · commit=deadbee"), readAt).kind === "unmeasured", "a commit that does not resolve here is NOT MEASURED");
    ok(compareStamp(anch("spine=grounder v6 · commit=1111111"), readAt).kind === "unmeasured", "a spine with no SPINE marker at that commit is NOT MEASURED");
  }

  // ── v5: every exit path, through the process the gate runs (L-51; life-therapy CF-2) ─────────
  // Each spawn points `--root` at a fixture, never at this tree: a clean fixture must stay clean in
  // every adopter. None runs the gate chain (L-34).
  {
    const self = fileURLToPath(import.meta.url);
    const spawn = (...args) => spawnSync(process.execPath, [self, ...args], { encoding: "utf8", timeout: 60_000 });
    const git = (cwd, ...args) => spawnSync("git", args, { cwd, encoding: "utf8" });
    const fx = mkdtempSync(join(tmpdir(), "handoff-exit-")).replace(/\\/g, "/");
    const plant = (name, files) => {
      for (const [rel, body] of Object.entries(files)) {
        mkdirSync(dirname(join(fx, name, rel)), { recursive: true });
        writeFileSync(join(fx, name, rel), body);
      }
      return join(fx, name);
    };

    const clean = spawn("--root", plant("clean", { ".handoff/t/01-grounder.md": GOOD }));
    ok(clean.status === 0 && clean.stdout.includes("🤝 handoff-contract: 1 artefact(s)"),
      `EXIT 0 — a fixture with one well-formed artefact passes through the real process (status ${clean.status})`);
    const broken = spawn("--root", plant("broken", { ".handoff/t/01-grounder.md": GOOD.replace(/^Promote.*$/m, "") }));
    ok(broken.status === 1 && broken.stderr.includes("Promote"),
      `EXIT 1 — a fixture with a broken block fails through the real process (status ${broken.status})`);
    const nowhere = spawn("--root", join(fx, "does-not-exist"));
    ok(nowhere.status === 2, `EXIT 2 — a --root that is not a directory is refused, not read as 0 artefacts (status ${nowhere.status})`);

    // The tells, on real files with real mtimes and a real git tree — and still EXIT 0, because a
    // tell is never a failure. The tree is written with `git write-tree`: `git show <tree>:<path>`
    // reads it exactly as it reads a commit, and no commit is made.
    const T0 = Math.floor(Date.now() / 1000) * 1000 - 3_600_000;
    const utc = iso(T0);
    const cites = "Read `lib/in.ts:3`, `before.ts`, `lib/after.ts:9` and `lib/gone.ts`.\n";
    const tells = plant("tells", {
      "lib/in.ts": "x", "lib/before.ts": "x", "lib/after.ts": "x",
      ".claude/agents/grounder.md": "<!-- SPINE:grounder v7 -->\nbody\n<!-- /SPINE:grounder -->\n",
    });
    git(tells, "init", "-q");
    git(tells, "add", "-A");
    const tree = git(tells, "write-tree").stdout.trim().slice(0, 12);
    // …and then the working tree MOVES to the stamp's version, so a reader that looked at the file on
    // disk would see agreement where the anchor's tree holds a difference (CF-3: never the working tree).
    writeFileSync(join(tells, ".claude/agents/grounder.md"), "<!-- SPINE:grounder v6 -->\nbody\n<!-- /SPINE:grounder -->\n");
    const artefact = (agent) => GOOD.replace(/^anchor:.*$/m, `anchor: task=t · agent=${agent} · spine=grounder v6 · utc=${utc} · commit=${tree}`).replace("## 1. Machinery map", `## 1. Machinery map\n${cites}`);
    plant("tells", { ".handoff/t/01-grounder.md": artefact("grounder"), ".handoff/t/02-implementer.md": artefact("implementer") });
    const s = (ms) => ms / 1000;
    utimesSync(join(tells, "lib/in.ts"), s(T0 + 60_000), s(T0 + 60_000));
    utimesSync(join(tells, "lib/before.ts"), s(T0 - 60_000), s(T0 - 60_000));
    utimesSync(join(tells, "lib/after.ts"), s(T0 + 180_000), s(T0 + 180_000));
    for (const a of ["01-grounder.md", "02-implementer.md"]) utimesSync(join(tells, ".handoff/t", a), s(T0 + 120_000), s(T0 + 120_000));
    const told = spawn("--root", tells);
    const out = told.stdout;
    ok(told.status === 0, `EXIT 0 — a QUARANTINED citation and a spine mismatch are tells, not failures (status ${told.status})`);
    ok(/QUARANTINED \.handoff\/t\/01-grounder\.md:\d+ cites lib\/in\.ts/.test(out),
      "…the real run marks the file edited inside the window, with the artefact line citing it");
    ok(!/cites lib\/before\.ts/.test(out) && !/cites lib\/after\.ts/.test(out),
      "…and not the one edited before it, nor the one edited after");
    ok(out.includes("1 artefact(s) measured, 3 citation(s) resolved, 1 edited during their run"),
      "…having RESOLVED all three — `before.ts` through git's file list — so the unmarked two were measured, not dropped");
    ok(!/QUARANTINED \.handoff\/t\/02-implementer/.test(out) && out.includes("1 implementer artefact(s) not measured"),
      "…and does not measure the implementer's artefact, which says so");
    ok(/01-grounder\.md: 1 cited path\(s\) NOT MEASURED[^\n]*lib\/gone\.ts/.test(out), "…and names the path that does not resolve");
    ok(/SPINE \.handoff\/t\/01-grounder\.md stamps grounder v6; [^\n]* is v7/.test(out),
      "…and reads the spine at the anchor's tree through git, reporting the stamp it does not hold");
    rmSync(fx, { recursive: true, force: true });
  }

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a missing, unfilled or self-contradicting block, quiet on a well-formed one, and enforces only the spines that carry it");
  process.exit(failed ? 1 : 0);
}

if (isEntry && !process.argv.includes("--selftest")) {
  // `--root` exists so the exit probes can point this file at a fixture instead of the adopter's
  // tree (life-therapy CF-2: a clean fixture must stay clean in every adopter). A root that is not a
  // directory exits 2: it would otherwise report "0 artefacts", which reads as a pass.
  const at = process.argv.indexOf("--root");
  let root = ROOT;
  if (at > 0) {
    const arg = process.argv[at + 1];
    let isDir = false;
    try { isDir = Boolean(arg) && statSync(arg).isDirectory(); } catch { isDir = false; }
    if (!isDir) {
      console.error(`❌ handoff-contract: --root ${arg ?? "(no value)"} is not a directory — nothing was checked`);
      process.exit(2);
    }
    root = resolve(arg).replace(/\\/g, "/");
  }
  const { enforced, skipped } = partition(artefacts(root));
  const findings = enforced.flatMap((f) =>
    checkArtefact(f.replace(`${root}/`, ""), readFileSync(f, "utf8"), ANCHOR_AGENTS.has(agentOf(f))));

  // Named before the verdict, pass or fail. An artefact outside the rollout boundary is a thing the
  // check DID NOT LOOK AT, and a reader has to see that without reading the source.
  if (skipped.length) {
    console.log("   not checked — no contract block required of this writer (crawler-doctrine: stdout is parsed JSON; main: no spine):");
    for (const f of skipped) console.log(`     · ${f.replace(`${root}/`, "")}`);
  }
  // The tells, before the verdict and whatever it is: they are never findings, so a red run must
  // not hide them and a green one must not swallow them.
  for (const l of tellLines(root, enforced)) console.log(l);

  if (findings.length) {
    console.error(`\n❌ handoff-contract: ${findings.length} finding(s) across ${enforced.length} artefact(s)\n`);
    for (const f of findings) console.error(`   ${f}`);
    process.exit(1);
  }
  // The denominator is printed deliberately: this directory is task-scoped scratch and is empty on
  // a clean tree, so "0 artefacts" has to be VISIBLE rather than read as "all artefacts passed".
  console.log(`🤝 handoff-contract: ${enforced.length} artefact(s) carry a well-formed contract block`);
}
