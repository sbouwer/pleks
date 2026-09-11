/**
 * agent-write-scope.js — KIT FILE, install at `.claude/hooks/`.
 *
 * @kit agent-write-scope v5 — tracked OUTSIDE its `KIT:CONFIG` regions. The scope map is
 * yours; the gate logic is canon's, and `check-kit-drift.mjs` reconciles it.
 *
 * A PreToolUse gate with THREE remits: it bounds what a subagent may WRITE, denies a subagent the
 * ability to CREATE A COMMIT, and decides which agent types may SPAWN another agent.
 *
 * ⚠ THE WRITE FENCE IS SOUND ONLY FOR WRITES A TOOL CALL NAMES. Write, Edit and NotebookEdit name
 * their path in a field. A Bash command names its targets in its text, and since v5 those are read
 * and held to the same scope — but an interpreter, a script, `find -delete` and git's tree-writing
 * subcommands write files their text never names. See "v5: WHAT A BASH COMMAND WRITES" below for
 * the full list. A CLAUDE.md that tags this rule as enforced should say which half it means.
 *
 * ── v2: THE WRITE MANIFEST, WHICH CLOSES THE ONE HOLE v1 DOCUMENTED ────────────────────────────
 *
 * v1's scope table could express "this agent writes only here" and could not express "this agent
 * writes anywhere" with any bound on it — so the implementer, whose whole remit IS editing source,
 * got `null` and no fence. v1 said so plainly rather than hiding it, and every project adopting it
 * inherited a rule split across a hook and a paragraph of prose.
 *
 * A path list could never close that, because the in-scope set is different every run. What varies
 * per run has to be DECLARED per run, so the caller now writes `.handoff/write-manifest.json`
 * naming the paths before it spawns, and this hook reads it. Both halves it needs were already in
 * the payload — `agent_type` and `cwd` — which is why v1 could name the mechanism it was missing.
 *
 * IT ASKS WHEN THE MANIFEST IS ABSENT, AND NEVER DENIES. That is the whole difference between a
 * control that gets used and one that gets removed: an ad-hoc implementer spawn is legitimate, and
 * a gate that stalled it outright would be switched off within a week by whoever needed to work.
 * The prompt is the nudge; the refusal text carries a ready-to-paste manifest so complying is one
 * step rather than a documentation hunt.
 *
 * FRESHNESS IS THE FILE'S OWN mtime, not a field in it. A `written` timestamp is a second thing to
 * get right and a second thing to forget, and a manifest copied between checkouts would carry it
 * intact. mtime cannot be stale-by-copy. **The manifest must therefore not be committed** — a fresh
 * clone would set every mtime to the clone time and hand a new session yesterday's scope. Ignore
 * `.handoff/` or the manifest specifically.
 *
 * A STALE MANIFEST IS TREATED AS AN ABSENT ONE — it asks, it does not enforce. The failure worth
 * designing against is not a forgotten manifest denying too much; it is yesterday's manifest
 * silently ALLOWING today's writes because it happens to name a directory today's task also
 * touches. Expiring into "ask" makes the stale case visible instead of permissive.
 *
 * WHY IT EXISTS AT ALL, and it is the sharpest thing in this kit. E8
 * (`playbooks/4-AGENT-PIPELINES.md` §8) measured that `tools:` frontmatter is a **GRANT, not a
 * fence**: the harness appends `Write`/`Edit` to every custom spine regardless of what the
 * frontmatter lists. So a project whose spines all say "report-only" in prose, and whose CLAUDE.md
 * carries an Access column, has NO CONTROL — it has a description. Prose is not a mechanism, and
 * this is the file that makes the table true.
 *
 * The same demolition applies to spawning. *"No spine lists `Agent`, therefore none can spawn"*
 * rested on exactly the mechanism E8 disproved, so spawn permission is gated here too, and the
 * platform's `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is pinned in settings alongside it.
 *
 * E7 measured the field it all turns on: PreToolUse stdin carries `agent_type` and `agent_id` on a
 * subagent call and carries NEITHER in the main session — verified with a control either side, so
 * absence is a real signal rather than a field the hook never sees. **RE-MEASURE ON ANY CLI MAJOR
 * UPGRADE.** The probes synthesise their own payload, so they prove this file's LOGIC and can never
 * prove the harness still sends the field. Measure it the only way an agent can: spawn one real
 * agent at a planted out-of-scope write and read the refusal back. A refusal carrying this hook's
 * caller-specific wording is behavioural proof it read `agent_type` and matched it.
 *
 * THE COMMIT DENIAL covers the commit-creating family plus `push`, and deliberately NOT "git
 * writes" — an agent legitimately runs `git log`, `git show`, `git diff`, `git status`, and denying
 * those breaks every spine in the directory. Agents end at a REPORT; the caller commits.
 *
 * ⚠ PORTING NOTE, and it has bitten. If the reference you copy from opens with
 * `require("node:path")` and your package is `"type": "module"`, a `.js` file under it is ESM and
 * `require` is not defined — an instant crash. This kit file uses `import`. If YOUR project is
 * CommonJS, convert it; do not assume either way.
 *
 * FAIL-CLOSED DIRECTION: an unparseable payload ASKS rather than allows. A gate that stalls is
 * recoverable; one that waves writes through is not. Note the explicit non-object rejection below —
 * `JSON.parse` accepts a bare string, and reading `tool_input` off one yields `undefined` and a
 * silent allow. That hole has shipped green before, behind a probe that could not fire.
 */
// @event PreToolUse
// @matcher Write|Edit|MultiEdit|NotebookEdit|Bash|Agent
// @no-twin A settings.json permission rule has no agent dimension — `Write(...)` cannot say "only
// when the caller is a subagent", so a twin would either be dormant and useless or would gate the
// main session's every edit. The probe suite in agent-write-scope.probe.mjs is the backstop: if
// this hook is deleted or stops matching, `npm run check` goes red.
import path from "node:path";
import fs from "node:fs";

/**
 * THE SCOPE TABLE LIVES IN ITS OWN FILE, and did not until 2026-09-09.
 *
 * It used to sit here inside a `KIT:CONFIG scopes` region headed "THE ONE BLOCK YOU MUST EDIT",
 * while `agent-write-scope.probe.mjs` hard-coded the same table as its reference — so editing the
 * block failed roughly 25 of 51 probes. The probe could not read the table out of this file: a hook
 * consumes stdin at top level, exports nothing, and cannot be imported. Moving the table to a
 * module both can import is what let the probe DERIVE its cases from the project's own table
 * instead of asserting canon's defaults (M-KIT-06).
 *
 * Relative to this file, never to the cwd (KIT-MODES R-2): a hook resolving its own config against
 * whatever directory it was started from is a hook that reads a different table depending on who
 * ran it. This one can only ever read the file beside it, and moving either breaks it loudly.
 */
import { SCOPES, SPAWNERS } from "./agent-write-scope.config.mjs";

/**
 * Commit-creating git subcommands, plus `push`. Each either writes a commit object or publishes
 * one, and none is recoverable by the caller simply re-running the step.
 *
 * `cherry-pick`, `revert` and `am` are here because they create commits by a side door; leaving
 * them out is the cheapest way for this rule to be defeated by accident rather than intent.
 */
const GIT_COMMIT_FAMILY = "commit|merge|rebase|cherry-pick|revert|am|push";
const GIT_WORD = /\bgit\b/;
const DENIED_SUBCOMMAND = new RegExp(String.raw`(?:^|\s)(${GIT_COMMIT_FAMILY})(?![\w-])`);

/**
 * Returns the denied subcommand in `command`, or null.
 *
 * DELIBERATELY NOT A GIT GRAMMAR PARSER. Matching `git <flags>* <subcommand>` is defeated by
 * `git -C /repo commit`, because `-C` takes a value and the value is not a flag; chasing that leads
 * to enumerating every global option that takes an argument and being wrong on the next one. So:
 * find `git`, then look for a denied subcommand as a standalone token anywhere after it. An unusual
 * invocation cannot slip past a test that does not depend on the invocation's shape.
 *
 * The trailing guard is `(?![\w-])`, NOT `\b` — a hyphen IS a word boundary, so `\b` after `merge`
 * matches inside `git merge-base`, which is ordinary read-only ancestry work.
 *
 * KNOWN FALSE-DENY, accepted: a command that merely mentions both words — `rg "git commit" brief/`
 * — is denied. That is the correct direction to be wrong in. The agent is told what to do instead
 * and can rephrase; a false-allow puts a commit the caller never reviewed onto the working branch.
 */
function deniedGitSubcommand(command) {
  const g = GIT_WORD.exec(command);
  if (!g) return null;
  const sub = DENIED_SUBCOMMAND.exec(command.slice(g.index + g[0].length));
  return sub ? sub[1] : null;
}

/**
 * Where the caller declares an unrestricted agent's scope for ONE run, and how long it counts for.
 *
 * `.handoff/` because that is the directory every spine already writes into, so the manifest sits
 * beside the artefacts of the run it describes rather than inventing a location. One well-known
 * filename rather than the `<task-slug>/manifest.json` the sketch proposed: a subagent's PROMPT is
 * not in this hook's stdin, so there is no slug here to resolve, and a scheme the gate cannot
 * evaluate is a scheme that does not exist.
 *
 * TWO HOURS. Long enough that a real sweep never expires mid-run — the cost of that is a stalled
 * agent and a confused caller — and short enough that yesterday's manifest cannot quietly authorise
 * today's task. It is a bound on ACCIDENT, not on an adversary: the caller writing this file is the
 * trusted main session, and anything able to forge it could edit the hook instead.
 */
const MANIFEST = ".handoff/write-manifest.json";
const MANIFEST_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * The manifest's state, never a decision — the caller below turns state into a verdict.
 *
 * EVERY FAILURE COLLAPSES TO ONE OF TWO STATES, deliberately. Absent, unparseable, wrong shape,
 * empty list and wrong agent are all "no usable declaration for this run", and all of them ask.
 * Distinguishing them in the RETURN would invite the branch that handles one of them differently,
 * and the only sane different handling is denying — which is the direction that gets the hook
 * switched off. They are distinguished only in the REASON STRING, where being specific costs
 * nothing and saves the caller a guess.
 */
function readManifest(cwd, agentType) {
  const at = path.resolve(cwd, MANIFEST);
  let stat;
  try {
    stat = fs.statSync(at);
  } catch {
    return { ok: false, why: `no ${MANIFEST}` };
  }
  // mtime, not a field. See the header: a `written` value survives a copy and a clone; this does
  // not. `Date.now()` on a clock behind the file's mtime yields a negative age, which is fresh —
  // the right direction, since a skewed clock must not start denying writes.
  if (Date.now() - stat.mtimeMs > MANIFEST_TTL_MS) {
    const hours = ((Date.now() - stat.mtimeMs) / 3_600_000).toFixed(1);
    return { ok: false, why: `${MANIFEST} is ${hours}h old and manifests expire after 2h` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(at, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, why: `${MANIFEST} is not readable JSON` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, why: `${MANIFEST} is not an object` };
  }
  // The agent field is required rather than optional-and-assumed. Two unrestricted agents in one
  // project is a table nobody has written yet, and a manifest that silently scoped whichever one
  // ran next would be the bug that table introduces.
  if (parsed.agent !== agentType) {
    return { ok: false, why: `${MANIFEST} scopes "${parsed.agent}", not ${agentType}` };
  }
  const paths = Array.isArray(parsed.paths) ? parsed.paths.filter((p) => typeof p === "string") : [];
  if (paths.length === 0) {
    return { ok: false, why: `${MANIFEST} declares no paths` };
  }
  return { ok: true, paths };
}

/** Resolve a tool's target path, whatever that tool calls the field. */
function targetPath(toolInput) {
  if (!toolInput) return null;
  return toolInput.file_path || toolInput.notebook_path || toolInput.path || null;
}

/** True when `file` sits inside `root`. `..` cannot escape, and Windows separators are normalised. */
function contains(root, file) {
  const rel = path.relative(root, file);
  if (rel === "") return true;
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * The verdict on one write by a subagent, whichever tool makes it: `{ decision, reason }`.
 * The Write/Edit branch returns it as it is; the Bash branch reads the same verdict per target.
 */
function scopeVerdict(agentType, cwd, raw) {
  if (!(agentType in SCOPES)) {
    return { decision: "ask", reason: `agent-write-scope: "${agentType}" has no declared write scope — approve deliberately, or add one to SCOPES` };
  }
  const allowed = SCOPES[agentType];
  const file = path.resolve(cwd, raw);
  if (allowed === null) {
    // `null` is now "bounded by the manifest", not "ungated". The agent's OWN artefact
    // directory is always in scope and is never named in a manifest: every spine writes a
    // handoff artefact, so requiring it to be declared would mean every manifest carrying one
    // identical line, and a line that is always the same is a line that will be forgotten.
    if (contains(path.resolve(cwd, ".handoff"), file)) {
      // FIRST, and before the manifest is even consulted. Every spine writes a handoff
      // artefact, so this is the one write that is in scope by definition — gating it on a
      // declaration would mean a run could be stopped from REPORTING what it did, which is
      // the opposite of what any of this is for.
      return { decision: "allow", reason: `agent-write-scope: ${agentType} writing its own artefact, which is always in scope` };
    }
    const m = readManifest(cwd, agentType);
    if (!m.ok) {
      return {
        decision: "ask",
        reason:
          `agent-write-scope: ${agentType} writes without a declared scope — ${m.why}. ` +
          `Approve this write deliberately, or bound the run first by writing ${MANIFEST}: ` +
          `{"agent":"${agentType}","paths":["${path.dirname(raw).replace(/\\/g, "/")}/"]}. ` +
          `It expires in 2h and must not be committed.`,
      };
    }
    if (m.paths.map((r) => path.resolve(cwd, r)).some((root) => contains(root, file))) {
      return { decision: "allow", reason: `agent-write-scope: ${agentType} writing inside the scope declared for this run` };
    }
    return {
      decision: "deny",
      reason:
        `agent-write-scope: this run scoped ${agentType} to ${m.paths.join(", ")} — ` +
        `"${raw}" is outside it. If the task genuinely needs that file, the CALLER widens ` +
        `${MANIFEST} and says why; an agent widening its own scope is the thing this stops.`,
    };
  }
  if (allowed.length === 0) {
    return {
      decision: "deny",
      reason:
        `agent-write-scope: ${agentType} writes no files at all — its spine has it EMIT a JSON ` +
        `object as its return message, which a wrapper merges. "${raw}" is a file it has no ` +
        `remit to open. Return the finding instead.`,
    };
  }
  if (!allowed.map((r) => path.resolve(cwd, r)).some((root) => contains(root, file))) {
    return {
      decision: "deny",
      reason:
        `agent-write-scope: ${agentType} may only write to ${allowed.join(", ")} — ` +
        `"${raw}" is outside it. Artefacts go to .handoff/<task-slug>/; report findings to ` +
        `the caller instead of editing the tree.`,
    };
  }
  return { decision: "allow", reason: `agent-write-scope: ${agentType} writing inside its scope` };
}

/* ── v5: WHAT A BASH COMMAND WRITES ──────────────────────────────────────────────────────────
 *
 * Until v5 the Bash branch read only whether a command commits, so a report-only agent denied
 * `Write lib/site.ts` could run `echo x > lib/site.ts` and be allowed (yoros CF-6). E8 is why the
 * fence exists — `tools:` is a grant, not a fence — and the same reasoning says Bash cannot be
 * withheld from a spine that runs a test, so the fence covered two of the three ways of writing.
 * That is L-48's shape: a control on one access path, assuming it is the only one.
 *
 * So the Bash branch now reads the files a command's TEXT says it writes, and holds each to the
 * same scope as a Write:
 *   redirections      `>` `>>` `>|` `&>` `&>>` `<>`, with or without an fd number
 *   tee               every file operand
 *   sed -i            every file operand (`-i.bak`, `--in-place`, `-ni` all count)
 *   cp mv ln install  the destination: `-t DIR`, `--target-directory=DIR`, or the last operand
 *   rm rmdir touch mkdir truncate   every operand
 *   dd                `of=`
 * and it reads the commands inside `$(…)`, backticks, `<(…)`/`>(…)`, `bash -c '…'` and `sh -c '…'`,
 * and follows `cd` so a relative target lands where the shell would put it.
 *
 * IT ASKS, IT NEVER DENIES. A Write names its path in a field; a Bash write is read out of shell
 * text, and a reading can be wrong. A false deny stalls an agent with no way to comply, which is the
 * direction that gets a gate switched off. An ask is the visible version of the same doubt.
 *
 * A TARGET IT CANNOT RESOLVE ASKS (L-57: unknown asks). `> "$OUT"`, `> ~/x`, a glob, a relative
 * target after a `cd` it could not follow, `sed -i` with no file in the command, one of the writers
 * above handed its files by `xargs` or `find -exec`, and `find -delete` are all decided when the
 * command runs, not readable from its text.
 *
 * WHAT IT CANNOT SEE, stated so an adopter's CLAUDE.md can split the rule rather than tag all of it
 * as enforced. The fence is sound only for writes a command's text NAMES. Unfenced:
 *   · an interpreter or a script — `node -e`, `python -c`, `perl -i`, `node scripts/x.mjs`, `npm run`
 *   · git's tree-writing subcommands — `checkout`, `restore`, `stash`, `apply`
 *   · a command named through a variable (`$EDITOR f`), and `eval`
 *   · any writer not in the list above
 * Those writes are held by the caller reading `git status` after the run, as before v5.
 */
const NULL_DEVICES = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "/dev/tty", "nul", "NUL"]);

/** Commands whose operands (or destination) are files they write. `sed` writes only with `-i`. */
const WRITERS = new Set(["tee", "sed", "cp", "mv", "ln", "install", "rm", "rmdir", "touch", "mkdir", "truncate", "dd"]);

/** Index just past the `"` that closes a double-quoted span starting at `from`, or -1. */
function closeDouble(src, from) {
  let i = from;
  while (i < src.length) {
    if (src[i] === "\\") i += 2;
    else if (src[i] === '"') return i + 1;
    else i += 1;
  }
  return -1;
}

/** Index just past the `)` closing a group whose `(` sits just before `from`, or -1. */
function closeParen(src, from) {
  let depth = 1;
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = c === "'" ? src.indexOf("'", i + 1) + 1 : closeDouble(src, i + 1);
      if (j <= 0) return -1;
      i = j;
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")") depth -= 1;
    if (depth === 0) return i + 1;
    i += 1;
  }
  return -1;
}

/** Skip the bodies of the heredocs opened on the line just ended; returns where commands resume. */
function skipHeredocs(src, from, heredocs) {
  let at = from;
  while (heredocs.length > 0) {
    const h = heredocs.shift();
    while (at < src.length) {
      const nl = src.indexOf("\n", at);
      const end = nl === -1 ? src.length : nl;
      const line = src.slice(at, end).replace(/\r$/, "");
      at = end + 1;
      if ((h.strip ? line.replace(/^\t+/, "") : line) === h.delim) break;
    }
  }
  return Math.min(at, src.length);
}

/**
 * Read shell text into simple commands: `{ words, writes }`, each word `{ text, literal }`.
 *
 * `literal` is false wherever the shell would expand something — a `$`, a backtick, a glob, a
 * leading `~`, a brace — because the file such a word names is decided at run time. Quotes are
 * removed, so `'a > b'` is one word and not a redirection. Heredoc bodies are data and are skipped.
 * Commands inside substitutions are returned as commands of their own. Returns null when the text
 * does not parse — an unterminated quote or group — which the shell would refuse too.
 */
function readBash(src) {
  const commands = [];
  let cmd = { words: [], writes: [] };
  let word = null;
  let pending = null;
  const heredocs = [];
  const open = () => {
    if (word === null) word = { text: "", literal: true };
  };
  const endWord = () => {
    if (word === null) return;
    if (pending === null) cmd.words.push(word);
    else if (pending.kind === "write") cmd.writes.push(word);
    else if (pending.kind === "dup-or-write" && !/^(\d+|-)$/.test(word.text)) cmd.writes.push(word);
    else if (pending.kind === "heredoc") heredocs.push({ delim: word.text, strip: pending.strip });
    pending = null;
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (cmd.words.length > 0 || cmd.writes.length > 0) commands.push(cmd);
    cmd = { words: [], writes: [] };
  };
  const nested = (text) => {
    const inner = readBash(text);
    if (inner === null) return false;
    commands.push(...inner);
    return true;
  };
  // Double-quoted text: `$` and backticks still expand inside it, and a substitution is still run.
  const double = (text) => {
    let k = 0;
    while (k < text.length) {
      const c = text[k];
      if (c === "\\" && k + 1 < text.length && '$`"\\\n'.includes(text[k + 1])) {
        word.text += text[k + 1];
        k += 2;
      } else if (c === "$" && text[k + 1] === "(" && text[k + 2] !== "(") {
        const j = closeParen(text, k + 2);
        if (j < 0 || !nested(text.slice(k + 2, j - 1))) return false;
        word.literal = false;
        word.text += text.slice(k, j);
        k = j;
      } else if (c === "`") {
        const j = text.indexOf("`", k + 1);
        if (j < 0 || !nested(text.slice(k + 1, j))) return false;
        word.literal = false;
        word.text += text.slice(k, j + 1);
        k = j + 1;
      } else {
        if (c === "$") word.literal = false;
        word.text += c;
        k += 1;
      }
    }
    return true;
  };

  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "\n") {
      endCommand();
      i = skipHeredocs(src, i + 1, heredocs);
    } else if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i += 1;
    } else if (c === "#" && word === null) {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
    } else if (c === "\\") {
      if (next !== "\n") {
        open();
        word.text += next ?? "";
      }
      i += 2;
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) return null;
      open();
      word.text += src.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      const j = closeDouble(src, i + 1);
      if (j < 0) return null;
      open();
      if (!double(src.slice(i + 1, j - 1))) return null;
      i = j;
    } else if (c === "$" && next === "(") {
      // `$((…))` is arithmetic — its `>` is a comparison, never a redirection — so it is skipped.
      const arithmetic = src[i + 2] === "(";
      const j = closeParen(src, i + 2);
      if (j < 0 || (!arithmetic && !nested(src.slice(i + 2, j - 1)))) return null;
      open();
      word.literal = false;
      word.text += src.slice(i, j);
      i = j;
    } else if (c === "`") {
      const j = src.indexOf("`", i + 1);
      if (j < 0 || !nested(src.slice(i + 1, j))) return null;
      open();
      word.literal = false;
      word.text += src.slice(i, j + 1);
      i = j + 1;
    } else if ((c === "<" || c === ">") && next === "(" && word === null) {
      // Process substitution: the commands inside are read; the word itself names a pipe.
      const j = closeParen(src, i + 2);
      if (j < 0 || !nested(src.slice(i + 2, j - 1))) return null;
      open();
      word.pipe = true;
      i = j;
    } else if (c === "<" || c === ">" || (c === "&" && next === ">")) {
      if (word !== null && word.literal && /^\d+$/.test(word.text) && c !== "&") word = null;
      else endWord();
      const ops = [
        ["&>>", "write"], ["&>", "write"], [">>", "write"], [">|", "write"], [">&", "dup-or-write"], [">", "write"],
        ["<<<", "read"], ["<<-", "heredoc"], ["<<", "heredoc"], ["<>", "write"], ["<&", "read"], ["<", "read"],
      ];
      const [op, kind] = ops.find(([o]) => src.startsWith(o, i));
      pending = { kind, strip: op === "<<-" };
      i += op.length;
    } else if (c === ";" || c === "|" || c === "&" || c === "(" || c === ")") {
      endCommand();
      i += 1;
    } else if ((c === "{" || c === "}") && word === null && (next === undefined || /\s/.test(next))) {
      i += 1;
    } else {
      open();
      if ("*?[{}".includes(c) || (c === "~" && word.text === "") || c === "$") word.literal = false;
      word.text += c;
      i += 1;
    }
  }
  endCommand();
  return commands;
}

/** Operands of a command: words that are not options, honouring `--`; `valued` options eat the next word. */
function operands(args, valued = new Set()) {
  const out = [];
  let opts = true;
  let n = 0;
  while (n < args.length) {
    const t = args[n].text;
    n += 1;
    if (opts && t === "--") opts = false;
    else if (opts && t.length > 1 && t.startsWith("-")) {
      if (valued.has(t)) n += 1;
    } else out.push(args[n - 1]);
  }
  return out;
}

/** `sed`'s in-place targets, or null when the command is not an in-place edit. */
function sedTargets(args) {
  let inPlace = false;
  let scripted = false;
  const ops = [];
  let n = 0;
  while (n < args.length) {
    const t = args[n].text;
    n += 1;
    if (t.startsWith("--")) {
      if (/^--in-place(=|$)/.test(t)) inPlace = true;
      if (/^--(expression|file)(=|$)/.test(t)) scripted = true;
      if (/^--(expression|file)$/.test(t)) n += 1;
    } else if (t.length > 1 && t.startsWith("-")) {
      // A short cluster: `-i` ends it (the rest is a backup suffix); `-e`/`-f`/`-l` take the rest
      // of the cluster, or the next word when they end it.
      const flags = t.slice(1);
      const at = flags.search(/[iefl]/);
      if (at !== -1) {
        const f = flags[at];
        if (f === "i") inPlace = true;
        if (f === "e" || f === "f") scripted = true;
        if (f !== "i" && at === flags.length - 1) n += 1;
      }
    } else ops.push(args[n - 1]);
  }
  if (!inPlace) return null;
  return scripted ? ops : ops.slice(1);
}

/**
 * What one simple command writes, beyond its redirections:
 * `{ targets, blind, cd, script }` — `blind` names an in-place edit whose files are not in the
 * text, `cd` is the directory a `cd` moves to (null when it cannot be followed), and `script` is
 * the text a `bash -c` runs.
 */
function commandWrites(words) {
  let k = 0;
  while (k < words.length) {
    const t = words[k].text;
    if (/^[A-Za-z_]\w*=/.test(t)) k += 1;
    else if (["sudo", "env", "command", "builtin", "exec", "nice", "nohup", "time", "if", "then", "else", "elif", "while", "until", "do", "!"].includes(t)) k += 1;
    else if (t === "timeout") k += 2;
    else break;
  }
  const head = words[k];
  if (head === undefined || !head.literal) return { targets: [] };
  const name = head.text.split(/[\\/]/).pop();
  const args = words.slice(k + 1);
  // A writer handed its files by xargs or find names none of them in the text, so what it writes is
  // decided at run time. That is an unreadable target, and an unreadable target asks.
  const fed = (inner, via) => {
    const n = inner[0]?.text.split(/[\\/]/).pop();
    return WRITERS.has(n) ? { targets: [], blind: `${n} under ${via} writes files the command's text does not name` } : { targets: [] };
  };
  switch (name) {
    case "xargs":
      return fed(operands(args, new Set(["-I", "-n", "-P", "-L", "-d", "-E", "-s", "-a"])), "xargs");
    case "find": {
      if (args.some((a) => a.text === "-delete")) return { targets: [], blind: "find -delete removes files the command's text does not name" };
      const exec = args.findIndex((a) => ["-exec", "-execdir", "-ok", "-okdir"].includes(a.text));
      return exec === -1 ? { targets: [] } : fed(args.slice(exec + 1), `find ${args[exec].text}`);
    }
    case "cd":
    case "pushd": {
      const to = operands(args)[0];
      return { targets: [], cd: to !== undefined && to.text !== "-" ? to : null };
    }
    case "popd":
      return { targets: [], cd: null };
    case "bash":
    case "sh":
    case "zsh":
    case "dash": {
      const c = args.findIndex((a) => /^-[a-z]*c$/.test(a.text));
      const script = c === -1 ? undefined : args[c + 1];
      return { targets: [], script: script?.literal ? script.text : undefined };
    }
    case "tee":
      return { targets: operands(args, new Set(["--output-error"])).filter((w) => w.text !== "-") };
    case "sed": {
      const files = sedTargets(args);
      if (files === null) return { targets: [] };
      if (files.length === 0) return { targets: [], blind: "sed -i names no file (its list comes from somewhere the text does not show)" };
      return { targets: files };
    }
    case "cp":
    case "mv":
    case "ln":
    case "install": {
      const flag = args.findIndex((a) => a.text === "-t");
      if (flag !== -1 && args[flag + 1]) return { targets: [args[flag + 1]] };
      const long = args.find((a) => a.text.startsWith("--target-directory="));
      if (long) return { targets: [{ ...long, text: long.text.slice("--target-directory=".length) }] };
      const ops = operands(args, new Set(["-S", "--suffix", "-m", "--mode", "-o", "--owner", "-g", "--group"]));
      if (name === "install" && args.some((a) => a.text === "-d")) return { targets: ops };
      return { targets: ops.length >= 2 ? [ops.at(-1)] : [] };
    }
    case "rm":
    case "rmdir":
    case "touch":
    case "mkdir":
    case "truncate":
      return { targets: operands(args, new Set(["-s", "--size", "-r", "--reference", "-d", "--date", "-t", "-m", "--mode"])) };
    case "dd":
      return { targets: args.filter((a) => a.text.startsWith("of=")).map((a) => ({ ...a, text: a.text.slice(3) })) };
    default:
      return { targets: [] };
  }
}

/** Where a target word lands: `{ raw, file }`, `{ raw, file: null, why }` when unreadable, or null to ignore. */
function place(word, dir) {
  if (word.pipe) return null;
  if (!word.literal) return { raw: word.text, file: null, why: "decided when the command runs, not readable from its text" };
  if (NULL_DEVICES.has(word.text) || /^\/dev\/fd\/\d+$/.test(word.text)) return null;
  // Git Bash writes `C:\x` as `/c/x`; read as a path on win32, that would be `C:\c\x`.
  const t = process.platform === "win32" ? word.text.replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:") : word.text;
  if (path.isAbsolute(t)) return { raw: word.text, file: path.resolve(t) };
  if (dir === null) return { raw: word.text, file: null, why: "relative to a directory a `cd` made unknowable" };
  return { raw: word.text, file: path.resolve(dir, t) };
}

/** Every file a bash command's text writes, in order, or null when the text does not parse. */
function bashWrites(command, cwd) {
  const commands = readBash(command);
  if (commands === null) return null;
  const out = [];
  let dir = cwd;
  for (const c of commands) {
    const w = commandWrites(c.words);
    for (const t of [...c.writes, ...w.targets]) out.push(place(t, dir));
    if (w.blind) out.push({ raw: "sed -i", file: null, why: w.blind });
    if (w.script !== undefined) {
      const inner = bashWrites(w.script, dir);
      if (inner === null) out.push({ raw: "bash -c", file: null, why: "its script does not parse" });
      else out.push(...inner);
    }
    if (w.cd === null) dir = null;
    else if (w.cd !== undefined) {
      if (!w.cd.literal) dir = null;
      else if (path.isAbsolute(w.cd.text)) dir = path.resolve(w.cd.text);
      else if (dir !== null) dir = path.resolve(dir, w.cd.text);
    }
  }
  return out.filter((t) => t !== null);
}

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  let decision = "allow";
  let reason = "agent-write-scope: not a subagent write";

  try {
    // Buffer-concat rather than string accumulation, and a BOM strip: a multi-byte character split
    // across two chunks decodes to replacement characters under naive `raw += d`, and the payload
    // carries file contents.
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""));
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TypeError("hook input is not an object");
    }

    const agentType = input.agent_type;

    if (agentType && input.tool_name === "Agent") {
      // Spawning is gated on WHO is asking, never on a path. Like the Bash branch, this must come
      // before the path logic, which would otherwise see an Agent call with no `file_path` and ask.
      if (SPAWNERS.has(agentType)) {
        reason = `agent-write-scope: ${agentType} may fan out — the width cap is prose, and unheld here`;
      } else if (!(agentType in SCOPES)) {
        decision = "ask";
        reason = `agent-write-scope: "${agentType}" has no declared spawn permission — approve deliberately, or add it to SPAWNERS`;
      } else {
        decision = "deny";
        reason =
          `agent-write-scope: ${agentType} may not spawn a subagent — only census may, because its ` +
          `work splits into independent slices and its returns are classifications rather than ` +
          `edits. Fanning out ${agentType} either corrupts a shared tree or destroys a synthesis ` +
          `that cannot be partitioned. Ask the caller to dispatch it instead.`;
      }
    } else if (agentType && input.tool_name === "Bash") {
      // Bash is gated on WHAT IT RUNS, and since v5 on the files its text writes. It has no
      // `file_path`, so this branch must come before the path logic, which would otherwise ask on
      // every command any subagent runs.
      const command = String(input.tool_input?.command ?? "");
      const hit = deniedGitSubcommand(command);
      if (hit) {
        decision = "deny";
        reason =
          `agent-write-scope: a subagent may not run \`git ${hit}\` — it creates or publishes a ` +
          `commit on the caller's branch, and on this project pushing to \`main\` IS the launch. ` +
          `Agents end at a REPORT; the caller commits. Leave the tree dirty and say what changed.`;
      } else {
        // v5: the files the command's text writes, each held to the same scope as a Write. Any
        // write the scope would refuse, and any target that cannot be read, ASKS — see the v5 note.
        const cwd = input.cwd || process.cwd();
        const writes = bashWrites(command, cwd);
        const flagged =
          writes === null
            ? ["the command does not parse, so what it writes cannot be read"]
            : writes.flatMap((t) => {
                if (t.file === null) return [`"${t.raw}" — ${t.why}`];
                const v = scopeVerdict(agentType, cwd, t.file);
                return v.decision === "allow" ? [] : [`"${t.raw}" — ${v.reason.replace(/^agent-write-scope: /, "")}`];
              });
        if (flagged.length > 0) {
          decision = "ask";
          reason =
            `agent-write-scope: ${agentType} is running a bash command that writes where it may not, ` +
            `or where this hook cannot tell: ${flagged.join("; ")}. A bash write is read from the ` +
            `command's text, so it ASKS rather than denies. Approve it deliberately, or return the ` +
            `finding instead of writing it.`;
        } else {
          reason = writes !== null && writes.length > 0
            ? `agent-write-scope: ${agentType} running a bash command whose every write is in scope`
            : `agent-write-scope: ${agentType} running a non-committing bash command`;
        }
      }
    } else if (agentType) {
      const cwd = input.cwd || process.cwd();
      const raw = targetPath(input.tool_input);
      if (raw) {
        ({ decision, reason } = scopeVerdict(agentType, cwd, raw));
      } else {
        decision = "ask";
        reason = `agent-write-scope: ${agentType} called ${input.tool_name} with no recognisable path field`;
      }
    }
  } catch {
    // A gate that cannot read its input must interrupt, never wave through.
    decision = "ask";
    reason = "agent-write-scope: could not parse hook input — failing to a prompt, not to silence";
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    }),
  );
});
