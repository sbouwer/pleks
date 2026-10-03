---
description: Implement a spec — preflight, ground first, phase by phase, walk-ready
argument-hint: [spec id or path]
---
<!-- @kit build v2 — tracked OUTSIDE its KIT:CONFIG regions. Edit it in dev-standards and re-adopt;
     a change outside a region is a fork, and check-kit-drift says so. It restates no spine:
     scripts/check-commands.mjs fails a command that copies one. -->

Implement $1. This is pipeline P1 (4-AGENT-PIPELINES §2): ground, implement, walk — three steps,
and every spawn below names its step and its artefact, because agent-brief-gate refuses one that
does not. Pick one slug for the build and keep it for every spawn.

1. **Read the spec whole before any code**, and every section it references.

   <!-- /* KIT:CONFIG specs — yours: where specs live and how an id resolves to a path */ -->
   Resolve the id through `brief/build/INDEX.md`: builds in `brief/build/_BUILDS/`, addendums in
   `brief/build/_ADDENDUM/`. If the spec references counsel gates or a parent build, read those
   sections too.
   <!-- /* KIT:CONFIG /specs */ -->

2. **Preflight.** A spec's present-tense claims about the tree are observations, and they rot. If
   this project stamps its specs, check the stamp before grounding. A failing preflight is
   `decision-needed` naming the spec and what failed — never a build, and never a verification run
   as a side quest. **In an arc** (playbooks/5-ARCS.md §5) the stamp is checked when the arc opens:
   a stamp made stale only by this arc's own merged PRs is expected, and you say so, citing the
   commits that moved the files. Staleness from any other commit is still a stop.

   <!-- /* KIT:CONFIG preflight — yours: the check a spec must pass first, and what each exit means */ -->
   `node scripts/check-spec-verification.mjs <spec path>`:
   - **FRESH (0)** → build. The confirmed rows are load-bearing facts you may rely on.
   - **STALE (1)** → outside an arc, `decision-needed`, naming the spec; offer `/verify-spec <spec>`
     and wait. **Mid-arc**, first diff the stamp's anchor against HEAD: if every commit that moved a
     verified file is one of THIS arc's merged PRs, it is expected — say so, cite those commits, build.
     Any other commit moving a verified file is still a stop. **The exit code cannot tell the two
     apart** (5-ARCS §5) — `1` is the start of the question, never its verdict.
   - **UNVERIFIED (2)** → `decision-needed`, naming the spec; offer `/verify-spec <spec>` and wait.
   - **UNRULED (3)** → outside an arc, `decision-needed`: refutations await Stéan's ruling, and only
     one of the four dispositions is "the spec is wrong" (`/verify-spec` §5). **Mid-arc**, an unruled
     refutation stops the build only under (a)–(c) (step 6); otherwise build to the TREE, not the
     refuted claim, and record the row and what you did under `Decided in build`.

   This fires without the spec author's cooperation — a thin grounding pass looks identical to a
   thorough one until the build extends machinery that isn't there. Guidance, not a gate (M-106).
   <!-- /* KIT:CONFIG /preflight */ -->

3. **Ground first — spawn the `grounder`** and wait for its map before writing anything:

   ```
   pipeline: P1 · step 1 of 3 · artefact: .handoff/<slug>/01-grounder.md
   <the spec path · the concept list · the sections the map must cover>
   ```

   Read the map from the artefact, not the reply. Its collision and gap sections are blockers to
   resolve before the first line of code, not notes.

4. **The non-negotiables apply to every line:**

   <!-- /* KIT:CONFIG nonnegotiables — yours: the rules no line may break here */ -->
   `org_id` + RLS on every table, `audit_log` on every state change, `consent_log` for POPIA events,
   amend-forward migrations only (append §N BUILD_XX sections to 001–012; NEVER new numbered files;
   NEVER touch 007/008), all Anthropic calls through `lib/ai/client.ts`, every env read through
   `lib/env.ts`, `NEXT_PUBLIC_APP_URL` for every absolute URL.
   <!-- /* KIT:CONFIG /nonnegotiables */ -->

5. **Phase as the spec orders it; commit per phase.** Keep the judgment sites and the SSOT design in
   this session, and delegate a phase's mechanical bulk — a codemod, a migrate-these-sites sweep, a
   rename — to the `implementer`:
   - **Write `.handoff/write-manifest.json` fresh before each spawn** —
     `{"agent": "implementer", "paths": [<exactly what this run may write>]}`. agent-write-scope
     bounds the implementer by it, asks on every write when it is absent, and expires it.
   - **Spawn it in THIS checkout, never with `isolation: "worktree"`** — a worktree is cut from
     the default branch, and on a feature branch that is a different tree from yours.
   - Its brief points at the map rather than retelling it:

   ```
   pipeline: P1 · step 2 of 3 · artefact: .handoff/<slug>/<NN>-implementer.md
   <the transform · the scope, matching the manifest · inputs: .handoff/<slug>/01-grounder.md §<the sections that bear on this phase>>
   ```

6. **Decide what a build can decide, and write it down.** Every call made without asking — a name,
   a table, a test's shape, a retry level, metadata against a column, a deviation from the spec —
   goes under a **`Decided in build`** section of the PR body, with its reason. The spec's author
   reviews them; a wrong one becomes a follow-up. A PR that decided nothing says so.

   **Stop only for one of three, and state a default:** (a) a live legal or security exposure,
   (b) a schema change no spec names, (c) a product question with two defensible one-line answers.
   That is `decision-needed`, naming the condition and the default you would take. A refuted claim
   in the spec is a stop only when it meets one of the three; otherwise build to what the tree
   shows and record the refutation under `Decided in build`.

7. **Finish with `/walk`** — step 3 of 3, same slug — **then `/wrap`.** In an arc the owner merges
   on the walker's review alone; the owner's own walk is of the journey, at arc end.
