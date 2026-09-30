/**
 * THE ONE FILE YOU EDIT for agent-brief-gate — which spawns owe an artefact, and which built-ins
 * are refused in favour of a spined agent.
 *
 * @kit agent-brief-gate-config v1 — tracked OUTSIDE its `KIT:CONFIG` region.
 *
 * Its own file for the reason `agent-write-scope.config.mjs` is (M-KIT-06): the hook consumes stdin
 * at top level and exports nothing, so the probe cannot read a table inside it, and a probe carrying
 * a second copy goes green over the wrong subject. Both import this; the probe derives its cases
 * from it.
 *
 * WHAT THIS FILE MUST NOT GROW. Only the two tables. What counts as naming an artefact, which
 * phrasings ask for an inline answer, and what malformed input does are canon's claims and live in
 * the hook, outside any region, so a project cannot switch them off by editing a list.
 */

/* KIT:CONFIG briefs — DERIVE IT FROM YOUR `.claude/agents/`, never from this default.
 *
 * BRIEFED: every agent type whose spine writes `.handoff/<task-slug>/<NN>-<agent>.md` and returns
 * only the contract block. A spawn of one of these must name that path in its brief. The default
 * is canon's six contract-bearing spines; drop any you have not installed, add your own.
 *
 * ⚠ crawler-doctrine is ABSENT ON PURPOSE. Its caller is a wrapper parsing JSON from stdout, not
 * Main, and its spine says why it carries no contract. Listing it would refuse every crawl.
 *
 * REDIRECT: built-in types refused, each with the spined agent to spawn instead. `Explore` has no
 * Write tool, so it cannot produce an artefact however it is briefed; `general-purpose` has no
 * spine, so nothing tells it where its work goes. Both come back inline every time — measured
 * across the estate on 2026-09-30. A type in neither table passes untouched: `Plan`, guides, and
 * any agent of your own. A spawn with no `subagent_type` is `general-purpose` to the harness, and
 * to this hook.
 *
 * Every REDIRECT target must be in BRIEFED and INSTALLED — the probe asserts the first; the second
 * is yours. If you have no `scout`, a redirect to it refuses the built-in with nowhere to go:
 * remove the entry instead, and the built-in passes, inline.
 */
const BRIEFED = new Set(["grounder", "census", "walker", "db-inspector", "implementer", "scout"]);
const REDIRECT = { Explore: "scout", "general-purpose": "scout" };
/* KIT:CONFIG /briefs */
export { BRIEFED, REDIRECT };
