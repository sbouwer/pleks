---
description: Verify a spec's present-tense claims against the code, and stamp the result with the SHA it ran against
argument-hint: [path to a spec, or BUILD_XX | ADDENDUM_XXY]
---

Verify $1 against the tree.

**What this is for.** A spec's grounding sections assert what the code *currently does*. Those
assertions are observations, and observations rot — CLAUDE.md §8 already says an unanchored one is
itself a finding. This command turns that from a discipline into a procedure: extract every
present-tense claim, read the file behind it, record confirmed / refuted / not-found, and stamp the
result with the commit it was read against so the next session can tell whether it still stands.

It catches **facts, not judgement.** A claim about what a file contains is checkable. A ruling —
*bind on `application_id` because `org_id` is nullable*, *move the display reader out rather than
pulling auth in* — is an argument against alternatives, and nothing here reaches it. Do not report
a verified spec as a sound spec.

---

## 1 · Resolve the spec

If `$1` is a bare id, find it via `brief/build/INDEX.md` (builds in `_BUILDS/`, addendums in
`_ADDENDUM/`). Read the whole file yourself before spawning anything — you need to be able to judge
the returned rows, and you cannot do that from the rows alone.

## 2 · Spawn `grounder` with the verification brief

One `grounder`, given the spec path and this instruction set. Its job is narrow and it must not
widen:

> **Extract every present-tense assertion the spec makes about this repository's tree** — "the code
> does X", "`foo.ts` exports `bar`", "the cookie is display-only", "`canDowngradeTo` refuses over
> cap". Include claims made in tables, headers and parentheticals, not only in prose.
>
> **Exclude every assertion of intent.** "The code *should* do X", "we will add Y", "the experience
> contract is Z" are authored, not observed, and are out of scope. The split is CLAUDE.md §8's:
> *does X* → a claim; *should X* → not a claim. When a sentence is genuinely both, split it and
> carry only the observation half.
>
> **For each claim, open the file it is about and read the relevant code.** Not a grep for the
> symbol — a read of the construct. Then record exactly one of:
>
> - `confirmed` — the file says what the spec says it says
> - `refuted` — the file exists and contradicts the claim, in whole or in the part that matters
> - `not-found` — the file, symbol, table or section named does not exist
> - `undecidable` — the claim's truth cannot be established BY ANY READ
>
> **`undecidable` is not a softer `not-found`, and it is not a place to put claims you did not
> chase.** If a longer search would settle it, it is not undecidable. It exists for one real shape:
> a citation into `brief/`, which is a OneDrive symlink **outside version control**. Rot (true when
> written, decayed since) and fabrication (wrong at authoring) are distinguishable only by dating
> the citation against history, and there is no history there. Every CODE citation in the first
> seven-spec pass was classifiable on exactly that basis; the `brief/`-internal ones were not, and
> recording one `not-found` asserted a determination no read can make.
>
> **Return one row per claim and nothing else.** No rewriting of the spec. No recommendations. No
> ranking. No opinion on whether a refutation matters. A row that editorialises is a row that has
> made a ruling that is not yours to make.
>
> Every row carries the file you read, with a line reference where one is meaningful. A row whose
> "file read" column is empty is not a verification.
>
> **A refutation may state ONLY what the read establishes.** This is the rule the whole instrument
> exists to enforce, and it is the one most easily broken by the verification itself. *"The view's
> CASE produces six values"* is a finding: one file, read, settled. *"These five states are never
> set anywhere"* is a different claim about the whole system, and it needs a different search —
> every writer of every column, not one file. The first is true; the second was appended to it
> unchecked in the 14B pass and was **false** (the states were set across three other tables).
>
> A correct local observation extended into a system claim is the shape of most wrong rulings, and
> under an anchor it is worse than an unverified spec: the block makes it look checked. So keep them
> in separate rows. If the wider claim matters, verify it as its own row with its own search, or
> leave it unmade — never as a clause attached to a narrower finding.
>
> **A `not-found` may state ONLY that the searched terms were absent.** It may not conclude the
> capability is absent. That is the refutation rule's exact counterpart, and it went unguarded a
> pass longer: the not-found door had no lock while the refutation door did.
>
> Before recording `not-found`, search the **capability**, not only the symbol the spec happened to
> name — the domain concept, the addendum reference, and the table or column it would persist to.
> Two cheap tells would have caught ADDENDUM_04A, recorded absent because `cpa_applicable`,
> `cpaApplicable` and `classifyCpa` do not exist: the shipped module's header names `ADDENDUM_04A`,
> and the schema carries `cpa_applies_at_signing`. **A spec's reference number and its persisted
> columns are searchable when its symbol names are not — and both survive a rename, which is
> exactly the failure mode here.** Grep the addendum id across the tree, and grep the columns the
> claim implies, before you write the token.
>
> **"I did not open it" is not `not-found` either.** A claim you could not reach is unverified, and
> the row must say so in the claim column rather than borrowing a result token that reads as a
> finding downstream. 14S row 9 recorded `not-found` for a dependency spec that was simply outside
> the pass, while row 4 of the same block had already read the file that answered it.
>
> If a claim is ambiguous enough that you cannot decide what would confirm it, record it
> `not-found` with the ambiguity named in the claim column. Do not guess a charitable reading —
> a claim nobody can test is a finding about the spec.

Its artefact is `.handoff/<task-slug>/01-grounder.md` as always; the row table goes in it.

## 3 · Read the result before you write anything down

**An all-confirmed first pass is a red flag about the verifier, not a green light on the spec**
(Stéan, 2026-09-07). A spec written from a thin grounding pass does not come back clean. If every
row is `confirmed`, assume the claim extraction was under-constrained — it most likely skipped the
specific, checkable assertions in tables and parentheticals in favour of the safe summary
sentences — and say so rather than stamping it.

Sanity-check the extraction the same way: a 200-line spec with a "Grounded against" header and four
extracted claims has been under-read, whatever the rows say.

## 4 · Stamp the spec

**You** write the block — grounder may only write its own artefact. Append it to the spec:

```markdown
<!-- SPEC-VERIFIED v1 -->
anchor: sha=<short sha> · utc=<ISO-8601 Z> · verifier=grounder

| # | Claim (§) | File read | Result | Ruling |
|---|---|---|---|---|
| 1 | the cookie is display-only, never entitlement (§0) | `lib/tier/getOrgTier.ts:11-17` | confirmed | — |
| 2 | periods follow PayFast, never local arithmetic (§0) | `webhooks/payfast/subscription/route.ts:118` | refuted | — |
<!-- /SPEC-VERIFIED -->
```

Both anchor values are **read, never recalled** — `git rev-parse --short HEAD` and
`date -u +%Y-%m-%dT%H:%M:%SZ`, at the moment of writing. A remembered SHA anchors nothing.

**Verify on `main` wherever you can, and if you cannot, say what you substituted.** This repo
squash-merges, so a feature-branch HEAD stops being an ancestor of `main` the moment the branch
lands — the block would go stale on merge with nothing having changed, which trains people to
ignore staleness. Found on the first real run (2026-09-07, ADDENDUM_57I). If you must verify from a
branch, anchor to the newest commit that will survive (`git merge-base origin/main HEAD`) **only
after proving the substitution is honest**: `git diff --name-only <that sha> HEAD` must not touch a
single file the verification read. Print that proof into the block. An anchor that misreports which
tree was read is this mechanism's own failure mode, so the substitution is never silent.

Then run the instrument and paste its verdict into your report:

```
node scripts/check-spec-verification.mjs <spec path>
```

**`MISCITED` (exit 5) means the block and the M-register disagree**, in either direction: a Ruling
cites an `M-NNN` with no entry, or an entry names this spec as its `Covering spec:` and no row cites
it back. **Filing a gap and marking the row are two acts**, and the 25A pass did one of them — M-107
was written and its row's Ruling cell left `—`, so the block reported UNRULED over a gap that was
already filed. That direction merely overstates the outstanding work. The inverse does not: a row
reading `gap-filed:M-113` over an M-113 nobody wrote is a fabricated citation *inside the instrument
built to catch fabricated citations*, and it reads as closed.

---

## 4a · Never cite `brief/` as evidence

A spec's grounding sections may cite `lib/`, `app/`, `supabase/`, `scripts/` — anything git can
date. **They must not cite another `brief/` document as evidence for a claim.** That tree is
unversioned, undateable and outside CI's reach, so a citation into it can never be classified, and
under an anchor it acquires a credibility the artefact cannot support. ADDENDUM_02B cites
`LEGAL_NOTE_PLATFORM_LIABILITY.md Part B`, which does not exist and may never have.

**If a document is load-bearing for a build, it belongs in the tracked tree.** This is the same
conclusion CLAUDE.md §1 reaches from the other side — *"anything the tooling depends on belongs in
the tracked tree instead"* — and the same one that put `MECHANISABLE.md` and `EXPERIMENTS.md` in
`docs/` while the specs stayed outside it. Three independent routes, one answer.

## 5 · Take the refuted rows to Stéan — do not resolve them

Every `refuted` and `not-found` row leaves the `Ruling` column as `—` until he rules on it. There
are **four** dispositions and only one of them touches the spec:

| Ruling | Means |
|---|---|
| `spec-corrected` | the spec was wrong — correct the claim |
| `gap-filed:<ref>` | the **code** is wrong — keep the claim, file the gap (M-register / issue) |
| `intent-not-observation` | the claim was mislabelled — it is authored intent, mark it and stop treating it as a fact |
| `verification-corrected` | the **finding** was wrong — re-record the row, and explain the miss |

**The third one is why a verifier may never rewrite a spec.** A refuted claim that was actually a
requirement reads exactly like a wrong fact, and "fixing" it deletes the requirement. This nearly
happened to `SPEC_TIER_CHANGE`.

**The fourth belongs in the taxonomy rather than beside it, because the first three all assume the
finding was sound and only ask which artefact is wrong.** A verifier that cannot record its own
errors does not stop making them — it launders them into whichever of the other three it is forced
into, and the block then carries a wrong finding wearing a correct-looking disposition. So the
state is represented, not excepted.

It carries **two** fields, never one:

1. **the corrected result** — what a proper read establishes, with the file, the callers and the
   persistence, exactly as a first-pass row would have carried them
2. **why the original miss happened** — the search that was actually run, and why it failed

The second field is what makes this more than an erratum. It is the only place the verifier's own
failure modes accumulate, and every entry in it is a candidate rule for §2 above — the not-found
rule got there that way.

**And it is the one disposition that obliges a re-check of its neighbours.** A `not-found` produced
by a symbol-name miss is very unlikely to be unique: every other `not-found` in that pass came out
of the same method, on the same day, from the same agent. When a row takes this ruling, say
explicitly which sibling rows were re-checked and which were not — an un-re-checked sibling is a
known-unknown, and silence turns it into an assumed-good.

Present the rows, recommend nothing, and wait.

## 6 · What a stale stamp means downstream

`/build` and the `implementer` surface both check this block before building from a spec: absent or
stale → `decision-needed`, not a build. That is the half that binds without the spec author's
cooperation, and it is guidance, not a gate — the honest limit is filed as **M-106**.
