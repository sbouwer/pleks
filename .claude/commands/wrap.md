---
description: Session close — gate, walk, commit, registers, handoff report, and the handoff artefacts disposed of
---
<!-- @kit wrap v1 — tracked OUTSIDE its KIT:CONFIG regions. Edit it in dev-standards and re-adopt;
     a change outside a region is a fork, and check-kit-drift says so. -->

Close out the session. A session that ends without this is one someone else pays for later.

1. **Run the gate.** It must exit 0. Fix the failures or report them explicitly; never wrap over a
   red gate.

   <!-- /* KIT:CONFIG gate — yours: the gate command, and any domain suites that must also pass */ -->
   `npm run check`
   <!-- /* KIT:CONFIG /gate */ -->

2. **If code shipped, run `/walk` first** and fold the surviving findings into the report.

3. **Commit everything that is done**, split by concern, so each commit reads on its own. A
   done-report describing uncommitted files is a contradiction.

4. **Push, or do not, as this project's rule says:**

   <!-- /* KIT:CONFIG push — yours: this project's push rule */ -->
   Push, and report origin SHAs. Anything deliberately unpushed is named, with the reason. Every
   push is an approval gate (`hook:bash-gate`): announce what is in the batch, what was verified,
   and what to walk, then push. **File the Promote nominations (step 7) BEFORE the push gate**, and
   clear a task's `.handoff/` only once its work is **pushed**, not merely committed — here the
   push is the review point.
   <!-- /* KIT:CONFIG /push */ -->

5. **Update the registers** this session touched. CHECK a register before minting a number in it —
   a number minted without looking is how two things get the same one.

   <!-- /* KIT:CONFIG registers — yours: which registers, and where a new entry goes */ -->
   - **`brief/build/INDEX.md` mints the slot** — CHECK its § Numbering & slots registry before
     minting (70H was double-allocated by skipping this). The row itself goes in its band file,
     `brief/build/NN-<band>.md`, not in INDEX.
   - **`brief/CURRENT.md`** — replace the head, never append a dated block; 8 KB hard ceiling.
   - **`brief/build/DEBT.md`** deltas.
   - `brief/` is an untracked OneDrive symlink: copy a file before rewriting it.
   <!-- /* KIT:CONFIG /registers */ -->

6. **Produce the handoff report:**
   - What shipped, as commits (SHA + subject) — origin SHAs if pushed, and say which are not.
   - Deviations from what was asked — each flagged with its reasoning, never silent.
   - Walk-list: the judgment calls worth eyeballing, ranked.
   - Live-data claims, each backed by the query that produced it.
   - What is deliberately NOT done, and what unblocks it.
   - For every defect named, latent or reachable — "wrong but unreachable" and "wrong and live now"
     are different sentences.

7. **Dispose of the handoff artefacts** (4-AGENT-PIPELINES §9) — per TASK, not per session:
   - **File every Promote nomination first.** A nomination is not a filing; only you may file it,
     and only into a register that already exists. File it now, while the context that makes it
     meaningful still exists.
   - **Record each disposition**, appended to its `Promote` line or on a line of an `NN-main.md`
     beside it that names the artefact's file: `→ filed: <where>` or `→ declined: <reason>`. Then
     run `node scripts/check-handoff-contract.mjs --clearable <slug>` and delete only on exit 0 —
     1 means a nomination is undisposed, 2 means there is no such slug.
   - **Then `rm -rf .handoff/<task-slug>/`** for each task whose work is committed and whose
     nominations are disposed. The observation dies; the decision survives.
   - **A task that ABORTED keeps its directory.** An abort means a decision is pending, and those
     artefacts are its evidence. Clear it when the decision is made.
   - Say in the report which slugs were cleared, which were kept, and why.

$ARGUMENTS
