---
description: Session close — checks, commit, registers, CD-ready handoff report
---

Close out the session properly. A session that ends without this is a session someone else pays for later.

1. **`npm run check`** — must exit 0. Fix or explicitly report failures; never wrap over a red check.
2. **Commit everything that is done.** Conventional message, version-aware. A done-report describing uncommitted files is a contradiction — the report describes ORIGIN state after push, or says explicitly what is deliberately unpushed and why.
3. **Update the registers:** `brief/build/INDEX.md` (register any new build/addendum numbers — CHECK the index before minting a number; 70H got double-allocated by skipping this), `CURRENT.md`, and OUTSTANDING deltas.
4. **Produce the handoff report** in the standard shape:
   - What shipped, with SHAs (origin SHAs, not local).
   - Deviations from spec — each one flagged with reasoning, never silent.
   - Walk-list: judgment calls CD should eyeball, ranked.
   - Live-data claims, each backed by the query that produced it.
   - Open items and what unblocks them.
5. If code shipped, run `/walk` first and fold surviving findings into the report.
6. **Dispose of the handoff artefacts** (`4-AGENT-PIPELINES.md` §9) — per TASK, not per session:
   - **File every `PROMOTE` nomination first.** A `PROMOTE` line is a nomination; only you may file
     it, and only into a register that already exists — `LESSONS.md` with `Applied:` lines, the
     M-register with rung + blast, an allowlist entry with its reason, a comment at the site, the
     commit message, a spec. Filing it is part of finishing the task, done BEFORE the push gate
     while the context that makes it meaningful still exists.
   - **Then `rm -rf .claude/handoff/<task-slug>/`** for each task whose work is pushed and whose
     promotions are filed. The observation dies, the decision survives.
   - **A task that ABORTED (`⊗ MAIN` / `⊗ HUMAN`) keeps its directory.** An abort means a decision
     is pending and those artefacts are the evidence for it. Clear it when the decision is made, not
     when the pipeline stopped. Say in the report which slugs were cleared and which were retained,
     and why.

$ARGUMENTS
