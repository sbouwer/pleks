---
description: Adversarial walk of the current branch/PR before handoff — verify against origin, hunt fail-opens
---

Walk the work just completed as an adversarial reviewer. You are trying to REFUTE the done-report, not confirm it. For an independent pass, spawn the `walker` agent on the diff and fold its findings in — its fresh context catches what the author's context cannot.

**Where the diff has more than one dimension, spawn a walker per dimension IN ONE MESSAGE so they run concurrently** — each scoped to a distinct question (the fail-open hunt of §3, the composition check of §4, the test-quality check of §5), rather than one walker asked to do all of them in sequence. They read the same tree and do not write, so their scopes cannot collide; a walker given one question also returns sharper findings than one given six. **What stays serial is the loop, not the pass:** re-walking after a fix is a new round whose input is the tree the fix changed, so rounds follow one another even when the walkers within a round go out together. And only one process runs `npm run check` at a time — see `/build` §5 for why that one is mechanical.

1. **Origin, not working tree.** `git fetch origin` and diff every claim against the pushed state. `git status` must be clean — uncommitted work that a report calls "done" IS a finding (this has happened twice).
2. **Verify claims in the artefacts.** Every "done" claim gets checked in the actual files. Live-data claims ("NULL on all three rows") require an actual query. Repo-wide pattern claims ("zero raw reads remain") go to the `census` agent — **spawn one per claim, all in a single message, so they run concurrently**; do not queue them one at a time — with synonym spellings, and a zero only counts if the probe demonstrably fires on a known positive.
3. **Fail-open hunt on the diff.** For every guard, check, or computation touched, ask: if this input is malformed, missing, stale, or out of range, does the code fail toward "the notice/state looks valid"? Census precedent: stamps-on-send-failure, lexical range checks passing unreal dates, walks degrading silently past a data horizon, false delivery events. Systems that produce proof fail toward false proof — hunt for that shape specifically.
4. **Adversarial composition.** Verification tells you what each piece does; only composition tells you what they do to each other. Check gates vs the computations they guard: do they anchor on the same value, the same end of the walk, the same timezone resolution?
5. **Tests exercise the bug, not the fix.** Every closed fail-open needs a must-throw (or must-block) fixture that fails on the OLD code. A test asserting the current behaviour of a bug is worse than no test.
6. **Report findings ranked most-severe first** — file + symbol references (never line numbers; they go stale same-day), a concrete failure scenario per finding (inputs/state → wrong outcome). If nothing survives, say so plainly; do not manufacture findings.

$ARGUMENTS
