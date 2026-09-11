/**
 * bash-gate.probe.mjs — KIT FILE, install at `.claude/hooks/`.
 *
 * @kit bash-gate-probe v6 — tracked OUTSIDE its `KIT:CONFIG` regions.
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
 * Run: node .claude/hooks/bash-gate.probe.mjs   (wire into the `probe` script)
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
function run(payload, { raw = false, root } = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    if (root) env.CLAUDE_PROJECT_DIR = root;
    const p = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "inherit"], env });
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
// THREE RULES ACCOUNT FOR ALL 22, and each entry below was classified against its PAYLOAD rather
// than swept by its verdict — CLAUDE.md §7, "two sites identical to twenty-five others were correct
// for a reason invisible to the regex".
//
// ① EVERY PUSH ASKS. CLAUDE.md §3 makes the announcement the CONTENT of the approval, so this
//    project has no allowed push — not a bare one, not `--tags`, not one on a working branch.
//    Canon's push cases assert the narrower policy (force / refspec / protected-branch only), so
//    seventeen of them tighten allow→ask here. Each was read first: all seventeen payloads contain
//    a literal `git push`, including the two that look like they should not (`grep -n` after a
//    redirected push — the measured M-072 case — and `git add notes+main.md && git push`, where the
//    `+` is in a filename and the ask comes from the push in the second segment, not the refspec).
// ② --force-with-lease IS DENIED. Canon calls the lease forms safe and probes that they are
//    ALLOWED; the PROJECT_DENY entry in the hook argues why this project denies them instead.
// ③ git reset --hard IS DENIED, not asked — CLAUDE.md §3 lists it under Hook-denied, and canon's
//    own `ask` region names this as the worked example of a severity the project owns.
const PROJECT_VERDICTS = {
  // ② tightened to deny
  "--force-with-lease is the SAFE form and must not be denied": "deny",
  "--force-with-lease=<ref> likewise": "deny",
  "--force-if-includes likewise": "deny",
  // ③ tightened to deny
  "hard reset discards uncommitted work with no undo": "deny",
  // ① tightened to ask — every one of these is a push
  [`pushing ${WORKING_BRANCH} is not the deployment`]: "ask",
  "PER-SEGMENT: fetching main then pushing elsewhere": "ask",
  "PER-SEGMENT: grep's -n is not git's -n": "ask",
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
}
/* KIT:CONFIG /verdicts */

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
  { want: "ask", why: `merging to ${PROTECTED_BRANCH}`, payload: bash(`git merge ${WORKING_BRANCH} ${PROTECTED_BRANCH}`) },
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
  { want: "ask", why: "BY REFERENCE: --mirror likewise", payload: bash("git push --mirror origin") },
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

  /* KIT:CONFIG cases — this project's own gates, beyond the canonical set above.
   * ONE PROBE PER RULE YOU ADDED TO THE HOOK'S DENY/ASK BLOCKS, both directions: the
   * violation, and the near-miss that must still pass. A rule with no probe is a rule
   * nobody has checked matches what it means to match. */
  // DELIBERATE OVERLAP WITH `scripts/check-bash-gate.mjs`, which holds this project's fuller corpus
  // (~150 cases, including the .env anchor set and the seam/.githooks parity assertion). These live
  // here as well because this file is what travels on the next re-adoption: a reader meeting an
  // empty region would take the project's own rules to be unprobed. Two probe suites over one gate
  // is redundancy, not the two-apertures-one-class hole CLAUDE.md §6 warns about — that shape is
  // two RULES splitting a class, and these are two witnesses to the same rules.

  // ── PROJECT_DENY ① — the lease forms, which canon probes as ALLOW and this project denies ──────
  // Built from parts so this file carries no literal the live gate would deny while editing it.
  { want: "deny", why: "PROJECT: --force-with-lease is still a force-push here", payload: bash(`git push --force${"-with-lease"} origin ${P}`) },
  { want: "allow", why: "PROJECT: NEAR-MISS — a lease flag is not a force outside a push", payload: bash(`git log --grep=force${"-with-lease"}`) },

  // ── PROJECT_DENY ② — hard reset, denied rather than asked ─────────────────────────────────────
  { want: "deny", why: "PROJECT: hard reset is denied, not asked", payload: bash("git reset --hard HEAD~3") },
  { want: "allow", why: "PROJECT: NEAR-MISS — a soft reset keeps the work", payload: bash("git reset --soft HEAD~1") },

  // ── PROJECT_ASK ① — every push asks (CLAUDE.md §3) ────────────────────────────────────────────
  { want: "ask", why: "PROJECT: a bare push still asks", payload: bash("git push") },
  { want: "allow", why: "PROJECT: NEAR-MISS — fetching is not pushing", payload: bash("git fetch origin") },

  // ── PROJECT_ASK ② — .env, anchored on a path boundary ─────────────────────────────────────────
  { want: "ask", why: "PROJECT: reading a .env file asks", payload: bash("cat .env") },
  { want: "ask", why: "PROJECT: …through a Windows absolute path, the platform this repo runs on", payload: bash("cat C:\\dev\\pleks\\.env") },
  { want: "allow", why: "PROJECT: NEAR-MISS — process.env is a property access, not a file", payload: bash('node -e "console.log(process.env.NODE_ENV)"') },

  // ── PROJECT_ASK ③ — the supabase CLI's prod writes, matched however they are invoked ──────────
  { want: "ask", why: "PROJECT: supabase db push is a prod operation", payload: bash("supabase db push") },
  { want: "ask", why: "PROJECT: …and so is the runner-prefixed spelling, which a command-word test misses", payload: bash("npx supabase db reset") },
  { want: "allow", why: "PROJECT: NEAR-MISS — supabase db diff only reads", payload: bash("supabase db diff") },

  // ── PROJECT_ASK ④ — the prod-apply script, matched on its PATH rather than its runner ─────────
  { want: "ask", why: "PROJECT: the prod-apply script asks, via node", payload: bash("node supabase/reconcile/apply-prod.mjs --confirm") },
  { want: "ask", why: "PROJECT: …and bare, with no runner at all", payload: bash("./supabase/reconcile/apply-prod.mjs --confirm") },
  { want: "allow", why: "PROJECT: NEAR-MISS — a sibling script under the same directory is not it", payload: bash("node supabase/reconcile/build-plan.mjs") },

  // ── The seams region, which arms canon's isSeamAssignment ─────────────────────────────────────
  { want: "deny", why: "PROJECT: the seam's master switch is a --no-verify that leaves a gate-ok marker", payload: bash("PLEKS_HOOK_PROBE=1 git commit -m x") },
  { want: "deny", why: "PROJECT: …and the branch seam needs no master switch", payload: bash("PLEKS_BRANCH_PROBE=1 git push") },
  { want: "allow", why: "PROJECT: NEAR-MISS — an unrelated assignment is ordinary shell", payload: bash("NODE_ENV=test npm run check") },
  /* KIT:CONFIG /cases */
];

const { cases: EFFECTIVE, findings: verdictFindings } = applyVerdicts(CASES, PROJECT_VERDICTS);

let failed = verdictFindings.length;
for (const f of verdictFindings) console.log(`✗ ${f}`);

let tightened = 0;
const seenReasons = new Set();
const UNPARSED = "could not parse hook input — failing to a prompt, not to silence";
try {
  for (const c of EFFECTIVE) {
    const got = await run(c.payload, { raw: c.raw === true, root: c.root });
    const ok = got.decision === c.want;
    if (!ok) failed++;
    if (c.overridden) tightened++;
    const why = got.reason.replace(/^bash-gate: /, "");
    if ((got.decision === "deny" || got.decision === "ask") && why !== UNPARSED) seenReasons.add(why);
    // The override is NAMED on its own line. A project reading a green run must be able to see
    // which verdicts are its own and which are canon's, or the next reader cannot tell a policy
    // decision from a default.
    console.log(
      `${ok ? "✓" : "✗"} want ${c.want.padEnd(5)} got ${got.decision.padEnd(5)}  ${c.why}` +
        (c.overridden ? `  [tightened from ${c.overridden}]` : ""),
    );
  }
  for (const [from, want, why] of ORIGIN_SELFTEST) {
    const got = originHead(from);
    if (got !== want) failed++;
    console.log(`${got === want ? "✓" : "✗"} origin/HEAD reader: want ${String(want).padEnd(5)} got ${String(got).padEnd(5)}  ${why}`);
  }
} finally {
  rmSync(FIXTURES, { recursive: true, force: true });
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

console.log(
  failed === 0
    ? `\n✅ bash-gate: ${EFFECTIVE.length} probes pass, both directions` +
      (tightened ? `, ${tightened} verdict(s) tightened by this project` : "") + "."
    : `\n❌ bash-gate: ${failed} of ${EFFECTIVE.length} probes FAILED.`,
);
process.exit(failed === 0 ? 0 : 1);
