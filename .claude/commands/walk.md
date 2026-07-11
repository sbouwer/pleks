---
description: Adversarial walk of the current branch/PR before handoff — verify against origin, hunt fail-opens
---

Walk the work just completed as an adversarial reviewer. You are trying to REFUTE the done-report, not confirm it. For an independent pass, spawn the `walker` agent on the diff and fold its findings in — its fresh context catches what the author's context cannot.

1. **Origin, not working tree.** `git fetch origin` and diff every claim against the pushed state. `git status` must be clean — uncommitted work that a report calls "done" IS a finding (this has happened twice).
2. **Verify claims in the artefacts.** Every "done" claim gets checked in the actual files. Live-data claims ("NULL on all three rows") require an actual query. Repo-wide pattern claims ("zero raw reads remain") go to the `census` agent — with synonym spellings, and a zero only counts if the probe demonstrably fires on a known positive.
3. **Fail-open hunt on the diff.** For every guard, check, or computation touched, ask: if this input is malformed, missing, stale, or out of range, does the code fail toward "the notice/state looks valid"? Census precedent: stamps-on-send-failure, lexical range checks passing unreal dates, walks degrading silently past a data horizon, false delivery events. Systems that produce proof fail toward false proof — hunt for that shape specifically.
4. **Adversarial composition.** Verification tells you what each piece does; only composition tells you what they do to each other. Check gates vs the computations they guard: do they anchor on the same value, the same end of the walk, the same timezone resolution?
5. **Tests exercise the bug, not the fix.** Every closed fail-open needs a must-throw (or must-block) fixture that fails on the OLD code. A test asserting the current behaviour of a bug is worse than no test.
6. **Report findings ranked most-severe first** — file + symbol references (never line numbers; they go stale same-day), a concrete failure scenario per finding (inputs/state → wrong outcome). If nothing survives, say so plainly; do not manufacture findings.

$ARGUMENTS
