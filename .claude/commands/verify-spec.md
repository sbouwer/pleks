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
>
> **Return one row per claim and nothing else.** No rewriting of the spec. No recommendations. No
> ranking. No opinion on whether a refutation matters. A row that editorialises is a row that has
> made a ruling that is not yours to make.
>
> Every row carries the file you read, with a line reference where one is meaningful. A row whose
> "file read" column is empty is not a verification.
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
| 1 | the cookie is display-only, never entitlement (§0) | `lib/tier/getOrgTierCanonical.ts:40` | confirmed | — |
| 2 | `canDowngradeTo` refuses over-cap (§0) | `lib/tier/canDowngradeTo.ts:61` | refuted | — |
<!-- /SPEC-VERIFIED -->
```

Both anchor values are **read, never recalled** — `git rev-parse --short HEAD` and
`date -u +%Y-%m-%dT%H:%M:%SZ`, at the moment of writing. A remembered SHA anchors nothing.

Then run the instrument and paste its verdict into your report:

```
node scripts/check-spec-verification.mjs <spec path>
```

## 5 · Take the refuted rows to Stéan — do not resolve them

Every `refuted` and `not-found` row leaves the `Ruling` column as `—` until he rules on it. There
are **three** dispositions and only one of them touches the spec:

| Ruling | Means |
|---|---|
| `spec-corrected` | the spec was wrong — correct the claim |
| `gap-filed:<ref>` | the **code** is wrong — keep the claim, file the gap (M-register / issue) |
| `intent-not-observation` | the claim was mislabelled — it is authored intent, mark it and stop treating it as a fact |

**The third one is why a verifier may never rewrite a spec.** A refuted claim that was actually a
requirement reads exactly like a wrong fact, and "fixing" it deletes the requirement. This nearly
happened to `SPEC_TIER_CHANGE`.

Present the rows, recommend nothing, and wait.

## 6 · What a stale stamp means downstream

`/build` and the `implementer` surface both check this block before building from a spec: absent or
stale → `decision-needed`, not a build. That is the half that binds without the spec author's
cooperation, and it is guidance, not a gate — the honest limit is filed as **M-106**.
