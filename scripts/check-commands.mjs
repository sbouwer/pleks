#!/usr/bin/env node
/**
 * scripts/check-commands.mjs — a slash command briefs the agents it spawns, and restates none of them.
 *
 * @kit check-commands v1 — tracked. Edit it in dev-standards and re-adopt; a local change here is a
 * fork, and `check-kit-drift.mjs` will say so.
 *
 * WHY (CD agent-setup review item 3, 2026-09-30). Briefs are the caller's half of the handoff
 * contract, and the commands are the only reusable brief sites. They were per-project and they had
 * drifted: pleks's /build spawned the grounder with no artefact path, so agent-brief-gate refused the
 * first step of every build; its /walk restated the walker's method inline and omitted three of its
 * steps, the second time that class recurred (L-63 recorded /walk describing v6's report format while
 * the agent ran v7). The commands are now kit-tracked, and this file holds the two rules that made
 * them worth tracking:
 *
 *   1. A COMMAND RESTATES NO SPINE. Any run of RUN_WORDS consecutive words shared between a command
 *      and a SPINE block (a role, or the shared contract) fails. A restated spine is a second copy
 *      that check-agent-spines cannot see, and it goes stale the day the spine is bumped. The command
 *      points at the agent file instead ("apply `.claude/agents/walker.md` §Method in full").
 *   2. EVERY SPAWN CARRIES ITS BRIEF. A paragraph telling Main to spawn a spined agent must be
 *      answered, somewhere in the same command, by a brief template naming that agent's artefact —
 *      `artefact: .handoff/<slug>/<NN>-<agent>.md` — and every `pipeline:` template names an
 *      artefact. That is what agent-brief-gate demands at the tool call; this is the same demand at
 *      the one place a brief is written down in advance.
 *
 * WORDS, NOT BYTES. The comparison lowercases and drops punctuation and markup, so a re-wrapped or
 * re-bolded restatement is still one. RUN_WORDS is 12: shorter runs match the ordinary phrases a
 * command and a spine legitimately share ("the project's named gate"); a twelve-word run is a copied
 * sentence.
 *
 * WHAT IT CANNOT SEE: a paraphrase. A command that restates the walker's method in new words passes.
 * The rule is still the rule; this catches the copy, which is how every recorded instance happened.
 *
 * Run: node scripts/check-commands.mjs              (.claude/commands/*.md against .claude/agents/)
 *      node scripts/check-commands.mjs --selftest   (probes both directions, and every exit)
 *      node scripts/check-commands.mjs --agents <dir> --commands <file> [<file>…]   (canon's run)
 * Exit: 0 clean · 1 findings · 2 a named input does not exist.
 */
import { readdirSync, readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The shortest shared run that counts as a restatement. See the header. */
export const RUN_WORDS = 12;

/** Lowercased words, markup and punctuation dropped. Apostrophes and hyphens stay inside a word. */
export function words(text) {
  return text.toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) ?? [];
}

/** Every SPINE block in `text`: `{ name, version, body }`. Bounded, so a stray marker stays linear. */
export function spineBlocks(text) {
  const out = [];
  for (const m of text.matchAll(/<!--[ \t]*SPINE:([a-z-]{1,40})[ \t]+v(\d{1,4})[ \t]*-->/g)) {
    const close = text.indexOf(`<!-- /SPINE:${m[1]} -->`, m.index);
    if (close === -1) continue;
    out.push({ name: m[1], version: m[2], body: text.slice(m.index + m[0].length, close) });
  }
  return out;
}

/** Every `*.md` in `dir` and its immediate subdirectories — canon keeps the contract in `shared/`. */
export function agentFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      for (const g of readdirSync(p)) if (g.endsWith(".md")) out.push(join(p, g));
    } else if (f.endsWith(".md")) {
      out.push(p);
    }
  }
  return out.sort();
}

/**
 * The index a restatement check runs against: every RUN_WORDS-gram of every distinct spine block →
 * the block's name. Distinct by name and version, because every project agent file carries the same
 * contract block and indexing it seven times buys nothing.
 */
export function spineIndex(files, read = (p) => readFileSync(p, "utf8")) {
  const grams = new Map();
  const seen = new Set();
  const names = new Set();
  for (const f of files) {
    for (const b of spineBlocks(read(f))) {
      if (b.name !== "contract") names.add(b.name);
      const key = `${b.name} v${b.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const w = words(b.body);
      for (let i = 0; i + RUN_WORDS <= w.length; i++) {
        const g = w.slice(i, i + RUN_WORDS).join(" ");
        if (!grams.has(g)) grams.set(g, key);
      }
    }
  }
  return { grams, blocks: seen, agents: names };
}

/** Each maximal run of a command's words that a spine also holds: `{ spine, text }`. */
export function restatements(commandText, index) {
  const w = words(commandText);
  const out = [];
  let i = 0;
  while (i + RUN_WORDS <= w.length) {
    const spine = index.grams.get(w.slice(i, i + RUN_WORDS).join(" "));
    if (!spine) { i++; continue; }
    let end = i + RUN_WORDS;
    while (end < w.length && index.grams.has(w.slice(end - RUN_WORDS + 1, end + 1).join(" "))) end++;
    out.push({ spine, text: w.slice(i, end).join(" ") });
    i = end;
  }
  return out;
}

/**
 * Brief findings for one command. `agents` is the set of spined agent names. A paragraph that says
 * "spawn" and names an agent in backticks must be answered by an `artefact:` template for it in the
 * same file; every `pipeline:` template line must name an artefact.
 */
export function briefFindings(commandText, agents) {
  const out = [];
  const spawned = new Set();
  for (const para of commandText.split(/\n[ \t]*\n/)) {
    if (!/\bspawn/i.test(para)) continue;
    for (const m of para.matchAll(/`([a-z][a-z-]{0,39})`/g)) if (agents.has(m[1])) spawned.add(m[1]);
  }
  for (const a of spawned) {
    const briefed = new RegExp(`artefact:[ \\t]*\\.handoff/[^/\\s\`]{1,120}/(?:\\d{2}|<NN>)-${a}\\.md`).test(commandText);
    if (!briefed) out.push(`spawns \`${a}\` and carries no brief template naming its artefact — \`artefact: .handoff/<slug>/<NN>-${a}.md\`; agent-brief-gate refuses the spawn without one`);
  }
  for (const line of commandText.split("\n")) {
    if (/^\s*pipeline:/.test(line) && !/\bartefact:/.test(line)) {
      out.push(`a brief template names no artefact: "${line.trim().slice(0, 100)}"`);
    }
  }
  return out;
}

/** Findings across `commands` (paths) against the spines in `agentPaths`, plus the denominators. */
export function audit(commands, agentPaths, read = (p) => readFileSync(p, "utf8")) {
  const index = spineIndex(agentPaths, read);
  const findings = [];
  for (const c of commands) {
    const text = read(c);
    const at = c.replace(/\\/g, "/");
    for (const r of restatements(text, index)) {
      const shown = r.text.split(" ");
      findings.push(`${at}: restates ${r.spine} — "${shown.slice(0, 16).join(" ")}${shown.length > 16 ? " …" : ""}" (${shown.length} words). Point at the agent file instead; a copy here goes stale when the spine moves`);
    }
    for (const f of briefFindings(text, index.agents)) findings.push(`${at}: ${f}`);
  }
  return { findings, blocks: index.blocks.size, agents: index.agents.size };
}

const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0;
  const ok = (c, l) => {
    if (!c) failed++;
    console.log(`  ${c ? "✓" : "✗"} ${l}`);
  };
  const WALKER = "<!-- SPINE:walker v10 -->\n## Role: walker\n\n2. **Fail-open hunt.** For each guard, check or computation: what happens on malformed, missing,\n   stale or out-of-range input? Does it fail toward \"valid\"? The surface lists shapes that shipped.\n<!-- /SPINE:walker -->\n";
  const CONTRACT = "<!-- SPINE:contract v1 -->\n**Never report a signal you cannot observe.** A permission prompt, a hook firing, an approval:\nintercepted, allowed and unmatched return the same tool result.\n<!-- /SPINE:contract -->\n";
  const files = { "a/walker.md": CONTRACT + WALKER, "a/census.md": CONTRACT + "<!-- SPINE:census v12 -->\ncount it\n<!-- /SPINE:census -->\n" };
  const read = (p) => files[p];
  const idx = spineIndex(Object.keys(files), read);
  ok(idx.agents.has("walker") && idx.agents.has("census") && !idx.agents.has("contract"), "the spined agents are read off the SPINE markers, and the contract is not an agent");
  ok(idx.blocks.size === 3, "the contract block, carried by both files, is indexed once");

  const GOOD = [
    "Walk it. Spawn the `walker` with this brief:",
    "",
    "```",
    "pipeline: walk · step 1 of 2 · artefact: .handoff/walk-x/01-walker.md",
    "```",
    "",
    "If walking inline, apply `.claude/agents/walker.md` §Method in full.",
  ].join("\n");
  ok(restatements(GOOD, idx).length === 0 && briefFindings(GOOD, idx.agents).length === 0, "KNOWN-GOOD: a command that briefs the walker and points at its method");

  const copied = `${GOOD}\n\n3. **Fail-open hunt.** For each guard, check, or computation: what happens on malformed, missing, stale or out-of-range input?\n`;
  const r = restatements(copied, idx);
  ok(r.length === 1 && r[0].spine === "walker v10", "a copied spine step fires, naming the spine it came from");
  ok(r.length === 1 && r[0].text.startsWith("fail-open hunt for each guard check or computation"), "…re-punctuated, re-numbered and re-bolded, it is still the same words");
  ok(r.length === 1 && r[0].text.endsWith("stale or out-of-range input"), "…and the finding spans the whole copied run, not its first window");
  ok(restatements("input does it fail toward valid the surface lists shapes that shipped", idx).length === 1, "a copy of a block's LAST window fires — the index reaches the end of every block");
  ok(restatements(`${GOOD}\nA permission prompt, a hook firing, an approval: intercepted, allowed and unmatched return the same tool result.`, idx).some((x) => x.spine === "contract v1"),
    "restating the shared CONTRACT fires too — it is a spine block like the roles");
  const eleven = "for each guard check or computation what happens on malformed missing";
  ok(words(eleven).length === RUN_WORDS - 1 && restatements(eleven, idx).length === 0, `a shared run of ${RUN_WORDS - 1} words does not — the threshold is ${RUN_WORDS}`);
  ok(restatements(`${eleven} stale`, idx).length === 1, `…and one of exactly ${RUN_WORDS} does`);
  ok(restatements(`${copied}\nand again: For each guard, check or computation: what happens on malformed, missing, stale or out-of-range input`, idx).length === 2,
    "two separate copies are two findings, and one long copy is one");

  const unbriefed = "Spawn the `walker` on the diff and fold its findings in.";
  ok(briefFindings(unbriefed, idx.agents).some((f) => f.includes("spawns `walker`")), "a spawn with no brief template anywhere in the command fires");
  ok(briefFindings("Spawn one `census` per claim.\n\n`pipeline: walk · step <NN> of <N> · artefact: .handoff/w/<NN>-census.md`", idx.agents).length === 0,
    "KNOWN-GOOD: a `<NN>` placeholder in the template answers the spawn");
  ok(briefFindings("Spawn the `walker`.\n\nartefact: .handoff/w/01-census.md", idx.agents).some((f) => f.includes("spawns `walker`")),
    "…and another agent's template does not");
  ok(briefFindings("Read `walker.md` and the `census` output; nothing else runs.", idx.agents).length === 0, "an agent named in a paragraph that spawns nothing is not a spawn");
  ok(briefFindings("```\npipeline: P1 · step 1 of 3\n```", idx.agents).some((f) => f.includes("names no artefact")), "a `pipeline:` template with no artefact fires");
  ok(briefFindings("Spawn the `scout`.", idx.agents).length === 0, "an agent this tree has no spine for is not asked about");
  ok(briefFindings("Spawn the `census`.\n\nartefact: .handoff/w/01-census.md\n\nThen read the `walker` artefact.", idx.agents).length === 0,
    "a spawn is read per PARAGRAPH — an agent named beside no spawn is not spawned because another paragraph spawns");

  // Every exit, through the real process (L-51). Fixtures only; never this tree.
  {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const fx = mkdtempSync(join(tmpdir(), "commands-"));
    const self = fileURLToPath(import.meta.url);
    const run = (...a) => spawnSync(process.execPath, [self, ...a], { encoding: "utf8", timeout: 60_000 });
    mkdirSync(join(fx, "agents", "shared"), { recursive: true });
    writeFileSync(join(fx, "agents", "walker.md"), WALKER);
    writeFileSync(join(fx, "agents", "shared", "contract.md"), CONTRACT);
    writeFileSync(join(fx, "good.md"), GOOD);
    writeFileSync(join(fx, "bad.md"), copied.replace(/^pipeline:.*$/m, "no brief here"));
    const g = run("--agents", join(fx, "agents"), "--commands", join(fx, "good.md"));
    ok(g.status === 0 && /1 command\(s\) against 2 spine block\(s\)/.test(g.stdout), `EXIT 0 — a clean command, with its denominator (status ${g.status})`);
    const b = run("--agents", join(fx, "agents"), "--commands", join(fx, "good.md"), join(fx, "bad.md"));
    ok(b.status === 1 && /bad\.md: restates walker v10/.test(b.stderr) && /bad\.md: spawns `walker`/.test(b.stderr),
      `EXIT 1 — a restating, unbriefed command fails, naming both (status ${b.status})`);
    ok(run("--agents", join(fx, "nope"), "--commands", join(fx, "good.md")).status === 2, "EXIT 2 — an --agents directory that is not there is refused, not read as no spines");
    ok(run("--agents", join(fx, "agents"), "--commands", join(fx, "missing.md")).status === 2, "EXIT 2 — a named command that is not there is refused");
    // The default roots: a project with commands and agents under .claude/.
    mkdirSync(join(fx, "proj", ".claude", "commands"), { recursive: true });
    mkdirSync(join(fx, "proj", ".claude", "agents"), { recursive: true });
    writeFileSync(join(fx, "proj", ".claude", "agents", "walker.md"), CONTRACT + WALKER);
    writeFileSync(join(fx, "proj", ".claude", "commands", "walk.md"), copied);
    const d = run("--root", join(fx, "proj"));
    ok(d.status === 1 && /walk\.md: restates walker v10/.test(d.stderr), `EXIT 1 — the default roots read .claude/commands against .claude/agents (status ${d.status})`);
    mkdirSync(join(fx, "bare"), { recursive: true });
    const n = run("--root", join(fx, "bare"));
    ok(n.status === 0 && /0 command\(s\)/.test(n.stdout) && /NOT MEASURED/.test(n.stdout),
      `EXIT 0 — a project with no commands says 0, and says the spine half was NOT MEASURED (status ${n.status})`);
    rmSync(fx, { recursive: true, force: true });
  }

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on a copied spine and an unbriefed spawn, quiet on a command that points and briefs");
  process.exit(failed ? 1 : 0);
}

if (isEntry && !process.argv.includes("--selftest")) {
  const argv = process.argv.slice(2);
  const valueOf = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1] ?? "";
  };
  const root = valueOf("--root") ?? ROOT;
  const agentsDir = valueOf("--agents") ?? join(root, ".claude", "agents");
  let commands;
  const ci = argv.indexOf("--commands");
  if (ci !== -1) {
    commands = [];
    for (const a of argv.slice(ci + 1)) {
      if (a.startsWith("--")) break;
      commands.push(a);
    }
  } else {
    const dir = join(root, ".claude", "commands");
    commands = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => join(dir, f)) : [];
  }
  const missing = commands.filter((c) => !existsSync(c));
  if (missing.length) {
    console.error(`❌ commands: ${missing.join(", ")} not found — nothing was checked`);
    process.exit(2);
  }
  if (valueOf("--agents") !== null && !existsSync(agentsDir)) {
    console.error(`❌ commands: --agents ${agentsDir} is not there — a missing spine set must not read as a command that restates none`);
    process.exit(2);
  }
  const { findings, blocks, agents } = audit(commands, agentFiles(agentsDir));
  if (!blocks) console.log(`   NOT MEASURED — no SPINE blocks under ${basename(dirname(agentsDir))}/${basename(agentsDir)}/, so no command was checked for restating one`);
  if (findings.length) {
    console.error(`\n❌ commands: ${findings.length} finding(s) across ${commands.length} command(s)\n`);
    for (const f of findings) console.error(`   ${f}`);
    process.exit(1);
  }
  console.log(`📜 commands: ${commands.length} command(s) against ${blocks} spine block(s) across ${agents} agent(s) — none restates a spine, every spawn is briefed`);
}
