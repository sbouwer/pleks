/**
 * agent-write-scope.js — KIT FILE, install at `.claude/hooks/`.
 *
 * @kit agent-write-scope v4 — tracked OUTSIDE its `KIT:CONFIG` regions. The scope map is
 * yours; the gate logic is canon's, and `check-kit-drift.mjs` reconciles it.
 *
 * A PreToolUse gate with THREE remits: it bounds what a subagent may WRITE, denies a subagent the
 * ability to CREATE A COMMIT, and decides which agent types may SPAWN another agent.
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
      // Bash is gated on WHAT IT RUNS, never on a path — it has none. This branch must come before
      // the path logic, which would otherwise see a Bash call with no `file_path` and ask on every
      // command any subagent runs.
      const command = String(input.tool_input?.command ?? "");
      const hit = deniedGitSubcommand(command);
      if (hit) {
        decision = "deny";
        reason =
          `agent-write-scope: a subagent may not run \`git ${hit}\` — it creates or publishes a ` +
          `commit on the caller's branch, and on this project pushing to \`main\` IS the launch. ` +
          `Agents end at a REPORT; the caller commits. Leave the tree dirty and say what changed.`;
      } else {
        reason = `agent-write-scope: ${agentType} running a non-committing bash command`;
      }
    } else if (agentType) {
      const cwd = input.cwd || process.cwd();
      const raw = targetPath(input.tool_input);
      if (!raw) {
        decision = "ask";
        reason = `agent-write-scope: ${agentType} called ${input.tool_name} with no recognisable path field`;
      } else if (!(agentType in SCOPES)) {
        decision = "ask";
        reason = `agent-write-scope: "${agentType}" has no declared write scope — approve deliberately, or add one to SCOPES`;
      } else {
        const allowed = SCOPES[agentType];
        const file = path.resolve(cwd, raw);
        if (allowed === null) {
          // `null` is now "bounded by the manifest", not "ungated". The agent's OWN artefact
          // directory is always in scope and is never named in a manifest: every spine writes a
          // handoff artefact, so requiring it to be declared would mean every manifest carrying one
          // identical line, and a line that is always the same is a line that will be forgotten.
          const m = readManifest(cwd, agentType);
          if (contains(path.resolve(cwd, ".handoff"), file)) {
            // FIRST, and before the manifest is even consulted. Every spine writes a handoff
            // artefact, so this is the one write that is in scope by definition — gating it on a
            // declaration would mean a run could be stopped from REPORTING what it did, which is
            // the opposite of what any of this is for.
            reason = `agent-write-scope: ${agentType} writing its own artefact, which is always in scope`;
          } else if (!m.ok) {
            decision = "ask";
            reason =
              `agent-write-scope: ${agentType} writes without a declared scope — ${m.why}. ` +
              `Approve this write deliberately, or bound the run first by writing ${MANIFEST}: ` +
              `{"agent":"${agentType}","paths":["${path.dirname(raw).replace(/\\/g, "/")}/"]}. ` +
              `It expires in 2h and must not be committed.`;
          } else if (m.paths.map((r) => path.resolve(cwd, r)).some((root) => contains(root, file))) {
            reason = `agent-write-scope: ${agentType} writing inside the scope declared for this run`;
          } else {
            decision = "deny";
            reason =
              `agent-write-scope: this run scoped ${agentType} to ${m.paths.join(", ")} — ` +
              `"${raw}" is outside it. If the task genuinely needs that file, the CALLER widens ` +
              `${MANIFEST} and says why; an agent widening its own scope is the thing this stops.`;
          }
        } else if (allowed.length === 0) {
          decision = "deny";
          reason =
            `agent-write-scope: ${agentType} writes no files at all — its spine has it EMIT a JSON ` +
            `object as its return message, which a wrapper merges. "${raw}" is a file it has no ` +
            `remit to open. Return the finding instead.`;
        } else if (!allowed.map((r) => path.resolve(cwd, r)).some((root) => contains(root, file))) {
          decision = "deny";
          reason =
            `agent-write-scope: ${agentType} may only write to ${allowed.join(", ")} — ` +
            `"${raw}" is outside it. Artefacts go to .handoff/<task-slug>/; report findings to ` +
            `the caller instead of editing the tree.`;
        } else {
          reason = `agent-write-scope: ${agentType} writing inside its scope`;
        }
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
