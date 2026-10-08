#!/usr/bin/env node
/**
 * .claude/hooks/canon-inbox.probe.mjs — canon-inbox.js in both directions, run as Claude Code runs it.
 *
 * @kit canon-inbox-probe v6 — tracked. It has no config region: its cases are the hook's contract.
 *
 * Run: `node .claude/hooks/canon-inbox.probe.mjs` — exit 0 only if every case holds.
 *
 * WHAT IT HOLDS. The hook's whole job is one line or silence, and its failure is a silence that
 * means "could not look" read as "nothing pending". So the cases are mostly the not-looking ones:
 * no canon, a canon that crashes, one that hangs — each must print NOT MEASURED and exit 0, because
 * a SessionStart hook that exits non-zero is an error the person sees on every session. Each runs a
 * PLANTED copy of the hook in a temp directory beside a fake canon; nothing is written to this tree.
 *
 * ONE LIVE CASE, against the real canon, when one is reachable: a copy planted a version behind must
 * be named, inside the time a session start can afford. No reachable canon is SKIPPED, not passed.
 *
 * v3 (2026-10-06, pleks CF-19): THE LIVE CASE GATES ONLY CANON. Run from an adopter's tree it reads a
 * SIBLING checkout's working tree, so the adopter's commit gate turned on canon's uncommitted state,
 * and a green named no committed canon. That is the 2026-09-09 unattributable run seen from the
 * project side. There it is ADVISORY: printed with the canon SHA it read and whether that tree was
 * dirty, never counted. Run from canon's own `kit/project-kit/hooks/` it still gates, because there
 * the tree it reads is the tree being gated. The banner counts what held, what was skipped and what
 * was advisory; it no longer says "every case holds" over a case that did not run.
 *
 * v4 (2026-10-08): the hook speaks after a push too. A push asks canon with `--after-task` and
 * answers under PostToolUse; any other Bash call is silent WITHOUT asking canon, which a canon that
 * crashes when asked proves; a stdin that is not JSON still reads as a session start.
 *
 * v6 (2026-10-08, blindly CF-12): an escaped space, an escaped quote and a backslash-newline in a
 * push speak; the same escapes around a non-push stay silent, and `'…\'` ends its quote.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = readFileSync(join(HERE, "canon-inbox.js"), "utf8");
const fwd = (p) => p.replace(/\\/g, "/");
const work = mkdtempSync(join(tmpdir(), "canon-inbox-"));
let failed = 0;
let held = 0;
const notCounted = [];
const check = (label, ok, got = "") => {
  if (ok) held++; else failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : ` — got ${JSON.stringify(got).slice(0, 300)}`}`);
};

/** A directory with a package.json saying ESM, so a planted `.js` reads as the module it is. */
function dir(...parts) {
  const d = join(work, ...parts);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "package.json"), '{ "type": "module" }\n');
  return d;
}

/** A fake canon whose tools/inbox.mjs runs `body`. */
function fakeCanon(name, body) {
  const c = dir(name);
  mkdirSync(join(c, "tools"), { recursive: true });
  writeFileSync(join(c, "tools", "inbox.mjs"), body);
  return c;
}

/** Plant the hook, optionally with its config region filled and its timeout shortened. */
function plant(at, { canon, project, timeout } = {}) {
  let text = HOOK;
  if (canon !== undefined) text = text.replace("const CANON_DIR = null;", `const CANON_DIR = ${JSON.stringify(fwd(canon))};`);
  if (project !== undefined) text = text.replace("const PROJECT = null;", `const PROJECT = ${JSON.stringify(project)};`);
  if (timeout !== undefined) text = text.replace("const TIMEOUT_MS = 8_000;", `const TIMEOUT_MS = ${timeout};`);
  const file = join(dir(at), "canon-inbox.js");
  writeFileSync(file, text);
  return file;
}

const START = JSON.stringify({ hook_event_name: "SessionStart", source: "startup" });
const bashCall = (command) => JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command } });

function run(hook, projectDir, input = START) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [hook], {
    encoding: "utf8",
    input,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    timeout: 20_000,
  });
  let out = null;
  try { out = r.stdout.trim() ? JSON.parse(r.stdout) : null; } catch { out = { unparsed: r.stdout }; }
  return { status: r.status, out, raw: r.stdout, ms: Date.now() - t };
}
const msg = (r) => r.out?.systemMessage ?? "";

try {
  // The region ships empty, or every adopter inherits a path from canon's machine.
  check("the config region ships both values null — a path here is a path on the adopter's machine",
    HOOK.includes("const CANON_DIR = null;") && HOOK.includes("const PROJECT = null;"));

  // 1 · No canon beside the project or above it: NOT MEASURED, naming where it looked from.
  {
    const proj = dir("lone", "myproj");
    const r = run(plant("lone-hook"), proj);
    check("no canon: one NOT MEASURED line naming the project it searched up from, and exit 0",
      r.status === 0 && msg(r).includes("NOT MEASURED") && msg(r).includes(fwd(proj)) && msg(r).includes("any folder above it"), r);
  }

  // 1b · A CLIENT FOLDER: `<dev>/<client>/<project>` finds `<dev>/dev-standards`. v1 looked only
  //      beside the project, so every session in a client's project was NOT MEASURED.
  {
    const proj = dir("estate", "acme", "website");
    fakeCanon(join("estate", "dev-standards"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
    const r = run(plant("nest-hook"), proj);
    const args = (() => { try { return JSON.parse(msg(r)); } catch { return null; } })();
    check("client folder: canon two levels up is found, and asked about this tree",
      Array.isArray(args) && args[0] === "website" && args[2] === "--tree" && resolve(args[3]) === resolve(proj), r);
  }

  // 2 · The default: canon is the dev-standards BESIDE the project, and the project is its folder name.
  {
    const proj = dir("side", "myproj");
    fakeCanon(join("side", "dev-standards"), "console.log(JSON.stringify(process.argv.slice(2)));\n");
    const r = run(plant("side-hook"), proj);
    const args = (() => { try { return JSON.parse(msg(r)); } catch { return null; } })();
    check("default: asks the sibling canon for <folder name> --quick --tree <project dir>",
      Array.isArray(args) && args[0] === "myproj" && args[1] === "--quick" && args[2] === "--tree" && resolve(args[3]) === resolve(proj), r);
  }

  // 3 · The line reaches both the person and the model.
  {
    const c = fakeCanon("say", "console.log('📬 canon @ abc — 1 handover');\n");
    const r = run(plant("say-hook", { canon: c, project: "named" }), dir("say-proj"));
    check("a line is relayed as systemMessage AND additionalContext, under SessionStart",
      r.status === 0 && msg(r) === "📬 canon @ abc — 1 handover" &&
        r.out?.hookSpecificOutput?.additionalContext === msg(r) && r.out?.hookSpecificOutput?.hookEventName === "SessionStart", r);
  }

  // 4 · KNOWN-GOOD: nothing pending prints nothing at all.
  {
    const c = fakeCanon("quiet", "\n");
    const r = run(plant("quiet-hook", { canon: c }), dir("quiet-proj"));
    check("KNOWN-GOOD: canon has nothing to say, and the hook prints NOTHING", r.status === 0 && r.raw === "", r);
  }

  // 5 · A canon that crashes is NOT MEASURED with its words, never silence.
  {
    const c = fakeCanon("crash", "console.error('Error: boom'); process.exit(3);\n");
    const r = run(plant("crash-hook", { canon: c }), dir("crash-proj"));
    check("a crashing canon: NOT MEASURED, carrying its exit and its words, exit 0",
      r.status === 0 && msg(r).includes("NOT MEASURED") && msg(r).includes("exited 3") && msg(r).includes("boom"), r);
  }

  // 6 · A canon that hangs is cut off and said, not waited on.
  {
    const c = fakeCanon("hang", "setInterval(() => {}, 1000);\n");
    const r = run(plant("hang-hook", { canon: c, timeout: 300 }), dir("hang-proj"));
    check("a hanging canon: cut off at the timeout, NOT MEASURED, exit 0",
      r.status === 0 && msg(r).includes("NOT MEASURED") && msg(r).includes("timed out") && r.ms < 10_000, r);
  }

  // 8 · AFTER A PUSH (v3): the same question, asked with --after-task, answered under PostToolUse.
  {
    const c = fakeCanon("push", "console.log(JSON.stringify(process.argv.slice(2)));\n");
    const hook = plant("push-hook", { canon: c, project: "named" });
    for (const command of ["git push origin feature", "git -C ../x push -u origin main", "npm run check && git push",
      // v5 (blindly CF-11): a quoted path to git is one word, as bash reads it.
      `"C:/Program Files/Git/cmd/git.exe" push origin main`, `'C:/Program Files/Git/cmd/git.exe' -C "my repo" push`,
      // v6 (blindly CF-12): an escaped space is one word too, and so is a line joined by a backslash.
      "git -C my\\ repo push origin main", "C:/Program\\ Files/Git/cmd/git.exe push", "git -C \"a\\\"b\" push", "git \\\npush origin main"]) {
      const r = run(hook, dir("push-proj"), bashCall(command));
      const args = (() => { try { return JSON.parse(msg(r)); } catch { return null; } })();
      check(`after \`${command}\`: canon is asked with --after-task, and the line is relayed under PostToolUse`,
        r.status === 0 && Array.isArray(args) && args.includes("--after-task") && args[1] === "--quick" &&
          r.out?.hookSpecificOutput?.hookEventName === "PostToolUse" && r.out?.hookSpecificOutput?.additionalContext === msg(r), r);
    }
    const start = run(hook, dir("push-proj"));
    check("KNOWN-GOOD: a session start does NOT pass --after-task — it keeps its own wording",
      !msg(start).includes("--after-task") && start.out?.hookSpecificOutput?.hookEventName === "SessionStart", start);
  }

  // 9 · KNOWN-GOOD: any other Bash call is silent, and canon is NOT ASKED — this canon crashes if it is.
  {
    const c = fakeCanon("unasked", "console.error('asked'); process.exit(4);\n");
    const hook = plant("unasked-hook", { canon: c });
    for (const command of ["git status", "npm test", "echo pushing is later", "git log --oneline -- push.md",
      `"C:/Program Files/Git/cmd/git.exe" status`, `git commit -m "then git push; later"`,
      // v6: an escape keeps a character in its word — it does not make one, nor end a quote.
      "git -C my\\ repo status", "echo git\\ push", "git commit -m \"a \\\" ; git push\"", "git commit -m 'a\\' && echo push"]) {
      const r = run(hook, dir("unasked-proj"), bashCall(command));
      check(`KNOWN-GOOD: after \`${command}\` the hook prints nothing and does not ask canon`, r.status === 0 && r.raw === "", r);
    }
    const garbled = run(hook, dir("unasked-proj"), "not json");
    check("stdin that is not JSON reads as a session start — canon IS asked (and here says it crashed)",
      garbled.status === 0 && msg(garbled).includes("NOT MEASURED") && msg(garbled).includes("exited 4"), garbled);
  }

  // 7 · LIVE: the real canon names a copy planted a version behind, inside a session start's budget.
  {
    // Canon's own checkout (kit/project-kit/hooks), then the nearest `dev-standards` above a project.
    const candidates = [resolve(HERE, "..", "..", "..")];
    for (let at = resolve(HERE, "..", "..", ".."); dirname(at) !== at; at = dirname(at)) candidates.push(join(at, "dev-standards"));
    const canon = candidates.find((c) => existsSync(join(c, "tools", "inbox.mjs")) && existsSync(join(c, "kit", "project-kit", "MANIFEST.json")));
    // Gated only when this probe IS canon's kit copy: then the tree it reads is the tree being gated.
    const own = canon === candidates[0];
    // The state canon was read at, in canon's own words: its quick line opens `canon @ <sha>` and adds
    // `(uncommitted)` over a dirty tree. Spawning git here instead would be a PATH lookup from a hook.
    const at = (r) => /canon @ (\S+(?: \(uncommitted\))?)/.exec(msg(r))?.[1] ?? "an unreported state";
    if (!canon) {
      notCounted.push("1 skipped");
      console.log(`⊘ live: no canon at ${candidates.map(fwd).join(" or ")} — SKIPPED, not passed`);
    } else {
      const reg = JSON.parse(readFileSync(join(canon, "ledgers", "projects.json"), "utf8"));
      const rows = JSON.parse(readFileSync(join(canon, "kit", "project-kit", "MANIFEST.json"), "utf8")).files;
      const name = Object.keys(reg.kitAdopted ?? {}).find((n) => (reg.kitAdopted[n] ?? []).length);
      const row = rows.find((f) => f.mode === "tracked" && f.version > 1 && reg.kitAdopted[name].includes(f.id) && !reg.kitPins?.[name]?.[f.id]);
      if (!name || !row) {
        notCounted.push("1 skipped");
        console.log("⊘ live: canon's register holds no adopted, unpinned row above v1 to plant behind — SKIPPED, not passed");
      } else {
        const proj = dir("live-proj");
        mkdirSync(dirname(join(proj, row.install)), { recursive: true });
        writeFileSync(join(proj, row.install), `// @kit ${row.id} v1\n`);
        const r = run(plant("live-hook", { canon, project: name }), proj);
        const label = `live: canon names ${row.id} v1→v${row.version} for ${name}, with the carry command, in ${r.ms} ms (bound 3000)`;
        const ok = r.status === 0 && msg(r).includes(`${row.id} v1→v${row.version}`) && msg(r).includes("--carry-only") && r.ms < 3_000;
        if (own) check(label, ok, r);
        else {
          notCounted.push("1 advisory");
          console.log(`ⓘ ${ok ? "held" : "DID NOT HOLD"} (advisory, not gated — canon @ ${at(r)} is another checkout) ${label}${ok ? "" : ` — got ${JSON.stringify(r).slice(0, 300)}`}`);
        }
      }
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

const tally = [`${held} held`, ...notCounted].join(", ");
console.log(failed
  ? `\n❌ canon-inbox: ${failed} case(s) FAILED (${tally})`
  : `\n✅ canon-inbox: ${tally} — one line or silence, and NOT MEASURED wherever it could not look`);
process.exit(failed ? 1 : 0);
