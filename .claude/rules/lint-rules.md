---
paths:
  - "eslint-rules/**"
  - "eslint.config.*"
---

## LINT RULE PLUMBING — TRAPS THAT SILENTLY DISABLE ENFORCEMENT

The lint rule is the deliverable — a grep counts what you point it at; a lint rule counts what exists. But the plumbing has two failure modes that turn a rule into decoration, both hit in this repo:

1. **A mis-derived `relPath` silently DISABLES the rule.** If the rule computes a file's repo-relative path wrongly (drive-letter casing, backslashes, cwd assumptions), baseline lookups miss and the rule either flags everything or nothing. After touching path derivation, RE-PROBE: confirm the rule fires on a known violation AND stays quiet on a baselined file.
2. **A single-spelling pattern measures a false zero.** `.slice(0,10)` and `.split("T")[0]` are the same operation; a pattern that knows one spelling reports the other as "clean". Before claiming a zero baseline, enumerate synonyms of the operation and extend the pattern to all of them — then prove the pattern fires on a planted positive.

**UNENFORCEABLE** — both are properties OF a rule's implementation quality; nothing checks a checker. "Re-probe after touching path derivation" and "enumerate synonyms before claiming zero" are review discipline for the rule author, with no meta-rule enforcing them (the closest analogue, `check-claude-md.mjs`'s own `--selftest`, is this repo's one instance of the pattern — not a generalised requirement).

Baseline discipline:
- A baseline entry means "read and classified", never "exempt". Every entry carries (or points to) its classification.
- Baselines only SHRINK. A new violation outside the baseline fails immediately; removing entries as they're fixed is part of the fix's acceptance.
- Never widen a baseline to make CI green — that's deleting the finding, not resolving it.

**UNENFORCEABLE** — PARTIAL. "Baselines only shrink" is exactly what `check-claude-md.mjs` itself enforces for the `**UNENFORCEABLE**` count (`N may only fall`) and what `check-file-headers.mjs`/`check-pii-classification.mts` enforce for their own baselines (a `fixed`/regressed baseline entry fails the build) — but that shrink-only property is per-script, not a general property every `*.baseline.json` in the repo is verified to hold; a NEW baseline file could be introduced that widens on every run and nothing would notice. "A baseline entry carries its classification" is unchecked content quality (an entry could be a bare filename with no reason).

When adding a new rule: ship it WITH its baseline in the same commit, state the count in the commit message, and note the spellings the pattern covers.
**UNENFORCEABLE** — a commit-hygiene rule (what the commit message says); not derivable from the diff alone.

---

## PARITY / ENUMERATION TESTS — two rules, both learned the hard way

A **parity test** asserts a property across a SET of things (every sibling action, every file on a
surface, every primitive with a counterpart). Two failure modes make one worthless, and this repo has
now hit both.

### 1. Every enumeration test asserts NON-EMPTY, as its own case

A test that iterates a list and asserts a property of each member passes trivially when the list is
empty. Move the directory, change the glob, rename a route group — and the suite goes green while
checking nothing. **That is worse than having no test, because it actively reports safety.** Same
family as *verify before you tick* in CLAUDE.md: a green tick is a claim, and a vacuous one is a
false claim.

So the enumeration itself gets an assertion, before any property is checked:

```ts
it("actually enumerated the surface", () => {
  expect(files.length).toBeGreaterThan(100)   // a real floor, not > 0
})
```

Prefer a realistic floor over `> 0`. `> 0` still passes when a glob decays from 400 files to 1.
**UNENFORCEABLE** — a property of how a NEW enumeration test is written; nothing scans `**/__tests__/**` for an `it(...)` whose body iterates a `readdirSync`/`git ls-files` result and asserts no non-emptiness floor on the list length.

Live instances: `lib/portal/__tests__/no-session-credential-leak.test.ts` and
`no-client-portal-token.test.ts`.

### 2. A parity test ENUMERATES its members; it never samples them

Checking two of three siblings and asserting the property of "the siblings" is a **coverage
failure** — true of what was sampled, asserted of the population. It is the same shape as a stale
status line, one axis over.

This is not hypothetical. ADDENDUM_62F §14.4 checked `inviteLandlord` and `sendPortalInvite`, found
both clean, and concluded the invite paths were safe. The unread third sibling, `inviteTenant`,
returned a 90-day tenant session URL to the agent's dashboard with a copy button. The two safe ones
returned `{ success: true }` and the unsafe one returned `{ success: true, url }` — **nothing marks
that as significant, because the return type is the security boundary and TypeScript cannot see it.
A string is a string.**

So the test derives its member list from disk (`readdirSync`, `git ls-files`) rather than a
hand-written array. A fourth sibling is then caught by the enumeration, not by a reviewer
remembering the rule.
**UNENFORCEABLE** — same class as above: whether a NEW parity test derives its member list from disk vs. a hand-written array is a property of the test's own source, unchecked by anything outside code review.

### Scope precisely, or the allowlist eats the test

Related trap, hit while writing the client-surface test above. The first draft forbade `wa.me`,
`token=` and `navigator.clipboard` outright and produced 20+ hits — all legitimate: public
token-gated routes, WhatsApp contact links, the tenant's own portal handling its own URL. **A test
with 20 false positives gets an allowlist with 20 entries and then means nothing.** Narrow the
pattern to the actual defect (here: a tenant portal credential reaching *agent-facing* code) until
the true-positive rate is high enough that every allowlist entry is worth arguing about.
**UNENFORCEABLE** — "narrow until every entry is worth arguing about" is a design-time judgement about a pattern's precision; no check measures a NEW test's false-positive rate against a threshold.

**And state coverage when reporting.** "Checked `inviteLandlord`, `sendPortalInvite` — did not read
`inviteTenant`" is a different claim from "checked the invite paths", and only one of them is what
happened. A stated coverage gap is visible to the author while writing it; an unstated one needs a
reader to catch.
**UNENFORCEABLE** — a reporting-honesty norm about prose written in chat/PR descriptions; not a property of any file a check could inspect.
