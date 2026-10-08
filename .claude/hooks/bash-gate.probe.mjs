/**
 * bash-gate.probe.mjs — KIT FILE, install at `.claude/hooks/`.
 *
 * @kit bash-gate-probe v18 — tracked OUTSIDE its `KIT:CONFIG` regions.
 *
 * BOTH DIRECTIONS, per `ledgers/LESSONS.md` L-01: a planted violation must FAIL
 * and a known-good case must PASS. A pattern that matches nothing reports 100%
 * clean; a pattern that matches everything reports 100% violation; and a
 * half-fixed pattern produces a plausible middle number, which is worse than
 * either. The gate is not trusted until both directions run.
 *
 * FOR THIS HOOK THE ALLOW CASES MATTER MORE THAN THE DENY CASES, which is the
 * reverse of the intuition. The posture is allow-by-default and the hook's
 * PURPOSE is to stop an unattended session stalling on `ls` — so a gate that
 * over-matches has failed at its job while looking maximally safe.
 *
 * v2 carries the decision table measured across four field copies on 2026-09-08.
 * Run this probe against a v1 hook and it goes red on every row v1 got wrong —
 * that output IS the adoption worklist. It resolves the hook from its own
 * location, so it can only ever exercise the file beside it.
 *
 * v5 (2026-09-10) adds the cases v4 could not hold: the protected branch reached BY REFERENCE, some
 * resolved from the command and some from fixture `.git/HEAD` files, and a force-push by `+refspec`
 * (yoros CF-3, CF-5). And one assertion against a witness the config did not write — the remote's
 * default branch — because every other case here derives from the value it would catch (CF-8).
 *
 * v6 (2026-09-11, yoros CF-4) asserts that every rule the hook holds carries a fallback, from the
 * list `bash-gate.js --fallbacks` prints — and holds that list to a witness it did not write: every
 * reason the hook gave in the cases below must belong to a rule on it, or the list is short a rule
 * and no count over it can see that rule. Whether a fallback is ANSWERED, and present in settings,
 * is `check-hook-registration`'s question; canon's own copy ships every one unfilled.
 *
 * v7 (2026-09-11) carries the payloads pleks and yoros measured v6 allowing (pleks CF-9, yoros
 * CF-10), and a DIFFERENTIAL run (pleks CF-10). This file's cases assert what the hook is meant to
 * do, so they cannot show what a replacement stopped doing. `--against <previous bash-gate.js>` puts
 * every case through the previous gate as well, and fails on any verdict that got LOOSER unless the
 * `LOOSENED` table below names it with a reason. Run it before you replace your gate, against the
 * copy you are replacing, so your own rules are in the comparison. v6's probe and pleks's corpus were
 * both green over a gate that allowed 15 payloads its predecessor refused.
 *
 * v8 (2026-09-11, yoros CF-11) adds the message cases: the mask must read `-am`, `-qm`, `-m"…"` and
 * `--message="…"`, and must not read `-Fm` or `-cm`, whose `m` is another flag's value. And three
 * payloads every earlier version allowed — `$(…)` and backticks in a double-quoted message, and a
 * `-m` inside quotes. `LOOSENED` now accumulates across versions: an adopter at v6 runs `--against`
 * its v6, and a table describing only v7→v8 would have called v7's declared loosenings undeclared.
 *
 * v13 (2026-10-06, pleks CF-18) carries the twenty payloads v12 allowed once text reached something
 * that runs it — a pipe or here-string into a shell, an interpreter's code string, sed's `e`, awk's
 * `system(` — and `rm -rf $(…)`; a case per part of the reading that found them, and the allows it
 * must not cost. Three more timed shapes, one per work bound the new reading carries.
 *
 * v14 (2026-10-06, blindly CF-8) carries the quoted Windows paths v13 allowed — `"C:/Program Files/…/
 * git.exe"` force-pushing, skipping hooks, pushing main, and `rm.exe` at the root — and the allows
 * they must not cost: the same path reading status, another program, a quoted argument.
 *
 * v15 (2026-10-08, blindly CF-10) carries the same cases with a quoted whitespace-only word after
 * them, which v14 allowed, and a word that differs from its token at the same count.
 *
 * v16 (2026-10-08, pleks's v15 scout) carries the seven shapes v15 allowed — process substitution
 * into `source`/`.`/a shell, a substitution as the command word, a file written and run in one
 * command, `npx -c` — their variants, the allows they must not cost, the declared limit (`sh x.sh`
 * alone), and four timed shapes for the file reader, one of which must ask past its budget.
 *
 * v17 (2026-10-08, pleks CF-21) carries the runners outside v16's table — `cmd //c`, wsl, find -exec,
 * su/flock/busybox/ssh/docker exec, `npm pkg set scripts.x=`, git's filters and --exec — the allows
 * they must not cost (gh, git -m, curl -d, harmless strings), the declared cost (a quoted test name),
 * the declared limit (`"$CMD"`), and two timed shapes for the quoted-argument reading.
 *
 * v18 (2026-10-08, pleks CF-22) carries the known programs that run a shell — git bisect run, submodule
 * foreach, difftool/send-email's commands, bun x, a package's bin through node, an interpreter's argv,
 * gh alias --shell, tee >(sh) — the allows they must not cost, the declared cost (a script's quoted
 * argument), and four timed shapes; no timed shape may be answered by the gate failing (GATE_FAILED).
 *
 * Run: node .claude/hooks/bash-gate.probe.mjs   (wire into the `probe` script)
 *      node .claude/hooks/bash-gate.probe.mjs --against <the gate you are replacing>
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOK = join(HERE, "bash-gate.js");

// THE BRANCH NAMES COME FROM THE HOOK'S OWN CONFIG MODULE, which is the entire point.
//
// They used to be declared here, in a KIT:CONFIG region whose comment asked the reader to keep them
// equal to the hook's — prose doing a check's job on the one value every project changes. A probe
// that reads its subject's configuration from a SECOND copy is a probe that can go green over the
// wrong subject, and that is the failure this file exists to prevent. M-KIT-07, closed 2026-09-09.
import { PROTECTED_BRANCH, WORKING_BRANCH } from "./bash-gate.config.mjs";
// The same module again, as a namespace, for the one OPTIONAL export: a named import of a binding
// your config region does not declare is a load error, and this row must not make you edit it.
import * as branchConfig from "./bash-gate.config.mjs";

/**
 * `raw` sends bytes verbatim. The first malformed-input probe passed a STRING
 * through JSON.stringify, which is valid JSON — nothing was malformed, the hook
 * read `tool_input` off a string, got `undefined`, and ALLOWED. Send garbage as
 * garbage, and send a bare string as a bare string.
 *
 * `root` is the hook's CLAUDE_PROJECT_DIR, and every case without one runs with it REMOVED — not
 * inherited. The hook reads `.git/HEAD` only when it is set, so a case that inherited a session's
 * value would pass or fail by which branch that session had checked out.
 */
function run(payload, { raw = false, root, hook = HOOK } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    if (root) env.CLAUDE_PROJECT_DIR = root;
    const p = spawn(process.execPath, [hook], { stdio: ["pipe", "pipe", "inherit"], env });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      try {
        const o = JSON.parse(out).hookSpecificOutput;
        resolve({ decision: o.permissionDecision, reason: o.permissionDecisionReason ?? "" });
      } catch {
        resolve({ decision: "(no output)", reason: "" });
      }
    });
    p.stdin.end(raw ? payload : JSON.stringify(payload));
  });
}

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const BOM = "\uFEFF";

/**
 * A PROJECT MAY BE STRICTER THAN CANON, AND UNTIL 2026-09-09 THAT MADE THIS ROW UNSHIPPABLE.
 *
 * Reported by the life-therapy session: 7 of 65 probes failed against a CORRECTLY adopted
 * bash-gate v2, and every failure was the project being tighter — it asks on every push where
 * canon allows on a non-protected branch, and denies `git reset --hard` where canon asks.
 *
 *   ✗ want allow got ask   pushing <working-branch> is not the deployment
 *   ✗ want allow got ask   --force-with-lease is the SAFE form and must not be denied
 *   ✗ want ask   got deny  hard reset discards uncommitted work with no undo
 *
 * The probe had a `cases` region for rules a project ADDS and none for verdicts it TIGHTENS, so
 * canon's push and reset policy sat in the file as if it were a canon invariant. It is not: a
 * project's own gate policy is precisely what the hook's config regions exist to vary. And the
 * MANIFEST says the probe ships WITH the gate or the gate does not ship — so the row could not be
 * adopted by anyone stricter than canon, which is the direction you would never want to punish.
 *
 * ⚠ THE ASYMMETRY IS THE WHOLE DESIGN. An override may only make a verdict STRICTER
 * (allow → ask → deny). Loosening one below canon's still fails, and so does naming a `why` that
 * no case carries — the first would be a project quietly switching off a control canon ships, and
 * the second is a rule that stopped applying without anyone noticing. A project may say "we are
 * stricter here". It may never say "do not test this".
 */
const STRICTNESS = { allow: 0, ask: 1, deny: 2 }

/**
 * Apply a project's overrides, and refuse the ones that are not tightenings.
 * Pure, so both directions are probeable without spawning the hook.
 */
export function applyVerdicts(cases, overrides) {
  const findings = []
  const known = new Set(cases.map((c) => c.why))
  for (const why of Object.keys(overrides ?? {})) {
    if (!known.has(why)) {
      findings.push(`verdicts region: no case carries the reason "${why}" — an override for a case that no longer exists is a rule that stopped applying, silently`)
    }
  }
  const out = cases.map((c) => {
    const to = overrides?.[c.why]
    if (to === undefined) return c
    if (!(to in STRICTNESS)) {
      findings.push(`verdicts region: "${c.why}" overridden to \`${to}\`, which is not a verdict. Use allow, ask or deny.`)
      return c
    }
    if (STRICTNESS[to] < STRICTNESS[c.want]) {
      findings.push(
        `verdicts region: "${c.why}" overridden from \`${c.want}\` to \`${to}\` — that is LOOSER than canon. ` +
          `A project may tighten a verdict, never relax one: relaxing switches off a control canon ships.`,
      )
      return c
    }
    return { ...c, want: to, overridden: c.want }
  })
  return { cases: out, findings }
}

/**
 * v6: what is wrong with one rule's fallback, or null. Its SHAPE only — `{ twins: [...] }` or
 * `{ noTwin: "..." }`, exactly one — because a placeholder is a finding in a project and the state
 * canon ships, and settings is not this file's to read.
 */
export function fallbackProblem(fb) {
  if (fb === null || fb === undefined) return "has no fallback — give it { twins: [\"<settings rule>\"] } or { noTwin: \"<why settings cannot say it>\" }";
  if (typeof fb !== "object" || Array.isArray(fb)) return "has a fallback that is not an object";
  const keys = Object.keys(fb);
  if (keys.length !== 1) return `has a fallback with ${keys.length === 0 ? "no key" : `keys ${keys.join(", ")}`} — it takes exactly one of twins or noTwin`;
  if (keys[0] === "twins") {
    const good = Array.isArray(fb.twins) && fb.twins.length > 0 && fb.twins.every((t) => typeof t === "string" && t.trim() !== "");
    return good ? null : "has twins that are not a non-empty list of settings rules";
  }
  if (keys[0] === "noTwin") return typeof fb.noTwin === "string" && fb.noTwin.trim() !== "" ? null : "has a noTwin that is not a reason";
  return `has a fallback keyed ${keys[0]} — it takes exactly one of twins or noTwin`;
}

/**
 * v7: the verdicts canon loosened on purpose, by case `why`, each with the version that loosened it
 * and the reason the previous verdict was wrong. `--against` fails on any looser verdict not named
 * here, and a name that no case carries is itself a finding.
 *
 * v8: THE TABLE ACCUMULATES. v7 replaced it at each version, as if every adopter moved one step at a
 * time; yoros and life-therapy were at v6 when v8 shipped, and against v6 v7's own loosenings would
 * have been undeclared. An entry leaves when its case does.
 */
export const LOOSENED = {
  "PUSH -n is --dry-run, not --no-verify (yoros CF-10)": "v7: v6 denied a dry-run push as if it skipped the project's gate",
  [`MERGE DIRECTION: merging ${PROTECTED_BRANCH} into the working branch leaves ${PROTECTED_BRANCH} alone (pleks CF-8)`]: "v7: v6 read a merge's source as its target and asked",
  [`MERGE DIRECTION: likewise origin/${PROTECTED_BRANCH}`]: "v7: the same, spelled by remote",
  "MESSAGE CLUSTER: -am's value is the message (yoros CF-11)": "v8: v7 masked only a standalone -m, and read -am's message as flags",
  "MESSAGE CLUSTER: -qm likewise": "v8: the same, for any cluster git ends in m",
  'MESSAGE ATTACHED: -m"…" is the message': "v8: v7 masked only a value after a space",
  'MESSAGE ATTACHED: --message="…" is the message': "v8: the same, for --message=",
  // v10 shipped these looser verdicts undeclared; v11 declares them, found by running --against v9.
  "v10: a grep pattern holding `|` is a pattern, not a pipe into a command": "v10: v9 split at a quoted `|` and read the pattern as a command",
  "v10: a quoted `;` in an echo is text": "v10: v9 split at a quoted `;`",
  "v10: a quoted pattern, then a pipe into a sink": "v10: the same, ahead of a pipe into a sink",
};

/**
 * v7: compare two gates' verdicts over the same cases. `rows` are `{ why, old, now }`. Pure, so both
 * directions are checked below without a second hook. Returns the undeclared looser rows as findings,
 * and counts for the summary line.
 */
export function differential(rows, loosened) {
  const findings = [];
  let looser = 0;
  let declared = 0;
  let stricter = 0;
  for (const r of rows) {
    if (!(r.old in STRICTNESS) || !(r.now in STRICTNESS)) {
      findings.push(`"${r.why}": the ${r.old in STRICTNESS ? "new" : "previous"} gate gave no verdict (${r.old in STRICTNESS ? r.now : r.old}) — NOT MEASURED, which is not a pass`);
      continue;
    }
    const d = STRICTNESS[r.now] - STRICTNESS[r.old];
    if (d > 0) stricter++;
    if (d >= 0) continue;
    looser++;
    if (Object.hasOwn(loosened, r.why)) declared++;
    else findings.push(`LOOSER: "${r.why}" was ${r.old} and is now ${r.now}, and this version does not say why`);
  }
  return { findings, looser, declared, stricter };
}

/** v6: findings over the hook's rule list, given the reasons the hook was SEEN to give. Pure. */
export function fallbackFindings(inv, seenReasons) {
  if (inv === null || typeof inv !== "object" || !Array.isArray(inv.rules) || !Array.isArray(inv.strays)) {
    return ["`bash-gate.js --fallbacks` printed no rule list, so no rule's fallback can be read"];
  }
  const out = [];
  for (const r of inv.rules) {
    const problem = r.inert ? null : fallbackProblem(r.fallback);
    if (problem) out.push(`${r.severity} rule ${r.rule} ("${String(r.reason).slice(0, 60)}…") ${problem}`);
  }
  for (const k of inv.strays) out.push(`the fallbacks region names ${k}, which is none of canon's rules — a renamed rule leaves its fallback behind`);
  const listed = new Set(inv.rules.map((r) => r.reason));
  for (const reason of seenReasons) {
    if (!listed.has(reason)) out.push(`the hook gave "${reason.slice(0, 70)}…" and no listed rule carries that reason — the list is short a rule`);
  }
  return out;
}

/* KIT:CONFIG verdicts — verdicts THIS project holds more strictly than canon.
 *
 * Keyed by a case's `why` string, which is why those strings are stable. Empty in canon, and empty
 * is the right state unless your gate genuinely differs — a region that restates the default is a
 * fork waiting to happen (L-89).
 *
 * Only TIGHTENING is accepted: allow -> ask -> deny. Example, from the project that reported this:
 *
 *   "hard reset discards uncommitted work with no undo": "deny",
 *   [`pushing ${WORKING_BRANCH} is not the deployment`]: "ask",
 */
const PROJECT_VERDICTS = {
  // v15 re-adoption: canon ASKS on these, pleks DENIES (isHardReset sits in the deny region; the gated act is a hard reset).
  "v16: …asking as its act does": "deny",
  "v13: an echo piped into sh asks as its act does": "deny",
  "v13: python -c reaches a shell through os.system's literal": "deny",
  "v13: a heredoc into node - is code, and its literals are commands": "deny",
  "v13: python runs its stdin, and its literals are commands": "deny",
  "v13: an escaped quote inside double quotes is the quote": "deny",
  "v15: …reset --hard asks as git does": "deny",
  "pushing develop is not the deployment": "ask",
  "--force-with-lease is the SAFE form and must not be denied": "deny",
  "--force-with-lease=<ref> likewise": "deny",
  "--force-if-includes likewise": "ask",
  "PER-SEGMENT: fetching main then pushing elsewhere": "ask",
  "PER-SEGMENT: grep's -n is not git's -n": "ask",
  "hard reset discards uncommitted work with no undo": "deny",
  "+REFSPEC: a refspec with no + is an ordinary push": "ask",
  "+REFSPEC: a + outside a push is not a refspec": "ask",
  "BY REFERENCE: switch away again before a bare push": "ask",
  "BY REFERENCE: a new branch off the protected one, pushed by HEAD": "ask",
  "BY REFERENCE: a FILE checkout does not move the branch": "ask",
  "BY REFERENCE: --tags alone pushes no branch": "ask",
  "HEAD on working: a bare push": "ask",
  "HEAD on working: push origin HEAD": "ask",
  "HEAD on working: redirections are not arguments": "ask",
  "HEAD on working: cd within the repository keeps the branch": "ask",
  "a .git FILE is followed to its gitdir (a worktree on the working branch)": "ask",
  "the command overrides HEAD: switch to working, then push": "ask",
  "HEAD on protected: pushing the working branch by name": "ask",
  "HEAD on protected: --tags alone": "ask",
  "a detached HEAD pushing the working branch by name": "ask",
  "WRAPPER: a hard reset behind timeout": "deny",
  "KEYWORD: a hard reset after then": "deny",
  "PLAN: command -v checks out nothing": "ask",
  "a lease push behind a wrapper is still the safe form": "deny",
  "PUSH -n is --dry-run, not --no-verify (yoros CF-10)": "ask",
  "PUSH --dry-run likewise": "ask",
  "ABBREVIATED: --har is --hard to git": "deny",
  "SIZE: …and the same plan on the working branch pushes freely": "ask",
  // v17 re-adoption. The first is pleks's hard-reset deny again. The second is the CF-21 runner floor:
  // it ports the held gate, which read words through gh's --body, so a body naming a runner (`wsl`)
  // and a push asks. This is the cost CF-21 declared. Use --body-file.
  "v17: …asking as its act does": "deny",
  "v17: gh is text — a PR body naming a runner": "ask"
}
/* KIT:CONFIG /verdicts */

/* KIT:CONFIG loosened — verdicts THIS project accepts as looser than the gate it replaced (v7).
 *
 * Read only by `--against`, and only when the gate you are replacing is your own rather than canon's
 * previous version: `LOOSENED` above already covers canon's own step. Keyed by a case's `why`, each
 * with the reason the old verdict was wrong for you. A verdict that was your POLICY (asking on every
 * push, denying `git reset --hard`) belongs in the hook's deny and ask regions instead, where it
 * holds. Measured on pleks's v4-lineage gate: 39 looser, in exactly those two kinds.
 *
 *   "PROSE: a gated command named in echo's arguments": "our old gate matched a name at any token",
 */
const PROJECT_LOOSENED = {
  "v16: a file written and only read": "text written to notes.txt and printed by cat: data, never executed. The held gate matched the words in the same command line.",
  "v16: a file written and a DIFFERENT one run": "the written file (x.sh) is not the one run (build.sh): nothing in this command runs the gated words. Same class as the accepted cross-call write-then-run gap (the held gate allows sh x.sh alone); the held deny was an accident of the words sharing a line.",
  "a PR body written by a heredoc into gh is a message (v9 already: gh is a sink) — held here beside the v10 cases it must survive": "heredoc body fed to gh: PR prose. The held gate refused to mask any heredoc body.",
  "v13: a commit message naming rm -rf ~": "a quoted -m message naming a destructive rm: text git stores, never run. The held gate matched the words inside it.",
  "v13: a PR body naming rm -rf /": "a quoted --body argument to gh: text, not a command.",
  "v13: an echo that nothing consumes": "echo prints its argument and nothing reads it: data. The held gate matched a gated name at any token.",
  "v13: an echo piped into cat": "cat is a sink, not an interpreter: the piped text is printed. (echo into sh/bash is NOT here: v13 denies it, and pleks's probe cases carry those.)",
  "v13: a consumed string's -m message is a message": "message text of a commit, quoted: data, not an executable shape.",
  "v13: a pipe after a # is a comment": "everything after a bare # is a shell comment and never runs.",
  "v13: a `;` ends a pipeline — the shell after it is not given what the pipeline wrote": "the echo's output goes to cat, and `;` ends the pipeline before bash runs: bash is not given the text.",
  "v14: a quoted argument holding a gated act's words is still one argument": "echo's quoted argument redirected to a file: data written to disk, not run.",
  "COMMAND POSITION: `rm -rf /` inside an awk program is a string, not a command": "the held gate matched `rm -rf /` anywhere in the text; here it is a string inside a single-quoted awk program (print only), not a command",
  "COMMAND POSITION: a commit message that discusses the gate": "message text of a commit, quoted: the held gate matched the words inside it — data, not an executable shape",
  "SINK HEREDOC: a commit body may name rm -rf / (the -F - workaround v1 advertised)": "heredoc body feeding `git commit -F -`: the held gate refused to mask any heredoc body (its accepted false-deny); here the body is commit prose",
  "SINK HEREDOC: prose naming a force-push, fed to cat": "heredoc body written to a file by `cat`: data. `bash <<EOF` and `cat <<EOF | bash` still deny in v9 (probed in pleks-payloads-out.txt)",
  "PROSE: a wrapper named in echo's arguments": "`echo` arguments are text; the held gate matched a gated name at any token",
  "PROSE: a gated command named in echo's arguments": "`echo` arguments are text; the held gate matched a gated name at any token",
  "PROSE: grepping for a force-push": "the force-push is grep's quoted pattern, not a command",
  "a -m message naming a wrapped force-push": "a `-m` message that names a wrapped force-push: message text, not a command",
  "QUOTED: a PR body naming gated commands is an argument": "a quoted `--body` argument to gh: text, not a command",
  "COMMENT: nothing after a bare # runs": "everything after a bare `#` is a shell comment and never runs",
  "HEREDOC PIPED ON: a sink's body sent to another sink is still data": "a sink's heredoc body piped into another sink (`git commit -F -`) is still data",
  "UNQUOTED HEREDOC: a body with no substitution is still data": "an unquoted heredoc body with no `$(` or backtick substitution is data",
  "SUBSTITUTION: in single quotes it is text": "single quotes make `$(git push -f)` literal text in a commit message; the held gate matched it anyway",
  "SIZE: a 100 KB commit body to a sink heredoc is data, read once": "a 100 KB commit body to a sink heredoc is data (the same masking as the sink-heredoc case above)",
  "PLEKS RUNNER: gh --body prose naming a runner and a push is not a runner": "a quoted `--body` argument to gh: text. `script` is a word inside it, not a command, so the runner backstop does not read it",
  "PLEKS RUNNER: a PR body that says watch and start is not a runner": "a quoted `--body` argument to gh: prose. The held gate asked on the words `git push` anywhere; v16 reads it as gh's argument, and the runner backstop reads `watch`/`start` only at command position",
  "PLEKS RUNNER: a commit message naming cmd //c git push --force is prose": "a quoted `-m` message: text git stores. The held gate matched the words; the runner backstop reads after canon's message masking",
  "v17: git reads a message as a message": "a quoted -m message naming a destructive rm: text git stores, never run. The held gate matched the words inside it",
  "v17: curl's data is data": "curl -d sends its string as request data and runs nothing. The held gate matched the words anywhere in the line",
  "v18: a tee into >(…) that is not an interpreter": "the here-string goes to tee, and tee copies it into wc -l, which counts lines and runs nothing. The held gate matched the words in the line",
  "v18: …so code naming an act outside a literal is not read as a shell line": "the act is named inside a JavaScript comment in node -e's code, which never executes it; v13's literal reading still denies the act inside a string literal. The held gate matched the words in the line"
}
/* KIT:CONFIG /loosened */

/**
 * FIXTURE REPOSITORIES FOR THE HEAD READ (v5). Each is a directory whose `.git` holds a HEAD and
 * nothing else, and a case pointed at one runs the hook with CLAUDE_PROJECT_DIR set to it — the
 * harness's own spelling, so there is no seam here the gate could be talked past. The HEAD is the
 * only variable: the same bare `git push` must ASK on one and ALLOW on the other, or a rule that
 * asked on every push, or on none, would pass half of these. From yoros's `bash-gate.refs.probe.mjs`.
 */
const FIXTURES = mkdtempSync(join(tmpdir(), "bash-gate-probe-"));
function fixture(name, head, { gitFile = false } = {}) {
  const root = join(FIXTURES, name);
  mkdirSync(root, { recursive: true });
  if (head === null) return root;
  const gitDir = gitFile ? join(FIXTURES, `${name}-gitdir`) : join(root, ".git");
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(join(gitDir, "HEAD"), head);
  if (gitFile) writeFileSync(join(root, ".git"), `gitdir: ../${name}-gitdir\n`);
  return root;
}
const ON_P = fixture("on-protected", `ref: refs/heads/${PROTECTED_BRANCH}\n`);
const ON_W = fixture("on-working", `ref: refs/heads/${WORKING_BRANCH}\n`);
const DETACHED = fixture("detached", "4ccb06f0000000000000000000000000000000ff\n");
const WORKTREE = fixture("worktree", `ref: refs/heads/${PROTECTED_BRANCH}\n`, { gitFile: true });
// On the protected branch a worktree asks whether or not the `.git` file is followed, because an
// unread HEAD is UNKNOWN and UNKNOWN asks. Only the working-branch worktree proves the follow.
const WORKTREE_W = fixture("worktree-working", `ref: refs/heads/${WORKING_BRANCH}\n`, { gitFile: true });
const NO_GIT = fixture("no-git", null);

/**
 * A WITNESS THE CONFIG DID NOT AUTHOR (v5, yoros CF-8). The hook and this probe read one config
 * module — which closed their old disagreement by giving them a common ancestor, so a mistyped
 * PROTECTED_BRANCH passes both: every case here derives from it. Measured by yoros: set it to a
 * branch that does not exist, and `git push origin main` is ALLOWED under a green probe (L-24).
 *
 * So one value is checked against something else: the remote's default branch, which git records
 * as `refs/remotes/origin/HEAD` and which the config did not write. Three outcomes, and only one
 * of them passes silently:
 *   agrees                 → pass
 *   differs                → FAIL, unless the config declares why (below)
 *   cannot be read         → NOT MEASURED, printed, never a pass (a fresh CI clone has no origin/HEAD)
 *
 * ⚠ A REPO WHOSE DEPLOY BRANCH IS NOT THE REMOTE DEFAULT is legitimate, and it declares so in its
 * config region, with the reason — not by editing this file:
 *
 *   export const PROTECTED_NOT_DEFAULT = "deploys from production; main is the review branch";
 *
 * A declaration while the two AGREE fails: it is an exemption for a case that no longer exists.
 * Pure, so both directions are checked below without a repository.
 */
export function witness(protectedBranch, originHead, declared) {
  const reason = typeof declared === "string" && declared.trim() ? declared.trim() : null;
  if (!originHead) {
    return { ok: true, line: `– NOT MEASURED  PROTECTED_BRANCH "${protectedBranch}" has no witness: refs/remotes/origin/HEAD does not resolve here (\`git remote set-head origin --auto\` records it)` };
  }
  if (originHead === protectedBranch) {
    return reason
      ? { ok: false, line: `✗ PROTECTED_NOT_DEFAULT is declared, but "${protectedBranch}" IS the remote default — the exemption covers nothing; delete it` }
      : { ok: true, line: `✓ PROTECTED_BRANCH "${protectedBranch}" is the remote default (refs/remotes/origin/HEAD)` };
  }
  return reason
    ? { ok: true, line: `✓ PROTECTED_BRANCH "${protectedBranch}" differs from the remote default "${originHead}", declared: ${reason}` }
    : { ok: false, line: `✗ PROTECTED_BRANCH is "${protectedBranch}" but the remote default is "${originHead}". A typo here protects a branch nothing deploys from, under a green probe. Fix the config, or declare PROTECTED_NOT_DEFAULT with the reason` };
}

const WITNESS_SELFTEST = [
  [["main", "main", undefined], true],
  [["main", "master", undefined], false],
  [["production", "main", "deploys from production"], true],
  [["main", "main", "stale"], false],
  [["main", "main", "  "], true],
  [["main", null, undefined], true],
];

/**
 * The remote default, READ rather than asked of git: a hook directory is linted as a security
 * surface in at least one adopter, where spawning a command found on PATH is refused, and the answer
 * is one file. `refs/remotes/origin/HEAD` is a symbolic ref, and git never packs those, so it is
 * loose whenever it exists. Found the way git finds a repository — upward from here — following a
 * `.git` FILE to its gitdir and a worktree's `commondir` to where the refs live. A reftable
 * repository has no loose file, and reads as unresolved: NOT MEASURED, which is honest.
 */
export function originHead(from) {
  let dir = from;
  while (!existsSync(join(dir, ".git"))) {
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  try {
    let gitDir = join(dir, ".git");
    if (statSync(gitDir).isFile()) {
      const line = readFileSync(gitDir, "utf8").split(/\r?\n/).find((l) => l.startsWith("gitdir:"));
      if (!line) return null;
      gitDir = resolve(dir, line.slice("gitdir:".length).trim());
    }
    const common = join(gitDir, "commondir");
    const refs = existsSync(common) ? resolve(gitDir, readFileSync(common, "utf8").trim()) : gitDir;
    const ref = readFileSync(join(refs, "refs", "remotes", "origin", "HEAD"), "utf8").trim();
    const PREFIX = "ref: refs/remotes/origin/";
    return ref.startsWith(PREFIX) ? ref.slice(PREFIX.length) : null;
  } catch {
    return null;
  }
}

// The reader, both directions, on fixtures: a clone's layout, a worktree's, and one with no record.
const ORIGIN_REPO = fixture("origin-repo", "ref: refs/heads/x\n");
mkdirSync(join(ORIGIN_REPO, ".git", "refs", "remotes", "origin"), { recursive: true });
writeFileSync(join(ORIGIN_REPO, ".git", "refs", "remotes", "origin", "HEAD"), "ref: refs/remotes/origin/trunk\n");
mkdirSync(join(ORIGIN_REPO, "src", "deep"), { recursive: true });
const ORIGIN_WT = join(FIXTURES, "origin-worktree");
mkdirSync(join(ORIGIN_REPO, ".git", "worktrees", "wt"), { recursive: true });
writeFileSync(join(ORIGIN_REPO, ".git", "worktrees", "wt", "commondir"), "../..\n");
mkdirSync(ORIGIN_WT, { recursive: true });
writeFileSync(join(ORIGIN_WT, ".git"), `gitdir: ${join(ORIGIN_REPO, ".git", "worktrees", "wt")}\n`);
const ORIGIN_SELFTEST = [
  [join(ORIGIN_REPO, "src", "deep"), "trunk", "found upward from a subdirectory, as git finds it"],
  [ORIGIN_WT, "trunk", "a worktree's .git file and commondir are followed to the shared refs"],
  [ON_P, null, "a repository with no origin/HEAD recorded is unresolved, not a branch"],
];

const P = PROTECTED_BRANCH;
const W = WORKING_BRANCH;

const CASES = [
  // ── Must ALLOW — the reason this hook exists ───────────────────────────────
  { want: "allow", why: "a plain listing must never prompt", payload: bash("ls -la") },
  { want: "allow", why: "the gate command itself must never prompt", payload: bash("npm run check") },
  { want: "allow", why: "command substitution must not prompt — settings allow-rules cannot cover it", payload: bash("echo $(git rev-parse --short HEAD)") },
  { want: "allow", why: "a heredoc must not prompt — likewise uncoverable by a settings rule", payload: bash("cat << 'EOF'\nhello\nEOF") },
  { want: "allow", why: "a compound with cd must not prompt", payload: bash("cd src && ls") },
  { want: "allow", why: "committing is ordinary work", payload: bash("git commit -m 'feat: x'") },
  { want: "allow", why: "read-only git is never gated", payload: bash("git log --oneline -5") },
  { want: "allow", why: "a BOM-prefixed but valid payload is decided normally (Windows stdin)", raw: true, payload: BOM + JSON.stringify(bash("ls")) },

  // ── Must ALLOW — near-misses that prove the rules are not over-broad ───────
  { want: "allow", why: `pushing ${WORKING_BRANCH} is not the deployment`, payload: bash(`git push origin ${WORKING_BRANCH}`) },
  { want: "allow", why: `a FILENAME containing "${PROTECTED_BRANCH}" is not the branch`, payload: bash(`cat src/${PROTECTED_BRANCH}.ts`) },
  { want: "allow", why: "--force-with-lease is the SAFE form and must not be denied", payload: bash(`git push --force-with-lease origin ${WORKING_BRANCH}`) },
  { want: "allow", why: "--force-with-lease=<ref> likewise", payload: bash(`git push --force-with-lease=${WORKING_BRANCH} origin ${WORKING_BRANCH}`) },
  { want: "allow", why: "--force-if-includes likewise", payload: bash("git push --force-if-includes") },
  { want: "allow", why: "rm of an ordinary path is not rm at a root", payload: bash("rm -rf node_modules/.cache") },
  { want: "allow", why: "rm of a NAMED path under root is not rm at root", payload: bash("rm -rf /tmp/scratch") },
  { want: "allow", why: "rm of a NAMED path under home is not rm at home", payload: bash("rm -rf ~/projects/x") },
  { want: "allow", why: "PER-SEGMENT: an rm and an unrelated `/` in the NEXT command", payload: bash("rm -rf .next && du -sh /") },
  { want: "allow", why: `PER-SEGMENT: fetching ${PROTECTED_BRANCH} then pushing elsewhere`, payload: bash(`git fetch origin ${PROTECTED_BRANCH} && git push origin feature/x`) },
  { want: "allow", why: "PER-SEGMENT: `git clean --dry-run` then a `--format` flag in the NEXT command", payload: bash("git clean --dry-run && npm run build -- --format=json") },
  { want: "allow", why: "PER-SEGMENT: grep's -n is not git's -n", payload: bash('git push > "$LOG" 2>&1; grep -n "vitest" "$LOG"') },
  { want: "allow", why: "COMMAND POSITION: `rm -rf /` inside an awk program is a string, not a command", payload: bash(`awk 'BEGIN{print "rm -rf /"}' f.txt`) },
  { want: "allow", why: "COMMAND POSITION: a commit message that discusses the gate", payload: bash('git commit -m "we ban git push --force and rm -rf /"') },
  { want: "allow", why: "COMMAND POSITION: grepping for a flag is not passing it", payload: bash("grep -rn -- --no-verify .githooks/") },
  { want: "allow", why: "SINK HEREDOC: a commit body may name rm -rf / (the -F - workaround v1 advertised)", payload: bash("git commit -F - <<'MSG'\nfix: gate\n\nWe must never run rm -rf / here.\nMSG") },
  { want: "allow", why: "SINK HEREDOC: prose naming a force-push, fed to cat", payload: bash("cat <<'EOF' > NOTES.md\ngit push --force is banned\nEOF") },
  { want: "allow", why: "-n means --no-stat on merge, not --no-verify", payload: bash(`git merge -n ${WORKING_BRANCH}`) },
  { want: "allow", why: "-n on a non-git command", payload: bash("sort -n numbers.txt") },
  { want: "allow", why: "git -C with a read-only verb", payload: bash("git -C /tmp/d log -1") },
  { want: "allow", why: "the seam rule is inert with no seams configured", payload: bash("SOME_VAR=1 git status") },

  // ── Must ASK ──────────────────────────────────────────────────────────────
  { want: "ask", root: ON_P, why: `merging to ${PROTECTED_BRANCH}`, payload: bash(`git merge ${WORKING_BRANCH} ${PROTECTED_BRANCH}`) },
  { want: "ask", why: `pushing to ${PROTECTED_BRANCH}`, payload: bash(`git push origin ${PROTECTED_BRANCH}`) },
  { want: "ask", why: `pushing to ${PROTECTED_BRANCH} via git -C`, payload: bash(`git -C /tmp/d push origin ${PROTECTED_BRANCH}`) },
  { want: "ask", why: `pushing HEAD:${PROTECTED_BRANCH}`, payload: bash(`git push origin HEAD:${PROTECTED_BRANCH}`) },
  { want: "ask", why: "hard reset discards uncommitted work with no undo", payload: bash("git reset --hard HEAD") },
  { want: "ask", why: "git clean -fd deletes untracked files permanently", payload: bash("git clean -fd") },
  { want: "ask", why: "git clean --force likewise", payload: bash("git clean --force") },
  { want: "ask", why: "unparseable bytes must interrupt, not wave through", raw: true, payload: "{ not json" },
  { want: "ask", why: "valid JSON that is not an OBJECT must also interrupt (bare string)", raw: true, payload: '"a bare string parses fine and has no tool_input"' },
  { want: "ask", why: "valid JSON that is not an OBJECT must also interrupt (array)", raw: true, payload: "[1,2,3]" },
  { want: "ask", why: "valid JSON that is not an OBJECT must also interrupt (number)", raw: true, payload: "42" },
  { want: "ask", why: "a BOM followed by garbage still interrupts", raw: true, payload: BOM + "{ not json" },

  // ── Must DENY ─────────────────────────────────────────────────────────────
  { want: "deny", why: "rm at the filesystem root", payload: bash("rm -rf /") },
  { want: "deny", why: "rm at the filesystem root, glob form", payload: bash("rm -rf /*") },
  { want: "deny", why: "rm at a bare home directory", payload: bash("rm -rf ~") },
  { want: "deny", why: "rm at home, glob form", payload: bash("rm -rf ~/*") },
  { want: "deny", why: "rm at $HOME", payload: bash("rm -rf $HOME") },
  { want: "deny", why: "flags before the target", payload: bash("rm --no-preserve-root -rf /") },
  { want: "deny", why: "ALIAS BYPASS: \\rm", payload: bash("\\rm -rf /") },
  { want: "deny", why: "SUBSHELL: (rm -rf /*)", payload: bash("(rm -rf /*)") },
  { want: "deny", why: "QUOTE HIDE: rm -rf /\"*\"", payload: bash('rm -rf /"*"') },
  { want: "deny", why: "QUOTE HIDE: rm -rf '/'*", payload: bash("rm -rf '/'*") },
  { want: "deny", why: "rm at root followed by another command", payload: bash("rm -rf /*;echo done") },
  { want: "deny", why: "sudo does not launder it", payload: bash("sudo rm -rf /") },
  { want: "deny", why: "SUBSTITUTION is a command position", payload: bash("echo $(rm -rf /)") },
  { want: "deny", why: "BACKTICKS are a command position", payload: bash("x=`rm -rf ~`") },
  { want: "deny", why: "INTERPRETER HEREDOC keeps its body: bash <<EOF", payload: bash("bash <<'EOF'\nrm -rf /\nEOF") },
  { want: "deny", why: "force-push, long form", payload: bash(`git push --force origin ${WORKING_BRANCH}`) },
  { want: "deny", why: "force-push, SHORT form — the most common spelling", payload: bash("git push -f") },
  { want: "deny", why: "force-push, short form in a cluster", payload: bash("git push -fu origin x") },
  { want: "deny", why: "force-push via git -C", payload: bash("git -C /tmp/d push --force") },
  { want: "deny", why: "force-push with the flag last", payload: bash(`git push origin ${WORKING_BRANCH} --force`) },
  { want: "deny", why: "--no-verify skips the project's own commit gate", payload: bash("git commit --no-verify -m wip") },
  { want: "deny", why: "-n on commit IS --no-verify", payload: bash("git commit -n -m x") },
  { want: "deny", why: "--no-verify on push", payload: bash("git push --no-verify") },
  { want: "deny", why: "a QUOTED flag is still the flag once the shell strips the quotes", payload: bash('git commit "--no-verify" -m x') },

  // ── v5: a force-push by REFSPEC, which no --force flag spells (yoros CF-5) ────
  { want: "deny", why: "+REFSPEC: force-push of the working branch", payload: bash(`git push origin +${W}`) },
  { want: "deny", why: "+REFSPEC: force-push of the protected branch", payload: bash(`git push origin +${P}`) },
  { want: "deny", why: "+REFSPEC: src:dst form, via git -C", payload: bash(`git -C /tmp/d push origin +HEAD:${W}`) },
  { want: "deny", why: "+REFSPEC: a lease flag beside it does not launder it", payload: bash(`git push --force-with-lease origin +${W}`) },
  { want: "allow", why: "+REFSPEC: a refspec with no + is an ordinary push", payload: bash(`git push origin HEAD:${W}`) },
  { want: "allow", why: "+REFSPEC: a + outside a push is not a refspec", payload: bash(`git add notes+${P}.md && git push origin ${W}`) },

  // ── v5: the protected branch reached BY REFERENCE, resolved from the command (yoros CF-3) ──
  { want: "ask", why: "BY REFERENCE: check out the protected branch, merge, push — the ordinary deploy", payload: bash(`git checkout ${P} && git merge ${W} && git push`) },
  { want: "ask", why: "BY REFERENCE: switch to the protected branch, then a bare merge", payload: bash(`git switch ${P} && git merge ${W}`) },
  { want: "ask", why: "BY REFERENCE: push HEAD after checking out the protected branch", payload: bash(`git checkout ${P} && git push -u origin HEAD`) },
  { want: "ask", why: "BY REFERENCE: a full ref as the destination", payload: bash(`git push origin ${W}:refs/heads/${P}`) },
  { want: "ask", why: "BY REFERENCE: --all pushes every branch, the protected one included", payload: bash("git push --all origin") },
  { want: "deny", why: "--mirror force-updates and deletes every remote ref: it is a force-push", payload: bash("git push --mirror origin") },
  { want: "ask", why: "BY REFERENCE: gh pr merge lands on a base the command does not name", payload: bash("gh pr merge 12 --merge") },
  { want: "allow", why: "BY REFERENCE: switch away again before a bare push", payload: bash(`git switch ${P} && git switch ${W} && git push`) },
  { want: "allow", why: "BY REFERENCE: a new branch off the protected one, pushed by HEAD", payload: bash(`git checkout ${P} && git checkout -b feature/x && git push -u origin HEAD`) },
  { want: "allow", why: "BY REFERENCE: a FILE checkout does not move the branch", payload: bash(`git checkout ${W} && git checkout -- src/${P}.ts && git push`) },
  { want: "allow", why: "BY REFERENCE: --tags alone pushes no branch", payload: bash("git push --tags") },
  { want: "allow", why: "BY REFERENCE: gh pr view is not a merge", payload: bash("gh pr view 12") },
  { want: "allow", why: "BY REFERENCE: merge --abort merges nothing", payload: bash(`git checkout ${P} && git merge --abort`) },

  // ── v5: the protected branch reached BY REFERENCE, resolved from `.git/HEAD` (fixtures above) ──
  { want: "ask", root: ON_P, why: "HEAD on protected: a bare push", payload: bash("git push") },
  { want: "allow", root: ON_W, why: "HEAD on working: a bare push", payload: bash("git push") },
  { want: "ask", root: ON_P, why: "HEAD on protected: a bare merge", payload: bash(`git merge ${W}`) },
  { want: "allow", root: ON_W, why: "HEAD on working: a bare merge", payload: bash(`git merge ${W}`) },
  { want: "ask", root: ON_P, why: "HEAD on protected: push origin HEAD", payload: bash("git push origin HEAD") },
  { want: "allow", root: ON_W, why: "HEAD on working: push origin HEAD", payload: bash("git push origin HEAD") },
  { want: "ask", root: ON_P, why: "HEAD on protected: a remote and no refspec", payload: bash("git push origin") },
  { want: "ask", root: ON_P, why: "HEAD on protected: pulling ANOTHER branch in is a merge", payload: bash(`git pull origin ${W}`) },
  { want: "ask", root: ON_P, why: "HEAD on protected: redirections are not arguments", payload: bash('git push > "$LOG" 2>&1') },
  { want: "allow", root: ON_W, why: "HEAD on working: redirections are not arguments", payload: bash('git push > "$LOG" 2>&1') },
  { want: "ask", root: ON_P, why: "HEAD on protected: cd within the repository keeps the branch", payload: bash("cd src && git push") },
  { want: "allow", root: ON_W, why: "HEAD on working: cd within the repository keeps the branch", payload: bash("cd src && git push") },
  { want: "ask", root: ON_W, why: "UNKNOWN: cd .. may be another repository", payload: bash("cd .. && git push") },
  { want: "ask", root: ON_W, why: "UNKNOWN: cd to an absolute path outside the repository", payload: bash("cd /tmp/elsewhere && git push") },
  { want: "ask", root: ON_W, why: "UNKNOWN: git -C points at another repository", payload: bash("git -C /tmp/d push") },
  { want: "ask", root: DETACHED, why: "UNKNOWN: a detached HEAD", payload: bash("git push origin HEAD") },
  { want: "ask", root: NO_GIT, why: "UNKNOWN: no .git to read", payload: bash("git push") },
  { want: "ask", root: WORKTREE, why: "a .git FILE is followed to its gitdir (a worktree on the protected branch)", payload: bash("git push") },
  { want: "allow", root: WORKTREE_W, why: "a .git FILE is followed to its gitdir (a worktree on the working branch)", payload: bash("git push") },
  { want: "allow", root: ON_P, why: "the command overrides HEAD: switch to working, then push", payload: bash(`git switch ${W} && git push`) },
  { want: "ask", root: ON_W, why: "the command overrides HEAD: switch to protected, then push", payload: bash(`git switch ${P} && git push`) },
  { want: "ask", root: ON_W, why: "UNKNOWN: checkout - returns to a branch the command does not name", payload: bash("git checkout - && git push") },
  { want: "allow", root: ON_P, why: "HEAD on protected: pushing the working branch by name", payload: bash(`git push origin ${W}`) },
  { want: "allow", root: ON_P, why: "HEAD on protected: a bare pull syncs with its own upstream", payload: bash("git pull") },
  { want: "allow", root: ON_P, why: "HEAD on protected: fetch lands nowhere", payload: bash("git fetch origin") },
  { want: "allow", root: ON_P, why: "HEAD on protected: merge --abort", payload: bash("git merge --abort") },
  { want: "allow", root: ON_P, why: "HEAD on protected: --tags alone", payload: bash("git push --tags") },
  { want: "allow", root: ON_P, why: "HEAD on protected: read-only git", payload: bash("git log --oneline -3") },
  { want: "allow", root: DETACHED, why: "a detached HEAD pushing the working branch by name", payload: bash(`git push origin ${W}`) },
  { want: "allow", root: NO_GIT, why: "no .git, and nothing git", payload: bash("ls") },

  // ── v7: the command behind a wrapper, a keyword or a runner (pleks CF-9 ①, yoros CF-10 (a)) ──
  // Each was ALLOWED by v6, measured in pleks or yoros or both.
  { want: "deny", why: "WRAPPER: timeout and its duration", payload: bash(`timeout 30 git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: timeout with an option that takes a value", payload: bash(`timeout -s KILL 30 git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: stdbuf with an attached option", payload: bash(`stdbuf -oL git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: noglob", payload: bash(`noglob git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: time -p", payload: bash(`time -p git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: nice -n and its value", payload: bash(`nice -n 10 git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: env -i", payload: bash(`env -i git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: sudo -u and its user", payload: bash(`sudo -u root git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: sudo -E before rm", payload: bash("sudo -E rm -rf /*") },
  { want: "deny", why: "WRAPPER: command -p", payload: bash(`command -p git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPER: exec -a and its name", payload: bash(`exec -a x git push -f origin ${W}`) },
  { want: "deny", why: "WRAPPERS NEST: timeout, then nice", payload: bash("timeout --preserve-status 30 nice -n 5 rm -rf /") },
  { want: "deny", why: "RUNNER: xargs", payload: bash("echo x | xargs git push -f origin") },
  { want: "deny", why: "RUNNER: bash -c and its string", payload: bash(`bash -c "git push -f origin ${W}"`) },
  { want: "deny", why: "RUNNER: sh -c and its string", payload: bash("sh -c 'rm -rf /*'") },
  { want: "deny", why: "RUNNER: eval", payload: bash(`eval "git push -f origin ${W}"`) },

  // ── v10: A QUOTED SEPARATOR AFTER A DATA COMMAND IS TEXT — and nowhere else ──
  // The allows are the false denies dev-standards measured; every deny below is a command v9 caught
  // ONLY because it split on a quoted separator, so each one is the price the allow must not pay.
  { want: "allow", why: "v10: a grep pattern holding `|` is a pattern, not a pipe into a command", payload: bash('grep -E "x|git push -f origin main|y" notes.md') },
  { want: "allow", why: "v10: a quoted `;` in an echo is text", payload: bash("echo 'done; rm -rf / was never run'") },
  { want: "allow", why: "v10: a quoted pattern, then a pipe into a sink", payload: bash('grep -E "a|rm -rf /" f | head -5') },
  { want: "allow", why: "a PR body written by a heredoc into gh is a message (v9 already: gh is a sink) — held here beside the v10 cases it must survive",
    payload: bash("gh pr create --title t --body \"$(cat <<'EOF'\nthis no longer denies git push -f origin main\nEOF\n)\"") },
  { want: "deny", why: "v10 floor: a second command inside a RUNNER's string — bash -c reads only its first word", payload: bash('bash -c "echo hi; rm -rf /*"') },
  { want: "deny", why: "v10 floor: the same through ssh, a runner no table lists", payload: bash('ssh host "uptime; rm -rf /*"') },
  { want: "deny", why: "v10 floor: data piped into a shell is code", payload: bash('echo "a; rm -rf /*" | sh') },
  { want: "deny", why: "v10 floor: data piped through xargs into a shell is code", payload: bash('echo "a; rm -rf /*" | xargs sh -c') },
  { want: "deny", why: "v10 floor: a wrapper in front of the data command — the first word is not data", payload: bash('sudo echo "a; rm -rf /*"') },
  { want: "deny", why: "v10 floor: a substitution re-pairs the quotes after it, so nothing is trusted", payload: bash('echo "$(echo "a" ; rm -rf /*)"') },
  { want: "deny", why: "v10 floor: an apostrophe in a comment shifts every quote after it", payload: bash("echo a # it's\nrm -rf /* ; echo 'b'") },
  { want: "deny", why: "v10 floor: …and when the shifted quotes all CLOSE, only the quoted newline gives it away", payload: bash("echo a # it's\nrm -rf /* ; echo \\'") },
  { want: "deny", why: "v10 floor: a quote that never closes is not a quote this file can pair", payload: bash('echo "a; rm -rf /*') },
  { want: "deny", why: "v10 floor: a heredoc substituted into a RUNNER is code, whoever receives it", payload: bash("bash -c \"$(cat <<'EOF'\nrm -rf /*\nEOF\n)\"") },
  { want: "deny", why: "v10 floor: a heredoc substituted into a non-sink and piped to a shell keeps its body", payload: bash("echo \"$(cat <<'EOF'\nrm -rf /*\nEOF\n)\" | sh") },
  { want: "deny", why: "v10 floor: an unquoted separator after a data command still splits", payload: bash("echo 'x' ; rm -rf /*") },

  // ── v11: A STRING GIT RUNS IS A COMMAND (blindly G-10, walk 02) ──
  // Every deny below was ALLOWED by v10 and every version before it; every allow is the cost v11
  // must not charge — a config value that names no gated command.
  { want: "deny", why: "v11: a `!` alias is a shell command", payload: bash('git -c alias.q="!rm -rf /*" q') },
  { want: "deny", why: "v11: …single-quoted", payload: bash("git -c alias.q='!rm -rf /*' q") },
  { want: "deny", why: "v11: …with the whole -c argument quoted", payload: bash('git -c "alias.q=!rm -rf /*" q') },
  { want: "deny", why: "v11: git appends the alias's arguments to a `!` command", payload: bash("git -c alias.q='!rm -rf' q /") },
  { want: "deny", why: "v11: an alias without `!` is git arguments — this one force-pushes", payload: bash(`git -c alias.p="push --force" p origin ${W}`) },
  { want: "deny", why: "v11: core.pager runs its value", payload: bash('git -c core.pager="rm -rf /*" log') },
  { want: "deny", why: "v11: core.sshCommand runs its value", payload: bash('git -c core.sshCommand="rm -rf /*" fetch') },
  { want: "deny", why: "v11: behind another global option", payload: bash('git -C . -c core.editor="rm -rf ~" commit') },
  { want: "deny", why: "v11: behind a wrapper", payload: bash('sudo git -c alias.q="!rm -rf /*" q') },
  { want: "deny", why: "v11: at a later position the backstop finds", payload: bash("find . -exec git -c alias.q='!rm -rf /*' q \\;") },
  { want: "deny", why: "v11: git config WRITES an alias that runs later", payload: bash("git config alias.q '!rm -rf /*'") },
  { want: "deny", why: "v11: …with --global and the newer `set` verb", payload: bash("git config --global set alias.q '!rm -rf /*'") },
  { want: "deny", why: "v11: …past an option's value (--file names the config, not the key)", payload: bash("git config --file cfg alias.q '!rm -rf /*'") },
  { want: "deny", why: "v11: GIT_SSH_COMMAND runs its value", payload: bash('GIT_SSH_COMMAND="rm -rf /*" git fetch') },
  { want: "deny", why: "v11: EDITOR runs its value", payload: bash('EDITOR="rm -rf ~" git commit') },
  { want: "deny", why: "v11: GIT_CONFIG_VALUE_0 sets a key from the environment", payload: bash("GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=alias.q GIT_CONFIG_VALUE_0='!rm -rf /*' git q") },
  { want: "deny", why: "v11: exported, in the same segment", payload: bash('export GIT_PAGER="rm -rf /*"') },
  { want: "allow", why: "v11: an inert -c value passes", payload: bash("git -c color.ui=always log --oneline -5") },
  { want: "allow", why: "v11: a harmless `!` alias passes", payload: bash("git -c alias.st='!git status --short' st") },
  { want: "allow", why: "v11: an ssh command passes", payload: bash('git -c core.sshCommand="ssh -i ~/.ssh/deploy" fetch') },
  { want: "allow", why: "v11: commit -c reuses a message, not a config value", payload: bash("git commit -c HEAD") },
  { want: "allow", why: "v11: git config reads and inert writes pass", payload: bash("git config --get alias.st && git config user.name 'A B' && git config --file .git/config core.autocrlf false") },
  { want: "allow", why: "v11: a pager variable that names a pager passes", payload: bash('GIT_PAGER="less -R" git log') },
  { want: "allow", why: "v11: an assignment git does not read is not a command", payload: bash('MSG="rm -rf /" node x.js') },

  // ── v12: HOW A COMMAND IS SPELLED (blindly CF-6), and v11's three neighbours (blindly CF-7) ──
  // Every deny below was ALLOWED by v11, measured by blindly on win32 and reproduced in canon.
  { want: "deny", why: "v12: git.exe is git — Git Bash runs it", payload: bash(`git.exe push --force origin ${W}`) },
  { want: "deny", why: "v12: GIT is git on a case-insensitive filesystem", payload: bash(`GIT push --force origin ${W}`) },
  { want: "deny", why: "v12: rm.exe is rm", payload: bash("rm.exe -rf /*") },
  { want: "deny", why: "v12: a full path to git.exe, as Git Bash spells it", payload: bash(`/mingw64/bin/git.exe push -f origin ${W}`) },
  { want: "deny", why: "v12: git.cmd, the Windows shim", payload: bash(`git.cmd push -f origin ${W}`) },
  { want: "deny", why: "v12: a runner spelled with .exe is still a runner — its quoted string is out of the backstop's reach", payload: bash("bash.exe -c 'rm -rf /*'") },
  { want: "deny", why: "v12: the backstop's later positions are spelled the same way — find -exec is in no table", payload: bash("find . -exec RM.exe -rf / \\;") },
  { want: "deny", why: "v12: a v11 string under a v12 spelling", payload: bash("Git.EXE -c alias.q='!rm -rf /*' q") },
  { want: "deny", why: "v12: an assignment behind sudo", payload: bash("sudo GIT_SSH_COMMAND='rm -rf /*' git fetch") },
  { want: "deny", why: "v12: an assignment behind env -i", payload: bash("env -i GIT_SSH_COMMAND='rm -rf /*' git fetch") },
  { want: "deny", why: "v12: SSH_ASKPASS is run by git, and is not GIT_-prefixed", payload: bash("SSH_ASKPASS='rm -rf /*' git fetch") },
  { want: "deny", why: "v12: the ext:: transport runs its URL", payload: bash("git -c protocol.ext.allow=always fetch 'ext::sh -c rm% -rf% /*'") },
  { want: "allow", why: "v12: git.exe reading is reading", payload: bash("git.exe status && GIT log --oneline -3") },
  { want: "allow", why: "v12: an excusing list still matches exactly — ECHO is not read as prose, and this one names nothing", payload: bash("ECHO hello") },
  { want: "allow", why: "v12: an assignment after a prose command is text", payload: bash("echo GIT_PAGER='rm -rf /*'") },
  { want: "allow", why: "v12: an ssh URL is not ext::", payload: bash("git fetch ssh://host/repo.git") },
  { want: "deny", why: "KEYWORD: then opens a command", payload: bash("if true; then git push -f; fi") },
  { want: "deny", why: "KEYWORD: do opens a command", payload: bash("for i in 1; do rm -rf /; done") },
  { want: "deny", why: "KEYWORD: ! opens a command", payload: bash("! git push -f") },
  { want: "deny", why: "BACKSTOP: a runner in no table (winpty stands in for the next one)", payload: bash("winpty git push -f") },
  { want: "deny", why: "BACKSTOP: find -exec runs its command", payload: bash("find . -exec rm -rf / \\;") },
  { want: "deny", why: "PROCESS SUBSTITUTION is a command position", payload: bash("diff <(rm -rf /) x") },
  { want: "ask", why: "WRAPPER: the protected-branch push behind timeout", payload: bash(`timeout 30 git push origin ${P}`) },
  { want: "ask", why: "WRAPPER: a bare push behind timeout, after checking out the protected branch", payload: bash(`git checkout ${P} && timeout 30 git push`) },
  { want: "ask", why: "WRAPPER: a hard reset behind timeout", payload: bash("timeout 30 git reset --hard") },
  { want: "ask", why: "RUNNER: a protected-branch push inside bash -c", payload: bash(`bash -c "git push origin ${P}"`) },
  { want: "deny", why: "RUNNER: --no-verify inside bash -c", payload: bash('bash -c "git commit --no-verify -m x"') },
  { want: "ask", why: "KEYWORD: a hard reset after then", payload: bash("if true; then git reset --hard; fi") },
  { want: "deny", why: "MESSAGE MASK: an unclosed single quote does not hide a force-push", payload: bash("echo -m 'a\\' && git push -f && echo 'b'") },
  { want: "deny", why: "RUNNER: bash -o and its value before -c", payload: bash(`bash -o pipefail -c "git push -f origin ${W}"`) },
  { want: "deny", why: "BACKSTOP: a backslash does not escape inside single quotes, so what follows is bare", payload: bash("find . -name 'x\\' -exec rm -rf / \\;") },
  // The BACKSTOP finds a wrapped git, rm or gh anywhere, so the table shows in the PLAN: a checkout
  // behind a wrapper still moves HEAD for the push after it, and one behind a query does not.
  { want: "ask", why: "PLAN: a checkout behind timeout moves HEAD", payload: bash(`timeout 30 git checkout ${P} && git push`) },
  { want: "ask", why: "PLAN: a checkout behind nice -n and its value", payload: bash(`nice -n 5 git checkout ${P} && git push`) },
  { want: "ask", why: "PLAN: timeout -- and the duration still owed", payload: bash(`timeout -- 30 git checkout ${P} && git push`) },
  { want: "ask", why: "PLAN: a checkout after then", payload: bash(`if true; then git checkout ${P}; fi; git push`) },
  { want: "allow", why: "PLAN: command -v checks out nothing", payload: bash(`command -v git checkout ${P} && git push`) },
  { want: "ask", root: ON_P, why: "PLAN: a bare push the backstop finds is a push of HEAD", payload: bash("find . -maxdepth 0 -exec git push \\;") },
  // MUST NOT BREAK, from yoros's list and pleks's.
  { want: "allow", why: "command -v names git and runs nothing", payload: bash("command -v git") },
  { want: "allow", why: "PROSE: a wrapper named in echo's arguments", payload: bash("echo timeout 30 rm -rf /") },
  { want: "allow", why: "PROSE: a gated command named in echo's arguments", payload: bash("echo git push -f") },
  { want: "allow", why: "PROSE: grepping for a force-push", payload: bash('grep -rn "git push -f" .') },
  { want: "allow", why: "a -m message naming a wrapped force-push", payload: bash('git commit -m "timeout 30 git push -f"') },
  { want: "allow", why: "a script run by a shell is not the flags it is given", payload: bash("bash scripts/deploy.sh --force") },
  { want: "allow", why: "a lease push behind a wrapper is still the safe form", payload: bash(`timeout 30 git push --force-with-lease origin ${W}`) },
  { want: "allow", why: "QUOTED: a PR body naming gated commands is an argument", payload: bash('gh pr create --body "never rm -rf / or git push -f"') },
  { want: "allow", why: "a wrapper around an ordinary command", payload: bash("nice -n 5 npm run check") },
  { want: "allow", why: "a runner around an ordinary command", payload: bash("xargs -n1 echo") },
  { want: "allow", why: "COMMENT: nothing after a bare # runs", payload: bash("ls # then git push -f") },

  // ── v7: heredocs whose body is not data, and the message mask (pleks CF-9 ②, ③) ──
  { want: "deny", why: "HERE-STRING: <<< feeds one word, and the next lines run", payload: bash("cat <<< EOF\ngit push -f\nEOF") },
  { want: "deny", why: "HEREDOC PIPED ON: a sink's body sent to sh runs", payload: bash("cat <<'EOF' | sh\ngit push -f\nEOF") },
  { want: "deny", why: "UNQUOTED HEREDOC: $(…) in the body runs", payload: bash("cat <<EOF\n$(git push -f)\nEOF") },
  { want: "deny", why: "HEREDOC TO A PROCESS SUBSTITUTION: the body is sent to sh", payload: bash("cat <<'EOF' > >(sh)\ngit push -f\nEOF") },
  { want: "deny", why: "MESSAGE MASK: a backslash does not escape inside single quotes", payload: bash("echo -m 'a\\' && rm -rf /* && echo 'b'") },
  { want: "allow", why: "HEREDOC PIPED ON: a sink's body sent to another sink is still data", payload: bash("cat <<'EOF' | git commit -F -\nnever rm -rf /\nEOF") },
  { want: "allow", why: "UNQUOTED HEREDOC: a body with no substitution is still data", payload: bash("git commit -F - <<EOF\nno rm -rf / here\nEOF") },

  // ── v7: what git's flags actually spell ──
  { want: "allow", why: "PUSH -n is --dry-run, not --no-verify (yoros CF-10)", payload: bash(`git push -n origin ${W}`) },
  { want: "allow", why: "PUSH --dry-run likewise", payload: bash(`git push --dry-run origin ${W}`) },
  { want: "allow", why: "COMMIT -am is all and a message, not -n", payload: bash("git commit -am x") },
  { want: "deny", why: "COMMIT -an: -n inside a cluster is --no-verify", payload: bash("git commit -an -m x") },
  { want: "allow", why: "COMMIT -mn is the message \"n\", and skips nothing", payload: bash("git commit -mn") },
  { want: "deny", why: "ABBREVIATED: --no-veri is --no-verify to git", payload: bash("git commit --no-veri -m x") },
  { want: "deny", why: "core.hooksPath points every hook elsewhere", payload: bash("git -c core.hooksPath=/dev/null commit -m x") },
  { want: "ask", why: "ABBREVIATED: --har is --hard to git", payload: bash("git reset --har") },
  { want: "ask", why: "ABBREVIATED: --forc is --force to git clean", payload: bash("git clean --forc") },

  // ── v7: a merge names its SOURCE (pleks CF-8) ──
  { want: "allow", root: ON_W, why: `MERGE DIRECTION: merging ${P} into the working branch leaves ${P} alone (pleks CF-8)`, payload: bash(`git merge ${P}`) },
  { want: "allow", root: ON_W, why: `MERGE DIRECTION: likewise origin/${P}`, payload: bash(`git merge origin/${P}`) },
  { want: "ask", root: ON_P, why: "MERGE DIRECTION: any merge while on the protected branch lands on it", payload: bash("git merge feature-x") },

  // ── v8: the message flag wherever git reads one (yoros CF-11), and a message that is not inert ──
  { want: "allow", why: "MESSAGE CLUSTER: -am's value is the message (yoros CF-11)", payload: bash('git commit -am "never use --no-verify"') },
  { want: "allow", why: "MESSAGE CLUSTER: -qm likewise", payload: bash('git commit -qm "never use --no-verify"') },
  { want: "allow", why: 'MESSAGE ATTACHED: -m"…" is the message', payload: bash('git commit -m"never use --no-verify"') },
  { want: "allow", why: 'MESSAGE ATTACHED: --message="…" is the message', payload: bash('git commit --message="never use --no-verify"') },
  { want: "deny", why: "MESSAGE CLUSTER: -Fm reads the file m, so the next word is a flag", payload: bash('git commit -Fm "--no-verify"') },
  { want: "deny", why: "MESSAGE CLUSTER: -cm reuses the commit m, so the next word is a flag", payload: bash('git commit -cm "--no-verify"') },
  { want: "deny", why: "MESSAGE CLUSTER: an n before the m is still --no-verify", payload: bash('git commit -anm "fine message"') },
  { want: "deny", why: "MESSAGE CLUSTER: a quoted --no-verify before -am is the flag (yoros CF-11)", payload: bash('git commit "--no-verify" -am x') },
  { want: "deny", why: "MESSAGE FLAG: an -m ending another word starts no message", payload: bash('git commit --author=a-m "--no-verify"') },
  { want: "deny", why: "SUBSTITUTION: a double-quoted message runs its $(…)", payload: bash('git commit -m "$(git push -f)"') },
  { want: "deny", why: "SUBSTITUTION: and its backticks", payload: bash('git commit -m "x `rm -rf /`"') },
  { want: "allow", why: "SUBSTITUTION: in single quotes it is text", payload: bash("git commit -m '$(git push -f)'") },
  { want: "allow", why: "SUBSTITUTION: one that names nothing gated still passes", payload: bash('git commit -m "build $(date +%F)"') },
  { want: "deny", why: "QUOTED -m: a -m inside quotes starts no message", payload: bash(`echo " -m '" && git push -f && echo "'"`) },

  // ── v9: a long command gets a decision, never a crash (pleks CF-17) ──
  // v8 died on 100 KB of `rm x rm x …` with "JavaScript heap out of memory", exit 134 and no decision —
  // which Claude Code reads as a non-blocking error, so the gate failed open. Timing is asserted below.
  { want: "ask", why: "SIZE: 100 KB of later rm positions passes the backstop's budget — asked, not crashed (pleks CF-17)", payload: bash("rm x ".repeat(20_000)) },
  { want: "deny", why: "SIZE: over the budget, a deny at a command word still denies", payload: bash(`rm -rf / ${"rm x ".repeat(20_000)}`) },
  { want: "deny", why: "SIZE: …and in a later segment", payload: bash(`${"rm x ".repeat(20_000)}; git push -f origin ${W}`) },
  { want: "allow", why: "SIZE: 100 KB of ordinary segments is read in full and allowed", payload: bash("git status; ".repeat(9_000)) },
  { want: "ask", why: "SIZE: the plan reaches the last of 9,000 segments — a checkout of the protected branch, then a bare push", payload: bash(`git checkout ${P}; ${"git status; ".repeat(9_000)}git push`) },
  { want: "allow", why: "SIZE: …and the same plan on the working branch pushes freely", payload: bash(`git checkout ${W}; ${"git status; ".repeat(9_000)}git push`) },
  { want: "ask", root: WORKTREE, why: "SIZE: a later push is read from the branch BEFORE its segment, not after the branch that segment creates", payload: bash(`git switch -c ${W} git push`) },
  { want: "allow", why: "SIZE: a 100 KB commit body to a sink heredoc is data, read once", payload: bash(`git commit -F - <<'MSG'\n${"never rm -rf / here\n".repeat(5_000)}MSG`) },

  // ── v13: WHAT CONSUMES TEXT DECIDES WHETHER IT IS TEXT (pleks CF-18) ──
  // The first twenty are pleks's payloads, every one ALLOWED by v12 (measured in canon, 2026-10-06),
  // each wanting what its bare act gets. The rest are one case per part of the reading, and the cost.
  { want: "deny", why: "v13: an echo piped into bash is code", payload: bash("echo 'rm -rf ~' | bash") },
  { want: "ask", why: "v13: an echo piped into sh asks as its act does", payload: bash("echo 'git reset --hard' | sh") },
  { want: "deny", why: "v13: a printf piped into bash is code", payload: bash("printf 'git push -f origin x' | bash") },
  { want: "ask", why: "v13: git clean piped into sh", payload: bash("echo 'git clean -fdx' | sh") },
  { want: "deny", why: "v13: a here-string into sh is code", payload: bash("sh <<< 'rm -rf ~'") },
  { want: "deny", why: "v13: a here-string into bash is code", payload: bash("bash <<< 'git push -f origin x'") },
  { want: "deny", why: "v13: rm -r of a $(…) target cannot be shown not to be home", payload: bash("rm -rf $(echo ~)") },
  { want: "deny", why: "v13: …nor of a backtick target", payload: bash("rm -rf `echo ~`") },
  { want: "deny", why: "v13: …nor of one holding a separator", payload: bash("rm -rf $(cd ~; pwd)") },
  { want: "deny", why: "v13: …nor of one printing the root", payload: bash("rm -rf $(echo /)") },
  { want: "deny", why: "v13: pwsh -c runs its quoted string", payload: bash('pwsh -c "git push -f origin x"') },
  { want: "deny", why: "v13: cmd.exe /c runs its quoted string", payload: bash('cmd.exe /c "git push -f origin x"') },
  { want: "ask", why: "v13: python -c reaches a shell through os.system's literal", payload: bash(`python -c "import os; os.system('git reset --hard')"`) },
  { want: "ask", why: "v13: a heredoc into node - is code, and its literals are commands", payload: bash("node - <<'EOF'\nrequire('child_process').execSync('git reset --hard')\nEOF") },
  { want: "deny", why: "v13: sed's e command runs its line", payload: bash("sed -n '1e git push -f origin x' x.txt") },
  { want: "deny", why: "v13: sed -f - takes its program from the heredoc", payload: bash("sed -f - x.txt <<'EOF'\n1e git push -f origin x\nEOF") },
  { want: "deny", why: "v13: awk -f - takes its program from the heredoc", payload: bash("awk -f - <<'EOF'\nBEGIN{system(\"git push -f origin x\")}\nEOF") },
  { want: "deny", why: "v13: perl -e system()", payload: bash(`perl -e 'system("git push -f origin x")'`) },
  { want: "deny", why: "v13: ruby -e system()", payload: bash(`ruby -e 'system("git push -f origin x")'`) },
  { want: "deny", why: "v13: awk's system() runs its literal", payload: bash(`awk 'BEGIN{system("git push -f origin x")}'`) },
  { want: "deny", why: "v13: printf's \\n is a newline, so the second line runs", payload: bash("printf 'x\\ngit push -f origin x' | sh") },
  { want: "deny", why: "v13: $'…' is a quote too", payload: bash("echo $'rm -rf ~' | sh") },
  { want: "deny", why: "v13: a consumed string is read again — a pipe inside bash -c", payload: bash(`bash -c "echo 'rm -rf ~' | sh"`) },
  { want: "deny", why: "v13: cmd runs its stdin", payload: bash("echo 'git push -f origin x' | cmd") },
  { want: "ask", why: "v13: python runs its stdin, and its literals are commands", payload: bash(`echo "import os; os.system('git reset --hard')" | python3`) },
  { want: "deny", why: "v13: a code interpreter's literals joined — execFileSync's argument list", payload: bash(`node -e "require('child_process').execFileSync('git', ['push', '-f', 'origin', 'x'])"`) },
  { want: "deny", why: "v13: sed's s///e runs its replacement", payload: bash("sed 's/.*/git push -f origin x/e' x.txt") },
  { want: "deny", why: "v13: awk's \"cmd\" | getline runs cmd", payload: bash(`awk 'BEGIN{"git push -f origin x" | getline}'`) },
  { want: "deny", why: "v13: a subshell piped on is still a stage", payload: bash("(echo 'rm -rf ~') | sh") },
  { want: "deny", why: "v13: 2>&1 is a redirection, not a separator", payload: bash("echo 'git push -f origin x' 2>&1 | sh") },
  { want: "deny", why: "v13: a $(…) word is one word", payload: bash("echo $(date) 'git push -f origin x' | sh") },
  { want: "deny", why: "v13: a backtick word is one word", payload: bash("echo 'git push -f origin x' `a; b` | sh") },
  { want: "ask", why: "v13: an escaped quote inside double quotes is the quote", payload: bash('python -c "import os; os.system(\\"git reset --hard\\")"') },
  { want: "deny", why: "v13: a filter between the text and the shell passes it on", payload: bash("echo 'rm -rf ~' | sed 's/x/y/' | sh") },
  { want: "deny", why: "v13: a here-string behind a wrapper", payload: bash("sudo bash <<< 'rm -rf ~'") },
  { want: "deny", why: "v13: a quoted $(…) target is still the substitution", payload: bash('rm -rf "$(echo ~)"') },
  { want: "deny", why: "v13: …and at a later position the backstop finds", payload: bash("find . -exec rm -rf $(echo ~) \\;") },
  { want: "deny", why: "v13: an escaped space joins a word", payload: bash("echo rm\\ -rf\\ ~ | sh") },
  { want: "deny", why: "v13: a literal's \\n is a newline to the language, so its second line runs", payload: bash(`python -c "import os; os.system('cd x\\ngit push -f origin x')"`) },
  { want: "deny", why: "v13: a literal's other escapes come off, as the shell it reaches takes them", payload: bash(`python -c "import os; os.system('g\\it push -f origin x')"`) },
  { want: "deny", why: "v13: sed -e names its program", payload: bash("sed -e '1e git push -f origin x' x.txt") },
  { want: "deny", why: "v13: awk -F's value is not the program", payload: bash(`awk -F , 'BEGIN{system("git push -f origin x")}'`) },
  { want: "deny", why: "v13: pwsh's -Command spelled in full", payload: bash('powershell -Command "git push -f origin x"') },
  { want: "deny", why: "v13: <<- strips the terminator's tabs, and the command after it is read", payload: bash("cat <<-EOF\n\tx\n\tEOF\necho 'rm -rf ~' | sh") },
  // MUST NOT BREAK (pleks's list), and the cost each part of the reading must not charge.
  { want: "allow", why: "v13: a commit message naming rm -rf ~", payload: bash('git commit -m "never rm -rf ~ here"') },
  { want: "allow", why: "v13: grepping for rm -rf", payload: bash('grep "rm -rf" notes.md') },
  { want: "allow", why: "v13: a PR body naming rm -rf /", payload: bash('gh pr create --body "rm -rf / is denied"') },
  { want: "allow", why: "v13: an echo that nothing consumes", payload: bash("echo 'rm -rf ~'") },
  { want: "allow", why: "v13: an echo piped into cat", payload: bash("echo 'rm -rf ~' | cat") },
  { want: "allow", why: "v13: a printf piped into grep", payload: bash("printf 'x' | grep x") },
  { want: "allow", why: "v13: a consumed string's -m message is a message", payload: bash(`echo 'git commit -m "never git push -f"' | sh`) },
  { want: "allow", why: "v13: a pipe after a # is a comment", payload: bash("ls # echo 'rm -rf ~' | sh") },
  { want: "allow", why: "v13: $(…) followed by a named path is not a whole target", payload: bash("rm -rf $(pwd)/build") },
  { want: "allow", why: "v13: $(…) after a name is not a whole target", payload: bash("rm -rf build-$(date +%s)") },
  { want: "allow", why: "v13: a non-recursive rm of a substitution", payload: bash("rm $(ls *.tmp)") },
  { want: "allow", why: "v13: a code interpreter with no gated literal", payload: bash(`python -c "print('hello')"`) },
  { want: "allow", why: "v13: sed -f - without e is a filter", payload: bash("sed -f - x.txt <<'EOF'\ns/a/b/\nEOF") },
  { want: "allow", why: "v13: a `;` ends a pipeline — the shell after it is not given what the pipeline wrote", payload: bash("echo 'rm -rf ~' | cat; bash -c ls") },

  // ── v14: A QUOTED PATH IS ONE WORD (blindly CF-8) ──
  // Git for Windows' default install path has a space, and a quoted path to it was split at the
  // space, so the command word read as `C:/Program`. Every one of these was ALLOWED by v13.
  { want: "deny", why: "v14: a quoted path to git.exe force-pushes", payload: bash(`"C:/Program Files/Git/cmd/git.exe" push --force origin main`) },
  { want: "deny", why: "v14: …single-quoted", payload: bash(`'C:/Program Files/Git/cmd/git.exe' push -f origin x`) },
  { want: "deny", why: "v14: …with backslashes", payload: bash(String.raw`"C:\Program Files\Git\cmd\git.exe" push --force`) },
  { want: "deny", why: "v14: a quoted path to git.exe skips hooks", payload: bash(`"C:/Program Files/Git/cmd/git.exe" commit --no-verify`) },
  { want: "deny", why: "v14: a quoted path to rm.exe at the root", payload: bash(`"C:/Program Files/Git/usr/bin/rm.exe" -rf /*`) },
  { want: "ask", why: "v14: a quoted path to git.exe pushing main asks as git does", payload: bash(`"C:/Program Files/Git/cmd/git.exe" push origin main`) },
  { want: "deny", why: "v14: …behind a wrapper", payload: bash(`sudo "/opt/my tools/git" push --force`) },
  { want: "deny", why: "v14: an ESCAPED space was never split from its word — the backstop held it, and still does", payload: bash(String.raw`/c/Program\ Files/Git/cmd/git.exe push --force`) },
  { want: "allow", why: "v14: a quoted path to git.exe reading status", payload: bash(`"C:/Program Files/Git/cmd/git.exe" status`) },
  { want: "allow", why: "v14: a quoted path to another program", payload: bash(`"C:/Program Files/nodejs/node.exe" -v`) },
  { want: "allow", why: "v14: a quoted argument holding a gated act's words is still one argument", payload: bash(`echo "git push --force" > notes.txt`) },

  // ── v15: THE READINGS DIFFER BY POSITION, NOT BY COUNT (blindly CF-10) ──
  // A quoted `" "` is one word and no token; v14 compared counts, so it cancelled the path's split.
  { want: "deny", why: "v15: a quoted space in a comment cancelled the count — force push", payload: bash(`"C:/Program Files/Git/cmd/git.exe" push --force origin main # " "`) },
  { want: "ask", why: "v15: …and pushing main", payload: bash(`"C:/Program Files/Git/cmd/git.exe" push origin main # " "`) },
  { want: "deny", why: "v15: …rm.exe at the root, the quoted space as an argument", payload: bash(`"C:/Program Files/Git/usr/bin/rm.exe" -rf /* " "`) },
  { want: "ask", why: "v15: …reset --hard asks as git does", payload: bash(`"C:/Program Files/Git/cmd/git.exe" reset --hard # " "`) },
  { want: "deny", why: "v15: two quoted spaces against two splits", payload: bash(`"C:/Program Files/My Git/git.exe" push --force " " " "`) },
  { want: "allow", why: "v15: the same path reading status with the quoted space", payload: bash(`"C:/Program Files/Git/cmd/git.exe" status # " "`) },

  // ── v16: WHAT A COMMAND RUNS THAT IT NEVER QUOTED (pleks's v15 scout, 826b5722) ──
  { want: "deny", why: "v16: source runs a process substitution's output", payload: bash("source <(echo git push -f)") },
  { want: "deny", why: "v16: …and so does `.`", payload: bash(". <(echo git push -f origin x)") },
  { want: "deny", why: "v16: …and a shell given one as its script", payload: bash("bash <(echo git push -f origin x)") },
  { want: "deny", why: "v16: …past the shell's options", payload: bash("bash -e -- <(printf 'rm -rf ~')") },
  { want: "deny", why: "v16: a substitution's output as the command word", payload: bash("$(printf 'git push') -f origin x") },
  { want: "deny", why: "v16: …as backticks", payload: bash("`echo git` push --force origin x") },
  { want: "ask", why: "v16: …asking as its act does", payload: bash("$(echo git) reset --hard") },
  { want: "deny", why: "v16: a file written and run in one command", payload: bash("printf 'git push -f\\n' > x.sh && sh x.sh") },
  { want: "deny", why: "v16: …written by a heredoc and run on the next line", payload: bash("cat <<'EOF' > x.sh\ngit push -f\nEOF\nsh x.sh") },
  { want: "deny", why: "v16: …appended, and run by path", payload: bash("echo 'rm -rf ~' >> ./x.sh; ./x.sh") },
  { want: "deny", why: "v16: …written as x.sh and run as ./x.sh — one file", payload: bash("echo 'git push -f' > x.sh; sh ./x.sh") },
  { want: "deny", why: "v16: …by tee, and sourced", payload: bash("echo 'git push -f' | tee x.sh >/dev/null; source x.sh") },
  { want: "deny", why: "v16: npx -c runs a shell string", payload: bash("npx -c 'git push -f origin x'") },
  { want: "deny", why: "v16: …npm exec --call= too", payload: bash("npm exec --call='rm -rf ~'") },
  { want: "allow", why: "v16: diff of two process substitutions runs neither's output", payload: bash("diff <(sort a.txt) <(sort b.txt)") },
  { want: "allow", why: "v16: a shell given a download's output — no gated act in the text", payload: bash("bash <(curl -s https://example.com/install.sh)") },
  { want: "allow", why: "v16: a substitution inside the command word that names no gated act", payload: bash("$(npm bin)/eslint .") },
  { want: "allow", why: "v16: a file written and only read", payload: bash("printf 'git push -f\\n' > notes.txt && cat notes.txt") },
  { want: "allow", why: "v16: a file written and a DIFFERENT one run", payload: bash("echo 'git push -f' > x.sh && sh build.sh") },
  { want: "allow", why: "v16: npx -c with a harmless string", payload: bash("npx -c 'echo hi'") },
  { want: "allow", why: "v16: npx running a tool", payload: bash("npx eslint .") },
  // NOT COVERED, declared: a file written by an EARLIER Bash call is text no command shows the gate.
  { want: "allow", why: "v16: NOT COVERED — `sh x.sh` alone runs a file this call never wrote", payload: bash("sh x.sh") },

  // ── v17: A STRING HANDED TO A PROGRAM THE GATE DOES NOT KNOW (pleks CF-21, 80272128) ──
  { want: "deny", why: "v17: cmd //c — Git Bash's spelling of /c", payload: bash('cmd //c "git push --force origin main"') },
  { want: "deny", why: "v17: …through start", payload: bash('start cmd //c "git push --force origin x"') },
  { want: "deny", why: "v17: wsl hands its shell a string", payload: bash('wsl sh -c "git push --force"') },
  { want: "ask", why: "v17: …asking as its act does", payload: bash('wsl.exe -e bash -c "git reset --hard"') },
  { want: "deny", why: "v17: find -exec sh -c", payload: bash('find . -maxdepth 0 -exec sh -c "git push --force" \\;') },
  { want: "deny", why: "v17: git filter-branch runs its filters", payload: bash('git filter-branch --tree-filter "rm -rf ~/*" HEAD') },
  { want: "deny", why: "v17: …and rebase its --exec", payload: bash('git rebase --exec "rm -rf ~" HEAD~3') },
  // rm, not push: a quoted `push -f` is already found by the token reading, so it cannot reach this one.
  { want: "deny", why: "v17: …as --exec=", payload: bash("git rebase --exec='rm -rf ~' HEAD~3") },
  { want: "deny", why: "v17: …and as -x", payload: bash("git rebase -x 'rm -rf ~' HEAD~3") },
  { want: "deny", why: "v17: a key=value argument's value — npm pkg set scripts", payload: bash('npm pkg set scripts.x="git push --force" && npm run x') },
  { want: "deny", why: "v17: npx concurrently runs each string", payload: bash('npx concurrently "git push --force origin x"') },
  { want: "deny", why: "v17: npm's options before exec", payload: bash('npm --yes exec -c "git push --force origin x"') },
  { want: "deny", why: "v17: …and its exe alias", payload: bash('npm exe -c "git push --force origin x"') },
  { want: "deny", why: "v17: su -c", payload: bash('su -c "rm -rf ~"') },
  { want: "deny", why: "v17: flock past its lock file", payload: bash('flock /tmp/l -c "git push -f"') },
  { want: "deny", why: "v17: busybox sh -c", payload: bash('busybox sh -c "git push -f"') },
  { want: "deny", why: "v17: ssh runs its string on the host", payload: bash('ssh box "rm -rf ~"') },
  { want: "deny", why: "v17: docker exec … sh -c", payload: bash('docker exec c sh -c "git push -f"') },
  { want: "allow", why: "v17: cmd //c with a harmless string", payload: bash('cmd //c "git log"') },
  { want: "allow", why: "v17: find -exec a harmless program", payload: bash("find . -exec ls {} \\;") },
  { want: "allow", why: "v17: gh is text — a PR body naming a runner", payload: bash('gh pr create --title t --body "use wsl sh -c \\"git push -f\\" to deploy"') },
  { want: "allow", why: "v17: git reads a message as a message", payload: bash('git commit -m "docs: never rm -rf ~ in scripts"') },
  { want: "allow", why: "v17: curl's data is data", payload: bash('curl -d "git push -f" https://example.com') },
  { want: "allow", why: "v17: unknown programs given harmless strings", payload: bash('npx concurrently "npm run dev" "npm run api"') },
  { want: "allow", why: "v17: …and a quoted key=value", payload: bash('docker run --rm -e "A=b c" node:22 node -v') },
  { want: "allow", why: "v17: a harmless filter", payload: bash('git filter-branch --msg-filter "sed s/a/b/" HEAD') },
  // THE COST, declared: an unknown program's quoted string naming a gated act is gated as if run.
  { want: "deny", why: "v17: COST — a test name naming a gated act, given to an unknown program", payload: bash('npx vitest run -t "rejects rm -rf ~"') },
  // NOT COVERED, declared: an expansion is not text the gate can read.
  { want: "allow", why: "v17: NOT COVERED — the string arrives through a variable", payload: bash('npx concurrently "$CMD"') },

  // ── v18: …AND THE KNOWN PROGRAMS THAT RUN ONE ANYWAY (pleks CF-22, 0b60481d) ──
  // rm, not push, wherever the string is quoted: a quoted `push -f` is found by the token reading.
  { want: "deny", why: "v18: git bisect run hands its rest to a shell", payload: bash('git bisect run sh -c "rm -rf ~"') },
  { want: "deny", why: "v18: …as one string", payload: bash('git bisect run "rm -rf ~"') },
  { want: "deny", why: "v18: git submodule foreach runs its string", payload: bash('git submodule foreach "rm -rf ~"') },
  { want: "deny", why: "v18: …past its options", payload: bash("git submodule foreach --recursive 'rm -rf ~'") },
  { want: "deny", why: "v18: git difftool --extcmd=", payload: bash('git difftool --extcmd="rm -rf ~" HEAD~1') },
  { want: "deny", why: "v18: git send-email --sendmail-cmd", payload: bash('git send-email --sendmail-cmd="rm -rf ~" x.patch') },
  { want: "deny", why: "v18: bun x is npx", payload: bash('bun x concurrently "git push --force origin x"') },
  { want: "deny", why: "v18: node running a package's bin", payload: bash('node node_modules/.bin/concurrently "rm -rf ~"') },
  { want: "deny", why: "v18: node -e code that runs its argv", payload: bash('node -e "require(\'child_process\').execSync(process.argv[1])" "git push --force origin x"') },
  { want: "deny", why: "v18: …python3 -c", payload: bash('python3 -c "import os,sys; os.system(sys.argv[1])" "rm -rf ~"') },
  { want: "deny", why: "v18: …perl -e", payload: bash("perl -e 'system $ARGV[0]' \"rm -rf ~\"") },
  { want: "deny", why: "v18: gh alias set --shell runs its expansion", payload: bash("gh alias set --shell p 'rm -rf ~' && gh p") },
  { want: "deny", why: "v18: …as -s", payload: bash("gh alias set -s p 'rm -rf ~'") },
  { want: "deny", why: "v18: a tee into >(sh) runs what tee is given", payload: bash('tee >(sh) <<< "rm -rf ~"') },
  { want: "deny", why: "v18: …from the pipeline", payload: bash('echo "rm -rf ~" | tee >(bash) >/dev/null') },
  { want: "allow", why: "v18: bisect run of a test", payload: bash("git bisect run npm test") },
  { want: "allow", why: "v18: foreach of a harmless string", payload: bash('git submodule foreach "git status"') },
  { want: "allow", why: "v18: a gh alias of gh arguments", payload: bash("gh alias set co 'pr checkout'") },
  { want: "allow", why: "v18: a tee into >(…) that is not an interpreter", payload: bash('tee >(wc -l) <<< "rm -rf ~"') },
  { want: "allow", why: "v18: node given a path", payload: bash("node scripts/x.mjs src/a.ts") },
  { want: "allow", why: "v18: node -e given a harmless argument", payload: bash('node -e "console.log(process.argv[1])" "a b"') },
  { want: "allow", why: "v18: a code interpreter's code keeps v13's reading of its literals", payload: bash('node -e "const a = 1; console.log(a | 2)"') },
  { want: "allow", why: "v18: …so code naming an act outside a literal is not read as a shell line", payload: bash('node -e "x(); // never rm -rf ~"') },
  // gawk, not awk: `awk` and `sed` are heredoc sinks, so only their g-/m-/n- spellings reach this rule.
  { want: "allow", why: "v18: awk's arguments are its program and its variables, not commands", payload: bash(`gawk -v pat="rm -rf ~" '$0 ~ pat { n++ }' notes.md`) },
  // THE COST, declared: a script's quoted argument naming a gated act is read as run.
  { want: "deny", why: "v18: COST — a script's quoted argument naming a gated act", payload: bash('node tools/x.mjs "rm -rf ~"') },

  /* KIT:CONFIG cases — this project's own gates, beyond the canonical set above.
   * ONE PROBE PER RULE YOU ADDED TO THE HOOK'S DENY/ASK BLOCKS, both directions: the
   * violation, and the near-miss that must still pass. A rule with no probe is a rule
   * nobody has checked matches what it means to match. */
  // pleks: one pair per rule added in the hook's seams / deny / ask regions (violation, then near-miss).
  { want: "deny", why: "PLEKS SEAM: the .githooks probe seam substitutes the commit gate (M-096)", payload: bash("PLEKS_HOOK_PROBE=1 PLEKS_PRECOMMIT_CMD=true git commit -m x") },
  { want: "deny", why: "PLEKS SEAM: PLEKS_BRANCH_PROBE is an independent vehicle and denies alone", payload: bash("PLEKS_BRANCH_PROBE=feat git commit -m x") },
  { want: "allow", why: "PLEKS SEAM: writing about the seam is not setting it", payload: bash("grep PLEKS_HOOK_PROBE .githooks/pre-commit") },
  { want: "ask", why: "PLEKS PUSH: -C names another repository and the push still asks", payload: bash("git -C /tmp/other push origin feat") },
  { want: "allow", why: "PLEKS PUSH: `git stash push` stores a stash, it publishes nothing", payload: bash("git stash push -m wip") },
  { want: "deny", why: "PLEKS LEASE: force-with-lease is still a force push (check-bash-gate.mjs asserts it)", payload: bash("git push --force-with-lease origin feat") },
  { want: "ask", why: "PLEKS LEASE: --force-if-includes alone is an ordinary push, which asks", payload: bash("git push --force-if-includes origin feat") },
  { want: "ask", why: "PLEKS .ENV: reading an env file asks", payload: bash("cat .env.local") },
  { want: "allow", why: "PLEKS .ENV: process.env in code is not the file", payload: bash('node -e "console.log(process.env.NODE_ENV)"') },
  { want: "ask", why: "PLEKS SUPABASE: db push applies DDL to the linked project", payload: bash("supabase db push") },
  { want: "allow", why: "PLEKS SUPABASE: other supabase subcommands are not prod writes", payload: bash("supabase status") },
  { want: "ask", why: "PLEKS RECONCILE: apply-prod applies a script to PRODUCTION", payload: bash("node supabase/reconcile/apply-prod.mjs --confirm") },
  { want: "allow", why: "PLEKS RECONCILE: a sibling reconcile script is not apply-prod", payload: bash("node supabase/reconcile/plan.mjs") },
  // Walker F1: a gated act handed as text to a runner outside canon's table (each was executable here).
  { want: "deny", why: "PLEKS RUNNER: cmd //c is Git Bash's spelling of cmd /c and runs its string", payload: bash('cmd //c "git push --force origin main"') },
  { want: "deny", why: "PLEKS RUNNER: cmd.exe by path, //c, a hard reset", payload: bash('C:/Windows/system32/cmd.exe //c "git reset --hard"') },
  { want: "deny", why: "PLEKS RUNNER: cmd //c runs a --no-verify commit", payload: bash('cmd //c "git commit --no-verify -m x"') },
  { want: "deny", why: "PLEKS RUNNER: wsl sh -c runs its string in Linux", payload: bash('wsl sh -c "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: wsl.exe -e bash -c, a hard reset", payload: bash('wsl.exe -e bash -c "git reset --hard"') },
  { want: "deny", why: "PLEKS RUNNER: find -exec sh -c runs its string per match", payload: bash('find . -maxdepth 0 -exec sh -c "git push --force" \\;') },
  { want: "deny", why: "PLEKS RUNNER: filter-branch's tree-filter evals its string", payload: bash('git filter-branch --tree-filter "rm -rf ~/*" HEAD') },
  { want: "deny", why: "PLEKS RUNNER: rebase --exec runs its string after each commit", payload: bash('git rebase -i main --exec "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: npm pkg set writes a script that npm run then runs — denied as the force push is directly (v17 reads a key=value's value; the held gate asked)", payload: bash('npm pkg set scripts.x="git push --force" && npm run x') },
  { want: "ask", why: "PLEKS RUNNER: flags in any order — watch runs a forced clean, which asks as directly", payload: bash('watch -n1 "git clean -fd"') },
  { want: "allow", why: "PLEKS RUNNER: rm -rfv on a named directory is ordinary, as directly and in the held gate", payload: bash('cmd //c "rm -rfv build"') },
  // Re-walk F2/F3 (02-walker.md): the shell's words, not the text's spelling.
  { want: "deny", why: "PLEKS RUNNER: rm -r -f as separate flags", payload: bash('cmd //c "rm -r -f /"') },
  { want: "deny", why: "PLEKS RUNNER: rm --recursive --force", payload: bash('wsl sh -c "rm --recursive --force ~"') },
  { want: "deny", why: "PLEKS RUNNER: commit -n is --no-verify", payload: bash('cmd //c "git commit -n -m x"') },
  { want: "deny", why: "PLEKS RUNNER: quote concatenation g\"\"it is git", payload: bash('cmd //c "g""it push --force"') },
  { want: "deny", why: "PLEKS RUNNER: inner-shell quotes g'i't is git", payload: bash(`wsl sh -c "g'i't push --force"`) },
  { want: "deny", why: "PLEKS RUNNER: a substitution as the git word", payload: bash('cmd //c "$(echo git) push --force"') },
  { want: "deny", why: "PLEKS RUNNER: a substitution as the force flag", payload: bash('cmd //c "git push $(echo --force)"') },
  { want: "deny", why: "PLEKS RUNNER: quote-concatenated --force", payload: bash('cmd //c "git push ""--force"""') },
  { want: "deny", why: "PLEKS RUNNER: npx concurrently runs its string", payload: bash('npx -y concurrently "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: a +refspec through a runner is denied as it is directly (v17 reads cmd //c; the held gate asked)", payload: bash('cmd //c "git push origin +main"') },
  { want: "deny", why: "PLEKS RUNNER: --mirror through wsl — canon reads wsl's argv and denies it", payload: bash('wsl git push --mirror') },
  { want: "ask", why: "PLEKS RUNNER: clean --force asks, as directly", payload: bash('cmd //c "git clean --force"') },
  { want: "allow", why: "PLEKS RUNNER: gh --body prose naming a runner and a push is not a runner", payload: bash('gh pr comment 5 --body "the script runs git push --force"') },
  { want: "allow", why: "PLEKS RUNNER: a commit message naming cmd //c git push --force is prose", payload: bash('git commit -m "docs: cmd //c git push --force is denied"') },
  { want: "allow", why: "PLEKS RUNNER: find -exec grep for the word push", payload: bash('find . -exec grep -l push {} +') },
  // Third walk (03-walker.md): a runner anywhere in the command, cmd's own escapes, and routine work.
  { want: "deny", why: "PLEKS RUNNER: start before cmd //c", payload: bash('start cmd //c "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: cmd //c inside an if", payload: bash('if cmd //c "git push --force"; then :; fi') },
  { want: "deny", why: "PLEKS RUNNER: sudo -u with its argument before cmd //c", payload: bash('sudo -u root cmd //c "git reset --hard"') },
  { want: "deny", why: "PLEKS RUNNER: c\\md is cmd to bash", payload: bash('c\\md //c "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: cmd's ^ escape inside git is still git to cmd", payload: bash('cmd //c "git^ push --force"') },
  { want: "deny", why: "PLEKS RUNNER: cmd's ^ escape before git is still git to cmd (the held gate only asked)", payload: bash('cmd //c "^git push --force"') },
  { want: "allow", why: "PLEKS RUNNER: npx then a commit whose message is a substitution", payload: bash('npx prettier --write . && git commit -m "$(date)"') },
  { want: "allow", why: "PLEKS RUNNER: npx then rm -rf of a named build directory", payload: bash("npx tsc && rm -rf dist") },
  { want: "allow", why: "PLEKS RUNNER: find -exec grep -n for a phrase", payload: bash('find . -name "*.md" -exec grep -n "git commit" {} +') },
  { want: "allow", why: "PLEKS RUNNER: a PR body that says watch and start is not a runner", payload: bash('gh pr create --title x --body "watch the deploy, then start git push docs"') },
  // Floor walk (.handoff/kit-bash-gate-v16-floor/01-walker.md).
  { want: "deny", why: "PLEKS RUNNER: an npm option before exec still runs the string", payload: bash('npm --yes exec -c "git push --force origin main"') },
  { want: "deny", why: "PLEKS RUNNER: npm's exe abbreviation is exec", payload: bash('npm exe -c "git reset --hard"') },
  { want: "deny", why: "PLEKS RUNNER: pnpm dlx after an option", payload: bash('pnpm --silent dlx concurrently "git push --force"') },
  { want: "deny", why: "PLEKS RUNNER: the npx.cmd shim is npx", payload: bash('npx.cmd concurrently "git push --force origin main"') },
  { want: "deny", why: "PLEKS RUNNER: cross-env runs its argument through a shell", payload: bash('./node_modules/.bin/cross-env "git push --force origin main"') },
  { want: "ask", why: "PLEKS RUNNER: a .env read run from a written .bat asks, as the held gate did", payload: bash("cat > x.bat <<'EOF'\ntype .env\nEOF\ncmd //c x.bat") },
  { want: "deny", why: "PLEKS RUNNER ACCEPTED COST: npx beside a commit body naming rm -rf / gets the held gate's false deny", payload: bash("npx tsc --noEmit && git commit -F - <<'EOF'\ndocs: never rm -rf /\nEOF") },
  { want: "allow", why: "PLEKS RUNNER: npm run with an x argument is not exec", payload: bash("npm run build") },
  { want: "ask", why: "PLEKS RUNNER: a plain push through cmd //c asks, as it would directly", payload: bash('cmd //c "git push origin feature"') },
  { want: "ask", why: "PLEKS RUNNER: a prod DB act through wsl asks", payload: bash('wsl sh -c "supabase db push"') },
  { want: "allow", why: "PLEKS RUNNER: cmd //c with nothing gated is ordinary work", payload: bash('cmd //c "git rev-parse --short HEAD"') },
  { want: "allow", why: "PLEKS RUNNER: find -exec with nothing gated is ordinary work", payload: bash('find . -name "*.tmp" -exec ls {} \\;') },
  { want: "allow", why: "PLEKS RUNNER: npm pkg set of a harmless script", payload: bash('npm pkg set scripts.x="vitest run"') },
  /* KIT:CONFIG /cases */
];

const { cases: EFFECTIVE, findings: verdictFindings } = applyVerdicts(CASES, PROJECT_VERDICTS);

let failed = verdictFindings.length;
for (const f of verdictFindings) console.log(`✗ ${f}`);

const DECLARED_LOOSER = { ...LOOSENED, ...PROJECT_LOOSENED };
for (const why of Object.keys(DECLARED_LOOSER)) {
  if (!CASES.some((c) => c.why === why)) {
    failed++;
    console.log(`✗ ${Object.hasOwn(PROJECT_LOOSENED, why) ? "the loosened region" : "LOOSENED"} names "${why}", which no case carries — a declaration for nothing`);
  }
}

// --against <file>: the previous gate, copied beside this directory's files so its imports resolve,
// and as `.mjs` unless it is CommonJS. Nothing is written to your tree.
const againstAt = process.argv.indexOf("--against");
let AGAINST = null;
if (againstAt !== -1) {
  const src = process.argv[againstAt + 1];
  if (!src || !existsSync(src)) {
    console.log(`✗ --against needs the previous bash-gate.js; "${src ?? ""}" does not exist`);
    process.exit(1);
  }
  const dir = mkdtempSync(join(tmpdir(), "bash-gate-against-"));
  for (const f of readdirSync(HERE)) if (statSync(join(HERE, f)).isFile()) copyFileSync(join(HERE, f), join(dir, f));
  const text = readFileSync(src, "utf8");
  const cjs = /\brequire\(/.test(text) && !/^[ \t]*import\b/m.test(text);
  AGAINST = { src, dir, file: join(dir, cjs ? "bash-gate.against.cjs" : "bash-gate.against.mjs"), rows: [] };
  writeFileSync(AGAINST.file, text);
}
// --sample <n>: the first n cases only, which is how the exit-path check below runs this file as a
// child without tripling its time. A sampled run exits 3 when nothing failed, never 0, so it cannot
// stand in for the probe in a gate.
const sampleAt = process.argv.indexOf("--sample");
const SAMPLE = sampleAt === -1 ? null : Number(process.argv[sampleAt + 1]);
if (SAMPLE !== null && !(Number.isInteger(SAMPLE) && SAMPLE > 0)) {
  console.log(`✗ --sample needs a whole number of cases; got "${process.argv[sampleAt + 1] ?? ""}"`);
  process.exit(1);
}
const RUN_CASES = SAMPLE === null ? EFFECTIVE : EFFECTIVE.slice(0, SAMPLE);

let tightened = 0;
const seenReasons = new Set();
const UNPARSED = "could not parse hook input — failing to a prompt, not to silence";
// v9: the backstop's budget is a failure mode like UNPARSED, not a rule, so it has no fallback to list.
const OVER_BUDGET = "too long to read past each command word (bash-gate's work budget) — failing to a prompt, not to silence";
// v18: the gate failing while it reads is a failure mode too — and no size case may reach it.
const GATE_FAILED = "could not finish reading this command (the gate itself failed) — failing to a prompt, not to silence";
try {
  for (const c of RUN_CASES) {
    const got = await run(c.payload, { raw: c.raw === true, root: c.root });
    if (AGAINST) AGAINST.rows.push({ why: c.why, old: (await run(c.payload, { raw: c.raw === true, root: c.root, hook: AGAINST.file })).decision, now: got.decision });
    const ok = got.decision === c.want;
    if (!ok) failed++;
    if (c.overridden) tightened++;
    const why = got.reason.replace(/^bash-gate: /, "");
    if ((got.decision === "deny" || got.decision === "ask") && why !== UNPARSED && why !== OVER_BUDGET && why !== GATE_FAILED) seenReasons.add(why);
    // The override is NAMED on its own line. A project reading a green run must be able to see
    // which verdicts are its own and which are canon's, or the next reader cannot tell a policy
    // decision from a default.
    console.log(
      `${ok ? "✓" : "✗"} want ${c.want.padEnd(5)} got ${got.decision.padEnd(5)}  ${c.why}` +
        (c.overridden ? `  [tightened from ${c.overridden}]` : ""),
    );
  }
  // v9 (pleks CF-17): every shape that was superlinear in v8, at up to 500 KB, answers inside the bound.
  // v8 took 5.6 s on 50 KB of the first and crashed on 100 KB; v9 measured 112–220 ms on each at
  // 500 KB. The bound is ~10× that, so a slow machine passes and a quadratic does not. The last shape
  // stays UNDER the backstop's budget, so every later position is read against every segment.
  if (SAMPLE === null) {
    const BOUND_MS = 2_500;
    const fill = (unit) => unit.repeat(Math.ceil(500 * 1024 / unit.length));
    // v13: each string a shell is given is read again, so a heredoc nested in a heredoc is read once
    // per level — quadratic without CONSUMED_DEPTH. And a stage's stdin is what the earlier stages
    // wrote — quadratic in a pipeline's length unless a stage that runs its input empties it, a filter
    // reads it only when told to, and one told twice reads it once.
    const levels = Math.ceil(500 * 1024 / 22);
    const nested = Array.from({ length: levels }, (_, i) => `sh <<'H${i}'`).join("\n") + "\n" +
      Array.from({ length: levels }, (_, i) => `H${levels - 1 - i}`).join("\n");
    for (const [shape, command, want] of [
      ["later rm positions", fill("rm x ")],
      ["git segments", fill("git status; ")],
      ["gated words in many segments", fill("x git y; ")],
      ["later positions across many segments, within budget", "x git status; ".repeat(15_000)],
      ["v13: heredocs nested in heredocs into sh", nested],
      ["v13: a pipeline of echoes into shells", `${fill("echo x | sh | ")}sh`],
      ["v13: a pipeline of filters into a shell", `echo x | ${fill("sed s/a/b/ | ")}sh`],
      ["v13: a pipeline of filters that read their program from stdin", `echo x | ${fill("sed -f - | ")}sh`],
      ["v13: one filter told to read stdin many times", `echo ${"x ".repeat(125_000)}| sed ${"-f - ".repeat(50_000)}`],
      // v16: a file holds the pipeline's text up to its stage — a reader, read only when run, or it is quadratic.
      ["v16: a pipeline that tees a file at every stage", `echo x${fill(" | tee f.txt")}`],
      ["v16: a pipeline that redirects a file at every stage", `echo x${fill(" | cat > f.txt")}`],
      ["v16: a file written and sourced, many times", fill("echo hi > s.sh; source s.sh; ")],
      // …and every one of many files, each holding the pipeline, run: past WRITTEN_BUDGET it ASKS, never allows.
      ["v16: many files each holding a pipeline, each run", `echo x${Array.from({ length: 12_000 }, (_, k) => ` | tee f${k}`).join("")}${Array.from({ length: 12_000 }, (_, k) => `; sh f${k}`).join("")}`, "ask"],
      // v17: every quoted argument of an unknown program is read as a command.
      ["v17: many quoted arguments to an unknown program", `tool ${fill('"a b" ')}`],
      ["v17: many single words to an unknown program — not a string", `tool ${fill("a ")}`],
      // v18: a quoted pipeline or list is one string of many segments — 470 KB overflowed a spread.
      // …and past CONSUMED_SEGMENTS the second reading stops and it ASKS, never allows.
      ["v18: a quoted pipeline to an unknown program", `npx "${fill("a | ")}a"`, "ask"],
      ["v18: a quoted list to an unknown program", `npx "${fill("a; ")}a"`, "ask"],
      ["v18: many tees into a shell", `echo x | tee ${fill(">(sh) ")}`],
      // v18: the nested heredocs above asked from v13 to v17 only because the gate overflowed its stack.
      // Read in full now, so the act at their centre must be found, not merely asked about.
      ["v18: heredocs nested in heredocs, with an act at the centre", nested.replace(`\nH${levels - 1}\n`, `\nrm -rf ~\nH${levels - 1}\n`), "deny"],
      ["v17: one quoted argument nested in quoted arguments", `tool "tool \\"tool '${"a ".repeat(250_000)}'\\""`],
    ]) {
      const t = Date.now();
      const got = await run(bash(command));
      const ms = Date.now() - t;
      // v18: and never by the gate failing — that asks, but under a reason that names the wrong cause.
      const ok = got.decision !== "(no output)" && ms < BOUND_MS && (want === undefined || got.decision === want) && !got.reason.endsWith(GATE_FAILED);
      if (!ok) failed++;
      console.log(`${ok ? "✓" : "✗"} size: ${Math.round(command.length / 1024)} KB of ${shape} → ${got.decision} in ${ms} ms (bound ${BOUND_MS} ms)`);
    }
  }
  for (const [from, want, why] of ORIGIN_SELFTEST) {
    const got = originHead(from);
    if (got !== want) failed++;
    console.log(`${got === want ? "✓" : "✗"} origin/HEAD reader: want ${String(want).padEnd(5)} got ${String(got).padEnd(5)}  ${why}`);
  }
} finally {
  rmSync(FIXTURES, { recursive: true, force: true });
  if (AGAINST) rmSync(AGAINST.dir, { recursive: true, force: true });
}

// ── v7: the differential, both directions on rows written here, then the run asked for ──
for (const [label, rows, fires] of [
  ["KNOWN-GOOD: unchanged, stricter, and a declared loosening", [{ why: "a", old: "ask", now: "ask" }, { why: "b", old: "allow", now: "deny" }, { why: "d", old: "deny", now: "allow" }], false],
  ["an undeclared loosening fires — the CF-9 shape", [{ why: "x", old: "deny", now: "allow" }], true],
  ["deny to ask is looser too", [{ why: "x", old: "deny", now: "ask" }], true],
  ["a gate that gave no verdict fires, never passes", [{ why: "x", old: "(no output)", now: "deny" }], true],
]) {
  const got = differential(rows, { d: "declared here" }).findings.length > 0;
  if (got !== fires) failed++;
  console.log(`${got === fires ? "✓" : "✗"} differential: ${label}`);
}
if (AGAINST) {
  const d = differential(AGAINST.rows, DECLARED_LOOSER);
  failed += d.findings.length;
  for (const f of d.findings) console.log(`✗ against: ${f}`);
  for (const r of AGAINST.rows) {
    if (STRICTNESS[r.now] < STRICTNESS[r.old] && Object.hasOwn(DECLARED_LOOSER, r.why)) console.log(`✓ against: declared looser — "${r.why}": ${DECLARED_LOOSER[r.why]}`);
  }
  console.log(`⇄ against ${AGAINST.src}: ${AGAINST.rows.length} cases through both gates — ${d.looser} looser (${d.declared} declared), ${d.stricter} stricter`);
  if (d.looser === 0 && d.stricter === 0) {
    console.log("– against: the two gates agreed on every case. If the mechanism changed, these cases do not reach the change: add cases drawn from the diff.");
  }
} else if (SAMPLE === null) {
  // The same path through the process a gate runs (L-51). Against a predecessor that denied
  // everything, the first cases are looser and undeclared, so a child `--against` must exit 1 and
  // name them. It fails here if the run compares this gate with itself, or prints and passes.
  const dir = mkdtempSync(join(tmpdir(), "bash-gate-deny-all-"));
  const denyAll = join(dir, "deny-all.mjs");
  writeFileSync(denyAll, 'process.stdin.resume();\nprocess.stdin.on("end", () => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "planted" } })));\n');
  const child = (...args) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { encoding: "utf8" });
  const r = child("--against", denyAll, "--sample", "3");
  rmSync(dir, { recursive: true, force: true });
  const sampled = child("--sample", "1");
  for (const [label, good, got] of [
    ["--against a gate that denied everything exits 1 and names the looser cases", r.status === 1 && r.stdout.includes("✗ against: LOOSER: "), r.status],
    ["a sampled run that passes exits 3, never 0", sampled.status === 3, sampled.status],
  ]) {
    if (!good) failed++;
    console.log(`${good ? "✓" : "✗"} differential: ${label}${good ? "" : ` — got exit ${got}`}`);
  }
}

for (const [args, want] of WITNESS_SELFTEST) {
  if (witness(...args).ok !== want) {
    failed++;
    console.log(`✗ witness(${args.map((a) => JSON.stringify(a)).join(", ")}) should ${want ? "pass" : "fail"}`);
  }
}
const seen = witness(PROTECTED_BRANCH, originHead(HERE), branchConfig.PROTECTED_NOT_DEFAULT);
if (!seen.ok) failed++;
console.log(`\n${seen.line}`);

// ── v6: every rule carries its fallback (yoros CF-4) ──────────────────────────
// Both directions first, on lists written here, then the hook's own.
{
  const rule = (fallback, extra = {}) => ({ severity: "deny", owner: "canon", rule: "r", reason: "a reason", fallback, inert: false, ...extra });
  for (const [label, inv, seenHere, fires] of [
    ["KNOWN-GOOD: a twin, a reason, and an inert rule with neither", { rules: [rule({ twins: ["Bash(x *)"] }), rule({ noTwin: "a glob cannot say it" }, { reason: "b" }), rule(null, { inert: true, reason: "c" })], strays: [] }, ["a reason", "b"], false],
    ["a rule with no fallback fires — the CF-4 shape", { rules: [rule(null)], strays: [] }, [], true],
    ["a fallback with both keys fires", { rules: [rule({ twins: ["Bash(x *)"], noTwin: "and a reason" })], strays: [] }, [], true],
    ["an empty twins list fires", { rules: [rule({ twins: [] })], strays: [] }, [], true],
    ["an empty reason fires", { rules: [rule({ noTwin: "  " })], strays: [] }, [], true],
    ["a key naming no rule fires", { rules: [rule({ noTwin: "x" })], strays: ["isRenamed"] }, [], true],
    ["a reason the hook gave that no listed rule carries fires — the list is short", { rules: [rule({ noTwin: "x" })], strays: [] }, ["a reason", "unlisted"], true],
    ["no list at all fires", { hookSpecificOutput: {} }, [], true],
  ]) {
    const got = fallbackFindings(inv, seenHere).length > 0;
    if (got !== fires) failed++;
    console.log(`${got === fires ? "✓" : "✗"} fallbacks: ${label}`);
  }
  // The list the hook prints, of THIS file or of a copy with lines planted after named anchors. The
  // copy runs beside copies of this directory's files, so its imports resolve, and as `.mjs`, so it
  // is a module whatever your package.json says. Nothing is written to your tree.
  const listOf = (plants = []) => {
    let file = HOOK;
    let dir = null;
    if (plants.length > 0) {
      dir = mkdtempSync(join(tmpdir(), "bash-gate-list-"));
      for (const f of readdirSync(HERE)) if (statSync(join(HERE, f)).isFile()) copyFileSync(join(HERE, f), join(dir, f));
      let src = readFileSync(HOOK, "utf8");
      for (const [anchor, line] of plants) {
        if (!src.includes(anchor)) return { error: `the hook has no \`${anchor}\` to plant beside` };
        src = src.replace(anchor, () => `${anchor}\n${line}`);
      }
      file = join(dir, "bash-gate.planted.mjs");
      writeFileSync(file, src);
    }
    const r = spawnSync(process.execPath, [file, "--fallbacks"], { input: "", encoding: "utf8" });
    if (dir) rmSync(dir, { recursive: true, force: true });
    try {
      return JSON.parse(r.stdout);
    } catch {
      return { error: `exit ${r.status}: ${(r.stderr || r.stdout).trim().split("\n")[0]}` };
    }
  };
  // A PLANTED list, so the hook's own reading is on a probe's path: a key naming no rule, one entry
  // of each table with and without a fallback, and a configured seam, which makes its rule live.
  const planted = listOf([
    ["/* KIT:CONFIG /seams */", 'SEAM_VARS.push("PLANTED_SEAM");'],
    ["const PROJECT_DENY = [", '  [/planted-deny/, "planted deny"],'],
    ["const PROJECT_ASK = [", '  [/planted-ask/, "planted ask", { twins: ["Bash(planted *)"] }],'],
    ["const CANON_FALLBACKS = {", '  isRenamedAway: { noTwin: "planted" },'],
  ]);
  const byReason = (inv, reason) => inv.rules?.find((x) => x.reason === reason);
  const seam = (inv) => inv.rules?.find((x) => x.rule === "isSeamAssignment");
  const emptied = listOf([["/* KIT:CONFIG /seams */", "SEAM_VARS.length = 0;"]]);
  for (const [label, good] of [
    ["planted: a key naming no rule is listed as a stray", JSON.stringify(planted.strays) === '["isRenamedAway"]'],
    ["planted: a project deny with no fallback is listed, fallback null", byReason(planted, "planted deny")?.severity === "deny" && byReason(planted, "planted deny")?.fallback === null],
    ["planted: a project ask's third element is its fallback", byReason(planted, "planted ask")?.severity === "ask" && byReason(planted, "planted ask")?.fallback?.twins?.[0] === "Bash(planted *)"],
    ["planted: a configured seam makes the seam rule live", seam(planted)?.inert === false],
    ["planted: with no seams the seam rule is inert", seam(emptied)?.inert === true],
    ["planted: the planted list's findings name the missing fallback and the stray", fallbackFindings(planted, []).filter((f) => /planted deny|isRenamedAway/.test(f)).length === 2],
  ]) {
    if (!good) failed++;
    console.log(`${good ? "✓" : "✗"} fallbacks: ${label}${good ? "" : ` — got ${JSON.stringify(planted.error ?? emptied.error ?? null)}`}`);
  }
  const inv = listOf();
  const findings = fallbackFindings(inv.error ? null : inv, seenReasons);
  failed += findings.length;
  for (const f of findings) console.log(`✗ fallbacks: ${f}`);
  if (findings.length === 0) {
    const live = inv.rules.filter((x) => !x.inert);
    const twinned = live.filter((x) => x.fallback.twins).length;
    console.log(
      `✓ fallbacks: ${live.length} rule(s), each with one — ${twinned} twinned, ${live.length - twinned} with a reason; ` +
        `${inv.rules.length - live.length} inert. Every reason the cases drew (${seenReasons.size}) is a listed rule's. ` +
        "check-hook-registration fails a reason still unfilled and a twin not in settings.",
    );
  }
}

if (SAMPLE !== null) {
  console.log(`\n– SAMPLED: ${RUN_CASES.length} of ${EFFECTIVE.length} cases, which is not a probe run. ${failed} failed.`);
  process.exit(failed === 0 ? 3 : 1);
}
console.log(
  failed === 0
    ? `\n✅ bash-gate: ${EFFECTIVE.length} probes pass, both directions` +
      (tightened ? `, ${tightened} verdict(s) tightened by this project` : "") + "."
    : `\n❌ bash-gate: ${failed} of ${EFFECTIVE.length} probes FAILED.`,
);
process.exit(failed === 0 ? 0 : 1);
