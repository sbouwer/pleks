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

$ARGUMENTS
