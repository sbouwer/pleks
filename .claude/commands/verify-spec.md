---
description: Verify a spec's present-tense claims against the code, and stamp the result with the SHA it ran against
argument-hint: [spec id or path]
---
<!-- @kit verify-spec v1 — tracked OUTSIDE its KIT:CONFIG regions. Edit it in dev-standards and
     re-adopt; a change outside a region is a fork, and check-kit-drift says so. It restates no
     spine: scripts/check-commands.mjs fails a command that copies one. -->

Verify $1 against the tree.

**What this is for.** A spec's grounding sections assert what the code *currently does*. Those
assertions are observations, and observations rot. This command turns "an unanchored observation
is itself a finding" from a discipline into a procedure: extract every present-tense claim, read
the file behind it, record the result, and stamp it with the commit it was read against, so the
next session can tell whether it still stands.

It catches **facts, not judgement.** A claim about what a file contains is checkable. A ruling — an
argument for one design against its alternatives — is not, and nothing here reaches it. Never
report a verified spec as a sound spec.

---

## 1 · Resolve the spec

<!-- /* KIT:CONFIG resolve — yours: where specs live and how an id resolves to a path */ -->
If `$1` is a bare id, resolve it through `brief/build/INDEX.md`: builds in `brief/build/_BUILDS/`,
addendums in `brief/build/_ADDENDUM/`.
<!-- /* KIT:CONFIG /resolve */ -->

Read the whole file yourself before spawning anything. You need to judge the returned rows, and you
cannot do that from the rows alone.

## 2 · Spawn the `grounder` with the verification brief

One `grounder`, given the spec path and this instruction set. Its job is narrow and it must not
widen:

```
pipeline: verify-spec · step 1 of 1 · artefact: .handoff/<slug>/01-grounder.md
<the spec path · the brief below>
```

> **Extract every present-tense assertion the spec makes about this repository's tree** — "the code
> does X", "`foo.ts` exports `bar`". Include claims made in tables, headers and parentheticals, not
> only in prose.
>
> **Exclude every assertion of intent.** "The code *should* do X", "we will add Y" are authored, not
> observed, and out of scope: *does X* is a claim, *should X* is not. When a sentence is genuinely
> both, split it and carry only the observation half.
>
> **For each claim, open the file it is about and read the construct** — not a grep for the symbol.
> Then record exactly one of:
>
> - `confirmed` — the file says what the spec says it says
> - `refuted` — the file exists and contradicts the claim, in whole or in the part that matters
> - `not-found` — the file, symbol, table or section named does not exist
> - `undecidable` — the claim's truth cannot be established BY ANY READ
>
> **`undecidable` is not a softer `not-found`**, and not a place for claims you did not chase. If a
> longer search would settle it, it is not undecidable. Its one real shape is a citation into a
> document outside version control, where rot and fabrication cannot be told apart because there is
> no history to date the citation against.
>
> **Write one row per claim to the artefact, and nothing else.** No rewriting of the spec, no
> recommendations, no ranking, no opinion on whether a refutation matters. Every row carries the file
> read, with a line reference where one is meaningful; a row with no file read is not a
> verification.
>
> **A refutation states ONLY what the read establishes.** "This view's CASE produces six values" is
> one file, read, settled. "These states are never set anywhere" is a claim about the whole system
> and needs a different search — every writer, not one file. Keep them in separate rows: verify the
> wider claim as its own row with its own search, or leave it unmade, never as a clause on a narrower
> finding. Under an anchor, an extended local observation looks checked and is not.
>
> **A `not-found` states ONLY that the searched terms were absent** — never that the capability is.
> Before recording one, search the **capability**, not only the symbol the spec happened to name: the
> spec's own reference id across the tree, the domain concept, and the columns the claim implies it
> persists to. Reference ids and persisted columns survive a rename; symbol names do not.
>
> **"I did not open it" is not `not-found` either.** A claim you could not reach is unverified, and
> the row says so in the claim column rather than borrowing a result token that reads as a finding.
>
> If a claim is too ambiguous to know what would confirm it, record it `not-found` with the ambiguity
> named. Do not guess a charitable reading: a claim nobody can test is a finding about the spec.

## 3 · Read the result before you write anything down

**An all-confirmed first pass is a red flag about the verifier, not a green light on the spec.** A
spec written from a thin grounding pass does not come back clean. If every row is `confirmed`, assume
the extraction was under-constrained — it took the safe summary sentences and skipped the checkable
assertions in tables and parentheticals — and say so rather than stamping it.

Sanity-check the extraction the same way: a long spec with a "grounded against" header and a handful
of extracted claims has been under-read, whatever the rows say.

## 4 · Stamp the spec

**You** write the block — the grounder writes only its own artefact. Append it to the spec:

```markdown
<!-- SPEC-VERIFIED v1 -->
anchor: sha=<short sha> · utc=<ISO-8601 Z> · verifier=grounder

| # | Claim (§) | File read | Result | Ruling |
|---|---|---|---|---|
| 1 | <the claim> (§<n>) | `<path>:<lines>` | confirmed | — |
<!-- /SPEC-VERIFIED -->
```

Both anchor values are **read, never recalled** — `git rev-parse --short HEAD` and
`date -u +%Y-%m-%dT%H:%M:%SZ`, at the moment of writing. A remembered SHA anchors nothing.

**Verify on the default branch wherever you can, and if you cannot, say what you substituted.** Under
squash-merge a feature-branch HEAD stops being an ancestor the moment the branch lands, so the block
goes stale on merge with nothing changed — which trains people to ignore staleness. From a branch,
anchor to `git merge-base origin/<default> HEAD` **only after proving the substitution honest**:
`git diff --name-only <that sha> HEAD` touches no file the verification read. Print that proof into
the block. An anchor that misreports which tree was read is this mechanism's own failure mode.

Then run this project's instrument, if it has one, and paste its verdict into your report:

<!-- /* KIT:CONFIG instrument — yours: the check that reads the block, and what each exit means */ -->
`node scripts/check-spec-verification.mjs <spec path>` — FRESH 0 · STALE 1 · UNVERIFIED 2 ·
UNRULED 3 · **MISCITED 5**. MISCITED means the block and the M-register disagree, in either
direction: a Ruling cites an `M-NNN` with no entry, or an entry names this spec as its
`Covering spec:` and no row cites it back. The 25A pass filed M-107 and left its row's Ruling `—`, so
the block reported UNRULED over a gap already filed; the inverse — a row reading `gap-filed:M-113`
over an M-113 nobody wrote — would read as closed.

**The pleks precedents behind §2–§5's rules**, kept here because they are this project's evidence:
- *Refutation states only what the read establishes* — the 14B pass appended "these five states are
  never set anywhere" to a correct one-file finding; it was false (set across three other tables).
- *Search the capability before `not-found`* — ADDENDUM_04A was recorded absent because
  `cpa_applicable` / `classifyCpa` do not exist; the shipped module's header names `ADDENDUM_04A` and
  the schema carries `cpa_applies_at_signing`.
- *"I did not open it" is not `not-found`* — 14S row 9, for a dependency spec outside the pass, while
  row 4 of the same block had read the file that answered it.
- *Anchor on main, or prove the substitution* — found on the first real run, ADDENDUM_57I
  (2026-09-07).
- *A verifier never rewrites a spec* — this nearly deleted a requirement from `SPEC_TIER_CHANGE`.
- *All-confirmed is a red flag* — Stéan, 2026-09-07.
<!-- /* KIT:CONFIG /instrument */ -->

**Filing a gap and marking the row are two acts.** A gap filed with its row's Ruling left `—`
overstates the outstanding work; a row citing a gap nobody filed is a fabricated citation inside the
instrument built to catch them, and reads as closed. Do both, or neither.

### Never cite an unversioned document as evidence

A spec's grounding may cite anything git can date. **It must not cite a document outside version
control as evidence for a claim** — undateable and outside CI's reach, such a citation can never be
classified, and under an anchor it gains a credibility it cannot support. A document that is
load-bearing for a build belongs in the tracked tree.

<!-- /* KIT:CONFIG unversioned — yours: the paths here that are outside version control */ -->
`brief/` — a OneDrive symlink outside version control. A citation into it is recorded
`undecidable`, never `not-found`, and a spec may not cite it as evidence: ADDENDUM_02B cites
`LEGAL_NOTE_PLATFORM_LIABILITY.md Part B`, which does not exist and may never have. Load-bearing
documents belong in the tracked tree — the reason `MECHANISABLE.md` and `EXPERIMENTS.md` live in
`docs/` (CLAUDE.md §1 reaches the same conclusion).
<!-- /* KIT:CONFIG /unversioned */ -->

## 5 · Take the refuted rows to whoever rules — do not resolve them

<!-- /* KIT:CONFIG ruler — yours: who rules on a refuted row */ -->
Stéan (CD drafts the rulings; Stéan approves them).
<!-- /* KIT:CONFIG /ruler */ -->

Every `refuted` and `not-found` row leaves `Ruling` as `—` until it is ruled on. There are **four**
dispositions, and only one touches the spec:

| Ruling | Means |
|---|---|
| `spec-corrected` | the spec was wrong — correct the claim |
| `gap-filed:<ref>` | the **code** is wrong — keep the claim, file the gap |
| `intent-not-observation` | the claim was mislabelled — it is authored intent; mark it and stop treating it as a fact |
| `verification-corrected` | the **finding** was wrong — re-record the row, and explain the miss |

**The third is why a verifier never rewrites a spec.** A refuted claim that was really a requirement
reads exactly like a wrong fact, and "fixing" it deletes the requirement.

**The fourth belongs in the taxonomy, not beside it**: the first three assume the finding was sound
and ask only which artefact is wrong, so a verifier that cannot record its own errors launders them
into one of those. It carries **two** fields: the corrected result, with the file read exactly as a
first-pass row carries it; and **why the miss happened** — the search actually run, and why it
failed. The second field is where the verifier's failure modes accumulate, and each entry is a
candidate rule for §2.

**It is also the one disposition that obliges a re-check of its neighbours.** Every other `not-found`
in that pass came from the same method, on the same day. Say which sibling rows were re-checked and
which were not: an un-re-checked sibling is a known unknown, and silence makes it an assumed good.

Present the rows, recommend nothing, and wait.

## 6 · What a stale stamp means downstream

`/build` checks this block before building from a spec: absent or stale is `decision-needed`, not a
build.

<!-- /* KIT:CONFIG downstream — yours: what else here reads the stamp, and the limit of that binding */ -->
`/build`'s preflight and the `implementer` surface both check the block: absent or stale →
`decision-needed`. That half binds without the spec author's cooperation, but it is guidance, not a
gate — nothing forces the check to run. The honest limit is filed as **M-106**.
<!-- /* KIT:CONFIG /downstream */ -->
