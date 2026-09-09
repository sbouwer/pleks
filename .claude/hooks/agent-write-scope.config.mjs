/**
 * THE ONE FILE YOU EDIT — the write scope and spawn permission per agent type.
 *
 * @kit agent-write-scope-config v1 — tracked OUTSIDE its `KIT:CONFIG` region.
 *
 * WHY IT IS ITS OWN FILE (M-KIT-06, 2026-09-09). The table used to live inside
 * `agent-write-scope.js`, headed "THE ONE BLOCK YOU MUST EDIT", and
 * `agent-write-scope.probe.mjs` hard-coded the same table as its reference. So a project whose
 * agents differ could not edit the block without failing roughly 25 of 51 probes: the mechanism
 * that verifies the hook punished configuring it, while the hook's own heading said configuring it
 * was mandatory. A kit item's fixtures must be built from its config, not from its defaults.
 *
 * The `SAMPLE_IDS` pattern that closed the other half of M-KIT-06 — a self-validating region —
 * does not transfer, because the probe cannot READ a table inside the hook: the hook consumes
 * stdin at top level, exports nothing, and cannot be imported. So the table moves out, and both
 * the hook and the probe import it. One source, two readers, and the probe DERIVES its agent cases
 * from whatever the project put here.
 *
 * WHAT THIS FILE MUST NOT GROW. Only the table. Every universal assurance — malformed input, the
 * commit denial, traversal semantics, the main-session population — stays in the probe, outside
 * any region, because those are canon's claims and not the project's. Moving one of them in here
 * would not fail loudly; it would quietly hand a project the power to switch it off. That is
 * strictly worse than the defect this file replaces.
 */

/* KIT:CONFIG scopes — THE ONE BLOCK YOU MUST EDIT, and the one place to get it wrong.
 *
 * Write scope per agent type, relative to the project root. `null` means unrestricted;
 * `[]` means writes nothing at all, and produces its own distinct refusal.
 *
 * DERIVE IT FROM YOUR SPINES, NEVER FROM A PLAYBOOK'S PROSE LIST. L-62 records that the
 * prose list was wrong twice in the same four lines, both times in the direction of
 * granting too much, and rules that the authority is what a spine actually tells its agent
 * to write. Read `.claude/agents/`, and record the SHA you read it at.
 *
 * The defaults below match the six canonical spines in `kit/agents/`:
 *
 *   grounder · census · walker · db-inspector   write ONE artefact to `.handoff/<task-slug>/`
 *   crawler-doctrine                            writes NOTHING — it emits JSON as its
 *                                               return, and a wrapper merges it
 *   implementer                                 editing source IS the remit
 *
 * ⚠ crawler-doctrine's EMPTY scope is the L-62 correction applied up front. One project
 * grants it `.claude/crawlers` — a permanent unused exemption at a PROTECTED path, where
 * the write would have stalled anyway. If you adopt a write-scope table from a reference
 * implementation rather than from your own spines, that over-grant is what you inherit.
 *
 *
 * ✅ EDITING THIS TABLE IS SUPPORTED, and until 2026-09-09 it was not. The probe used to hard-code
 * the table — grounder writing to `.handoff/`, crawler-doctrine writing nothing, census alone
 * spawning — so changing it failed roughly 25 of 51 probes. It now IMPORTS this file and derives
 * its per-agent cases from whatever you put here: for each entry a write inside scope, one outside,
 * a `..` escape, and the spawn verdict. Add an agent, change a root, move a name into or out of
 * SPAWNERS, and the probe follows. (M-KIT-06, closed by building.)
 *
 * What the probe still asserts on its own, whatever you write here: malformed input interrupts, a
 * subagent may not create or publish a commit, `..` never escapes a root, and the main session is
 * untouched. Those are canon's claims, they live outside every region, and a project cannot switch
 * them off by editing this table.
 *
 * If your agents differ from the six canonical spines, edit this file and run the probe. It should
 * stay green — and if it does not, the failure is about YOUR table, which is the point.
 *
 * AN AGENT TYPE ABSENT FROM THIS TABLE IS **ASKED**, NOT DENIED. Ad-hoc `general-purpose`
 * and `Explore` delegation is legitimate and this is not the place to forbid it — but a
 * write from an agent nobody scoped should be visible rather than silent.
 *
 * ⚠ WHAT CONTAINS THE IMPLEMENTER. ~~RESIDUAL EXPOSURE, unhedged: an implementer may
 * write ANYWHERE in the checkout.~~ **CLOSED IN v2 — the write manifest is built**, and it
 * is the mechanism this paragraph named while it was still a sketch. THREE controls now
 * apply: the manifest (an unrestricted scope is refined per run by
 * `.handoff/write-manifest.json`), the commit/push denial below (it can dirty the tree, it
 * cannot land anything), and the caller reading `git status` before committing that tree.
 *
 * ⚠ `null` NO LONGER MEANS UNGATED — it means "bounded by whatever the caller declared for
 * this run", and with no declaration it means ASK. If your CLAUDE.md carries the v1 split —
 * an enforced half plus a registered residue for the implementer's edits — that register
 * entry is now closeable, and the prose saying only the caller stands between an unwanted
 * edit and a landed change is stale. Check it rather than assuming either way.
 *
 * ⚠ NOT A WORKTREE. `isolation: "worktree"` creates the tree from the DEFAULT branch, so
 * an implementer spawned that way on a feature branch transforms a different tree, and its
 * green check proves nothing about yours (E10).
 */
/* DERIVED FROM pleks's OWN SPINES, not from the defaults above — `.claude/agents/` as at
 * `63c4cf21`, read 2026-09-09. It lands on canon's table, and that is a result rather than an
 * assumption: pleks has exactly the six canonical spines and no seventh.
 *
 *   census · db-inspector · grounder · walker   each says "You write ONE file and nothing else",
 *                                               `.handoff/<task-slug>/<NN>-<agent>.md`
 *   crawler-doctrine                            `tools: Read, Grep, Glob` — no `Write` at all, and
 *                                               no write instruction anywhere in the spine, so `[]`
 *                                               is what the spine says, not a borrowed default
 *   implementer                                 its artefact plus source edits — the remit
 *
 * SPAWNERS: `census.md` is the only spine listing `Agent` in `tools:`. Same derivation.
 */
const SCOPES = {
  grounder: [".handoff"],
  census: [".handoff"],
  walker: [".handoff"],
  "db-inspector": [".handoff"],
  "crawler-doctrine": [],
  implementer: null,
};

/**
 * Which subagents may spawn a subagent of their own. THIRD REMIT, added 2026-08-30.
 *
 * `census` and nothing else, and the reason is canon's rather than this project's: its work splits
 * into independent slices and its returns are classifications rather than edits, so a fan-out
 * cannot produce write conflicts. `implementer` is excluded deliberately — parallel writers in one
 * checkout is how a codemod corrupts a tree. A `walker` spawning walkers destroys its own
 * synthesis, because the composition pass is a whole-diff property that cannot be partitioned;
 * a walker spawning a CENSUS is the legitimate case, and it is the census that gets fanned out.
 *
 * ⚠ THIS IS THE HALF THAT `tools:` COULD NEVER HOLD. The earlier belief that "no spine lists
 * `Agent`, therefore none can spawn" rested on the same false mechanism E8 demolished for
 * `Write`/`Edit` — the observation was 27 transcripts with zero `Agent` calls, and the explanation
 * did not follow from it. Depth is capped at 2 in settings
 * (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`), so a child cannot fan out again; this decides WHO may
 * fan out at all.
 *
 * WHAT THIS DOES NOT HOLD, and it is a real boundary rather than a hedge: the **width** cap of 4
 * children per run. A PreToolUse hook sees one call and holds no state across a run, so it cannot
 * count children. Canon's answer is visibility rather than refusal — `agent-distribution.mjs` reads
 * `spawnDepth` per run so a fan-out is reported as a fan-out instead of arriving as inflated
 * per-type counts. If you do not have that instrument the width cap is UNHELD — register it as
 * debt rather than letting this hook read as though it covers width.
 */
const SPAWNERS = new Set(["census"]);
/* KIT:CONFIG /scopes */
export { SCOPES, SPAWNERS };
