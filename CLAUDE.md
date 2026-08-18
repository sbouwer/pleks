# CLAUDE CODE INSTRUCTIONS
# Pleks
# Repository: github.com/sbouwer/pleks
<!-- ═══ HARNESS EXPERIMENT REGISTER (SPEC_CLAUDE_MD_STANDARD v3 §8) ═══════════════════════════
     Recorded in an HTML comment because E2 proved that costs nothing. Re-run on a harness upgrade;
     these are OBSERVATIONS of one version, not documented mechanisms.

     E2 · Are HTML comments stripped before injection?            ANSWERED 2026-08-18: YES
       Canary token planted at this exact position (between "# Repository:" and the "---"), then a
       session that demonstrably loaded the POST-canary file — it quoted the new tier POINTER text
       and named commit 0bf57989 — was asked to reproduce the first 12 lines from context. It
       reproduced line 3 and then "---", skipping precisely the canary's five lines, while
       positively identifying both neighbours. That positive ID either side is what makes the
       absence evidential rather than "didn't notice".
       CONSEQUENCE: @enforced markers are free here. The tagging pass economy holds, and the
       ceiling legitimately excludes comments.

     E1b · Do scoped rules trigger on edit-WITHOUT-read?          PRELIMINARY 2026-08-18: NO
       Edited lib/tier/canActivateLease.ts via Bash — covered by .claude/rules/billing-gates.md —
       without reading it. The rule did not arrive across the next two tool calls, while scoped
       rules HAVE arrived repeatedly when a matching file was Read. Note the Edit tool refuses to
       run without a prior Read, so edit-without-read is reachable ONLY through Bash — the reckless
       path. n=1 on the negative; Write untested; debounce not excluded.
       CONSEQUENCE IF IT HOLDS: all 18 rule files here are scoped, so incident-class doctrine is
       absent from exactly the sessions that skip reading. Audit before trusting rung 4.

     E1 · Does paths: frontmatter defer loading?                  OBSERVED YES, not A/B tested
       Scoped rule files arrive mid-session on relevance, not at launch. Not the controlled
       cross-session A/B the spec specifies — treat as suggestive.

     E3 · Does this file reach a subagent?                        OPEN
════════════════════════════════════════════════════════════════════════════════════════════════ -->

---

## CONNECTED MCP SERVERS

All of the following are connected and available in every session. Use them directly — no setup needed.

| Server | Capability |
|--------|-----------|
| **GitHub** (`sbouwer/pleks`) | PRs, issues, CI runs, code search, branch management |
| **Supabase** | Execute SQL, apply migrations, get logs, list tables, check advisors |
| **Vercel** | List/check deployments, build logs, runtime logs, project info |
| **Figma** | Read designs, get screenshots, convert designs to code |
| **Gmail** | Search threads, create drafts (bouwer.stean@gmail.com) |
| **Google Calendar** | Read/create/update events |
| **Google Drive** | Read, search, and create files |

Default to using these instead of asking the user to copy-paste data. For example: check GitHub for open PRs rather than asking; check Vercel for deployment status rather than asking; query Supabase directly rather than asking for schema details.

---

## ⚠ MANDATORY: FILE HEADERS

Every `.ts`, `.tsx`, and `.yml` file must have a filled-in header. Rules:

- **Touch a file with a stub header (contains `FILL:`)** → fill it in before committing. Replace every `FILL:` line with real content; delete unused placeholder lines.
- **Update a file that already has a filled header** → update the header if the purpose, route, auth, or data source has changed.
- **Create a new file** → write the header filled in from the start. Never commit a `FILL:` stub.

TS/TSX format:
```ts
/**
 * app/path/to/file.tsx — one-line purpose
 *
 * Route:  /the/url (omit if not a page)
 * Auth:   what gate protects it
 * Data:   where data comes from
 * Notes:  gotchas or non-obvious decisions (omit if none)
 */
```

YAML format:
```yaml
# .github/workflows/example.yml
# One-line purpose.
# Trigger: push to main
# Auth:    GITHUB_TOKEN / secrets used
# Notes:   any gotchas (omit if none)
```

Delete any lines that don't apply (e.g. omit `Route:` for a utility library, omit `Notes:` if there's nothing worth saying).

---

## ⚠ MANDATORY: RUN CHECKS BEFORE EVERY COMMIT

Before committing ANY changes, run:

```bash
npm run check
```

This runs `tsc --noEmit` (type check) + `eslint . --max-warnings 0` (lint).

**If it fails, fix the errors before committing.** Do not push code that fails `npm run check`. Do not skip this step. Do not use `--no-verify`.

If you've changed multiple files, run the check after each logical change — don't batch 10 changes and discover 8 errors at the end.

Quick commands:
- `npm run typecheck` — TypeScript only (~15 seconds)
- `npm run lint` — ESLint only
- `npm run check` — both (run this before every commit)

Common errors to watch for:
- Missing imports after moving/renaming files
- Type mismatches when component props change
- Unused variables (ESLint)

---

## ⚠ MANDATORY: DB ACCESS AND AGENT WRITE GATE

Never use `createClient()` for database queries in server actions or server components.
The cookie-based client does NOT propagate auth to Postgres RLS — `auth.uid()` returns null,
causing silent empty results.

**Use the right helper for the right situation:**

```typescript
// Agent WRITE (any mutation — create, update, delete, state transition, AI action)
// Throws SubscriptionLockdownError (403) if org is paused or cancelled (ADDENDUM_57G)
import { requireAgentWriteAccess } from "@/lib/auth/server"

export async function createLease(formData: FormData) {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, userId, orgId } = gw
  // proceed — org is active and user is authenticated
}

// Agent READ (queries, exports, reads — no lockdown gate)
import { gateway } from "@/lib/supabase/gateway"     // server actions
import { gatewaySSR } from "@/lib/supabase/gateway"  // server components

export async function getLeases() {
  const gw = await gateway()
  if (!gw) return []
  const { db, orgId } = gw
  // reads always work regardless of subscription state
}

export default async function MyPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw
}
```

**Rules:**
- `requireAgentWriteAccess(action)` for ALL agent-side mutations — never bare `gateway()` on a write path
- `gateway()` for server action reads (not cached — one-shot)
- `gatewaySSR()` for server component reads (React.cache — deduplicates per render)
- Cron and webhook handlers: do NOT use `requireAgentWriteAccess` — they fire regardless of subscription state
- Tenant/landlord/supplier portal actions: use `getTenantSession()` — not subject to agent lockdown
- Every query MUST include `.eq("org_id", orgId)` — the service client bypasses RLS
- The only valid use of `createClient()` is for `auth.getUser()` — never for data queries. **Enforced by `pleks/no-cookie-client-from`** (ESLint): `.from()` on the cookie client hard-fails CI. ~75 pre-existing sites are grandfathered in `eslint-rules/no-cookie-client-from.baseline.json` and burning down via the caller-supplied-ID census — remove a file from that JSON as you fix it (the baseline only shrinks); a NEW violation anywhere else fails immediately.
- Always check `{ data, error }` from Supabase queries — never use `(data ?? [])` without logging `error` first
- `any` types leaking through (fix them, don't suppress)
- Missing `key` props in .map() renders

---

## ⚠ MANDATORY: CONVENTIONAL COMMIT MESSAGES

Every commit to `main` drives semantic-release. Release notes and version bumps
are generated from commit messages. Format matters.

**PR titles** (which become the squash-merged commit on `main`) MUST follow:

  <type>(<scope>)?: <subject>

Allowed types and their release effect:

| Type       | Release        | Use for                                     |
|------------|----------------|---------------------------------------------|
| `feat`     | minor          | New user-visible feature                    |
| `fix`      | patch          | Bug fix                                     |
| `perf`     | patch          | Performance improvement                     |
| `refactor` | no release     | Code change without behaviour change        |
| `chore`    | no release     | Tooling, config, dependency updates         |
| `docs`     | no release     | Documentation only                          |
| `test`     | no release     | Adding or fixing tests                      |
| `build`    | no release     | Build system or external deps               |
| `ci`       | no release     | CI/CD configuration                         |
| `style`    | no release     | Code style (not CSS) — whitespace, linting  |
| `revert`   | patch          | Revert a previous commit                    |

Breaking changes: add `!` after type (e.g. `feat!: rename /portal to /tenant`)
AND a `BREAKING CHANGE:` footer in the commit body explaining the migration.

Subject line: lowercase, imperative, under 72 chars, no trailing period.

Examples:
- `feat: add passkey enrolment to settings`
- `fix(auth): reject expired step-up challenges`
- `chore(deps): bump @supabase/ssr from 0.9.0 to 0.10.0`
- `feat!: move /portal URLs to /tenant`

The `pr-title` CI job rejects PRs whose titles don't match. PR titles can be
edited after opening — edit, don't force-push.

---

## ⚠ MANDATORY: VERSION-AWARE COMMITTING

This project uses **semantic-release** driven by GitHub. Every squash-merge to
`main` can create a GitHub Release and bump the version — so commit type is
a versioning decision, not just a label.

**Before every commit, ask:**
- Is this a user-visible new feature? → `feat` (minor bump)
- Is this fixing broken behaviour? → `fix` (patch bump)
- Is this internal cleanup with no behaviour change? → `refactor` / `chore` (no release)
- Does it break existing behaviour or URLs? → add `!` and a `BREAKING CHANGE:` footer

**Commit message discipline:**
- Subject line must be meaningful in a changelog: "fix contact form submit"
  not "fix stuff"
- Include scope when it narrows the blast radius: `fix(auth):`,
  `feat(billing):`
- Imperative mood: "add resolver-owned welcome" not "added" or "adds"
- Branch commits are squash-merged, so each branch PR = one changelog entry;
  write the PR title as the changelog line you want users to see

**GitHub Releases are the changelog.** Consumers of this repo (and Stéan
reviewing releases) read GitHub Releases to understand what shipped. Make
every commit title worth reading there.

---

## Git rhythm — when to commit, when to push

The remote history is documentation, not a save game. Each commit on `main`
should represent a complete, testable unit of work — not a stream of
micro-checkpoints. Each push should be a batch of commits that has been
locally verified green.

### What counts as one commit

A commit groups all the file changes needed for ONE coherent change to behave
correctly. The test:

- Could I revert this single commit and leave the repo in a working state?
- Does the message describe a real behavioural delta, or just "wip" / "more
  changes"?

**Interdependent files belong in ONE commit.** A type change in `decisions.ts`
that requires updates to `facts.ts` and `decisions.test.ts` is one commit, not
three. Splitting interdependent changes produces commits that don't typecheck
individually — useless for `git bisect` and noisy in review.

**Unrelated concerns in one file = multiple commits.** If a single file change
contains an auth fix AND a JSDoc tidy AND a style nit, stage them separately
with `git add -p` and commit them as three.

### What's NOT a commit

- Mid-implementation, code written but not tested. Not a commit yet.
- A fix attempt that hasn't been verified. Not a commit.
- "Just in case I lose my changes." Use `git stash` or a local WIP branch.
- Same logical change as the previous commit, with a tweak. **AMEND**
  (`git commit --amend`) — do not pile on `fix: oops` and `fix: oops again`.

### Push is a separate verb

Commit and push are different gates with different bars.

- Do not push after every commit. Push when a logical unit of work — usually
  one or several related commits — is COMPLETE and TESTED locally.
- Multiple commits pushed together is normal and good. Related work arrives
  on the remote as a coherent unit.

### Mandatory pre-push checklist

Before every `git push`, in order:

1. `npm run check:full` (typecheck + lint + tests + architecture audit + security:db) — **must be green**
2. For behavioural changes (routing, auth, UI, data): manually walk the
   affected flow in dev. Console errors count as failures.
4. Each commit message describes the actual change in imperative mood

If any step fails, fix it locally and **AMEND** the relevant commit before
pushing. Don't pile fix commits on top of broken commits — squash them in.

The current anti-pattern this kills: commit → push → see error → commit fix →
push → see error → commit fix → push. Each cycle is a partial deploy that
Vercel/Sentry/CI react to. The local gate is supposed to catch what the remote
was catching.

### Amend vs new commit

- **Amend** when fixing the SAME logical change you just committed but
  haven't pushed yet: typo in code you just wrote, missed a file, test
  failure that's clearly part of the change.
- **New commit** when the change is a different concern, even if it touches
  the same file.

Once a commit is pushed, treat it as immutable. Do not force-push to `main`.
A pushed commit with a problem is fixed forward with a new commit.

### Announce push intentions

For non-trivial work — anything spanning multiple commits, or any change
touching auth/routing/data — state the push intention in chat before
pushing:

> "Ready to push 3 commits: A, B, C. Verified locally: `npm run check`
> green, `npm test` green, walked the signup flow end-to-end with no
> console errors. OK to push?"

This gives Stéan a chance to say "hold, I want to walk it first" without
the work already being on the remote. Trivial commits (typo fixes, doc
tweaks, JSDoc-only changes) can skip this step.

### When tests genuinely can't run before push

Rare but real:
- Vercel preview deploys (env-specific endpoints, prod-only integrations)
- Supabase migrations that need to land remotely before code that uses them
- DNS / CSP / cookie behaviour that's domain-dependent

For these:
- Document in the commit body WHY local testing wasn't possible
- Mention in chat before pushing
- Never use "can't test locally" as a general escape hatch — 95%+ of changes
  can and should be tested before push

### What this looks like

Bad — current pattern:
fix: welcome_seen
fix: also reset on upsert
fix: privacy cookie httpOnly
fix: privacy cookie actually fix
fix: skeleton flicker
fix: skeleton wrong colour

Good — same work, properly batched and amended:
fix(auth): reset welcome_seen on upsert + privacy cookie client-readable
fix(onboarding): gate wizard on authChecked to kill type-selection flicker
fix(onboarding): replace bg-muted skeleton with warm-toned ob-skel

Three coherent commits, each testable and revertable, each describing a
real change. Pushed together as one batch after the pre-push checklist
came back green.

---

## ⚠ MANDATORY: SECURITY AUDIT BEFORE DEPLOYMENT

Before every deployment to production, run the full security audit:

```bash
npm run security
```

This runs across 15 security categories:
1. Unauthenticated table access (SELECT/INSERT/DELETE on all sensitive tables)
2. Cross-org data leakage
3. Gateway bypass / org_id injection
4. Public route token security
5. File storage access (bucket listing, predictable paths)
6. Security headers (CSP, X-Frame-Options, HSTS, etc.)
7. RLS policy audit (queries pg_policies — flags USING(true), missing WITH CHECK, RLS disabled)
8. Server action / API route auth — route census DERIVED from `app/api/**/route.ts` on disk (`scripts/security/route-census.mjs`), classified by the auth helper each route calls; probes every authenticated route without cookies + asserts census completeness (no ungated route outside the public allowlist)
9. Rate limiting on public routes
10. Webhook signature verification (sends forged payloads)
11. Secrets exposure (service key in NEXT_PUBLIC_, secrets in HTML)
12. IDOR (fake UUIDs on parameterised routes)
13. Audit-log integrity (canaries; raw-PII-in-values scan)
14. Audit behavioural coverage (drives each T1 past the gateway; separate `cat14-behavioural.mts`)
15. Server-action auth census — DERIVED from `"use server"` files on disk (`scripts/security/server-action-census.mjs`); asserts each module resolves the auth gate APPROPRIATE TO ITS LOCATION (app/(admin) → requireAdminAuth, else a recognized agent/portal gate) or is an explicit allowlist entry. Static (disk-only) — runs in `--ci`/`check:full`, so a new ungated server action hard-fails CI.

**Exit code 1 = CRITICAL findings = deployment blocked.**

**Workflow:**
- First time or after security fixes: `npm run security` (full — ~30s)
- Routine pre-deploy check: `npm run security:quick` (skips INSERT/DELETE and rate limit flood tests — ~10s)
- Single category debug: `node scripts/security/audit.mjs --category 7`

**Rules:**
- Zero critical findings before any deployment. No exceptions.
- If a finding is a false positive (e.g. `prime_rates` intentionally has no RLS because it's read-only public data), the correct fix is to add a read-only RLS policy (`USING (true)` for SELECT, block INSERT/UPDATE/DELETE) — not to remove the test.
- Never disable or skip categories to pass the audit.
- When adding new tables: add RLS + org_id policy immediately. The Category 7 audit will catch you if you forget.
- When adding new API routes: Category 8 auto-discovers them from disk — no list to update. Just gate the route with a recognized auth helper; a route with no gate that isn't a conscious public route FAILS the census until you add it to `PUBLIC_ALLOWLIST` (with a reason) in `route-census.mjs`.
- When adding new server actions (`"use server"`): Category 15 auto-discovers them — gate each with the helper appropriate to its location (`app/(admin)` → `requireAdminAuth`; agent → `requireAgentWriteAccess`/`gateway`; portal → `getTenantSession`), or add the file to `ACTION_ALLOWLIST` (with a reason) in `server-action-census.mjs`. A bare `gateway()` on an `app/(admin)` action FAILS — admin surfaces need the admin gate.
- When adding new webhook handlers: add signature verification from day one. Category 10 sends forged payloads.
- When adding new public routes: add them to the Category 9 rate limit test list.

**Prerequisites:**
- `npm run dev` must be running (Categories 3, 4, 6, 8–12 test localhost)
- The `get_rls_audit()` SQL function must exist in Supabase (see `scripts/security/setup-rls-audit.sql`)

Quick commands:
- `npm run security` — full audit (run before deploy)
- `npm run security:quick` — quick audit (routine check)

---

## BUILD SPECS — READ BEFORE IMPLEMENTING

All build specifications live in `brief/build/`. The master index is `brief/build/INDEX.md`. You can be referenced to as CC - Claude Code and CD - Claude Desktop, can be referenced as the architect / oversight that writes the builds and checks build completion for factual implementation, gaps that might have been created and bugs.

**Before implementing any spec, read the INDEX first** to understand the numbering and relationships. Addendums are named `ADDENDUM_{NN}{letter}_*` where `{NN}` references the parent build.

**After completing or making meaningful progress on any build or addendum, update `brief/build/INDEX.md`:**
- Change the status emoji (📝 → ✅, or note partial progress)
- Update the "Last updated" line at the top with today's date and a one-line summary
- Update the relevant row in the addendum/build table with what shipped, what's deferred, and any open work
- Update the "Known open work" paragraph if the build changes what's pending

**⚠ WHOLE-FILE RECONCILIATION — when you correct a status line, reconcile the WHOLE file in that same edit.**
Never fix only the line someone happened to notice. A spec file's status lives in its header, its
acceptance checklist, its open-decisions list, its sequencing notes and its inline "CC should…"
instructions — and they rot independently. Fixing one and leaving the rest is worse than fixing none,
because the file now *looks* reviewed.

This is not hypothetical: `ADDENDUM_62E`'s header said "Slice B awaiting build" for two months after
Slice B shipped. The header was corrected on 2026-08-15 — and the body still listed D-70-12 as a fix
to make, still had nine unticked acceptance boxes for shipped work, and still asked to "confirm Slice
A lands first". That stale file came within one grounding pass of sending ADDENDUM_62F off to rebuild
working code. When you touch a status claim: grep the file for `awaiting`, `not yet`, `CC should`,
`- [ ]`, `TODO`, and every decision marked open, and settle all of them or say explicitly why not.

**Verify before you tick.** A checkbox is a claim that something was confirmed. Confirm it against the
code — a commit message is evidence that work was attempted, not that it landed.

**⚠ ANCHOR EVERY GROUNDING CLAIM to the version you read.** When you write "the code does X" into a
spec or register, cite the commit SHA (or mtime/byte count for an untracked file) you read it
against. A grounding report is a photograph, not a standing fact, and it starts rotting immediately —
ADDENDUM_62F §13.0 went stale **within twelve minutes** because a concurrent edit fixed the thing it
described. An anchored claim can be cheaply re-checked; an unanchored one has to be re-derived from
scratch, and in the meantime it is indistinguishable from a current fact.

Two corollaries: **a spec claim carrying no version anchor is itself a finding** — flag it rather than
trusting it. And prefer dated/past-tense phrasing for observations ("as at `abc1234`, X was true")
over present tense ("X is true"), because present tense about another file's contents is false the
moment either file moves.

The distinction that makes this workable: **authored** sections assert intent and cannot be anchored;
**grounding** sections assert observation and must be. If it says the code *should* do X, no anchor.
If it says the code *does* X, anchor it.

**Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.

---

## TIER MODEL (post-April 2026 — locked)

Names, prices, lease caps → `lib/marketing/tiers.ts` (canonical) · cents → `lib/constants.ts`.

No per-user seat caps — **lease count is the only gate**. Annual pricing not live. Bespoke deferred.

---

## CURRENT WORK — WHERE TO LOOK

Do not rely on this file for task status. It changes daily.

**Before every session:**
1. Read `brief/build/INDEX.md` — source of truth for build status, queue order, 
   and all known open work
2. Check the "Latest shipped" and "Queue" lines at the top of INDEX.md
3. Check the "Known open work" section — items there are confirmed gaps that 
   need addressing, not future ideas
4. Read the actual spec file before implementing anything — never guess at intent
5. Read `brief/build/CURRENT.md` — session state. What step is active, 
   what was just done, what the next action is, any mid-build decisions.
   This is what INDEX.md cannot carry.

**How builds and addendums work:**
- Builds: `brief/build/BUILD_{NN}_{NAME}.md`
- Addendums: `brief/build/_ADDENDUM/ADDENDUM_{NN}{letter}_{NAME}.md`
- {NN} in an addendum references its parent build number
- CD (Claude Desktop) authors specs; CC (Claude Code - you) implements them
- After completing meaningful work, update INDEX.md: status emoji, 
  "Last updated" line, and any new open work discovered during implementation

**If a spec is ambiguous or conflicts with existing code:**
- Do not guess or fill in the gaps yourself
- Flag the ambiguity explicitly and stop — do not implement around it
- CD resolves architecture questions; CC implements confirmed decisions

---

## MAINTAINING CURRENT.md

`brief/build/CURRENT.md` is your working memory. It survives compaction because it is written to disk.

**Update it after every meaningful step — before committing:**
- Set "Active work" to the current build + step
- Move completed items into "Just completed" (one line each)
- Set "Next action" to the exact thing CC should do next
- Record any mid-build decisions not captured in the spec
- Record any files that should not be touched
- Record any bugs or issues discovered

**On compaction or new session:** read CURRENT.md first. It tells you where you are. Do not ask Stéan to re-explain — the answer is in the file.

---

## KEY CONSTANTS — WHERE THEY LIVE (never restated here)

`APPLICATION_FEE_CENTS` · `JOINT_APPLICATION_FEE_CENTS` · `INCOME_AFFORDABILITY_THRESHOLD`
→ `lib/constants.ts`. Open it; never trust a restatement.

Screening fee SSOT: `lib/constants.ts` (price) + `lib/screening/searchworxBundle.ts` (cost, margin —
all DERIVED). Bundle cost is R202.80 incl VAT, so R250 carries R47.20 (19%). Never hardcode a fee
literal — `lib/screening/__tests__/bundle-economics.test.ts` asserts no bundle is sold below cost.

**PRICING PRECEDENCE (Stéan ruling 2026-08-15).** When `brief/legal/SEARCHWORX_RATE_CARD.md` and
`brief/build/INDEX.md`/ADDENDUMs disagree about a DECISION — a bundle cancelled, a fee changed, a
product dropped — **INDEX/ADDENDUM wins.** The rate card is a supplier-pricing reference, not a
decision log, and its `updated:` date is the last EDIT, not the last ruling: it was edited 2026-07-10
still describing the Estate bundle as live, seven weeks after ADDENDUM_14E cancelled it. A later edit
date does not make a stale document authoritative. Supplier per-call prices remain the card's domain.
Estate + Huru + criminal screening are CANCELLED — Pleks sells one bundle.

**Citations must be verified, not plausible.** A fabricated SSOT reference is worse than none: it
survives review by looking rigorous. `grep` the cited file for the claim before citing it — a
zero-hit grep is the check (this is how `JOINT_APPLICATION_FEE_CENTS` was found citing a rate-card
section that never mentioned joint applications).

Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
(not ANON_KEY — match this exactly)

---

## SECURITY RULES (unchanged — still apply to any new code)

1. org_id on every new table — **one bounded exception: identity-scoped tables** (a row describing a
   HUMAN, read before `/switch-role` selects an org: `user_passkeys`, `passkey_challenges`,
   `passkey_aal_grants`). Membership test + cascade companion rule in
   `.claude/rules/identity-scoped-tables.md`. Do not invoke the exception without applying the test.
2. RLS on every new table
3. audit_log on every state change
4. consent_log for any new POPIA-sensitive operation
5. Encrypt before INSERT, decrypt after SELECT for high-value PII identifiers. The SA **`id_number`** is
   encrypted at rest everywhere (AES-256-GCM `iv:ct:tag`, random IV) via `idNumberColumns(raw)` /
   `encryptIdNumber(raw)` — the write helper bundles the ciphertext + a RAW-derived `id_number_hash` (the
   deterministic dedup/lookup key; match on the hash, NEVER on ciphertext). Decrypt with the TOLERANT
   `decryptIdNumber` at every read boundary. Enforced by `pleks/require-id-number-encryption` (ESLint). Also
   encrypted at rest: `passport_number`, `permit_number`, bank account numbers.
   **Intentionally PLAINTEXT (CD ruling 2026-07-07, POPIA-owner nod required before merge):** `date_of_birth`
   and `gender`. Rationale — the SA ID's first six digits already encode the DOB, so with `id_number` encrypted a
   separate DOB ciphertext is marginal, and `date_of_birth` is a `date` type used for age/affordability math
   (text-for-ciphertext breaks date arithmetic); `gender` is not POPIA "special personal information" and is
   low-cardinality (~3 values → encryption is theatre). This carve-out is a deliberate deviation from "all PII" —
   do not "fix" it by encrypting DOB/gender.
6. Mask before display — never show raw decrypted ID/account in UI (a lease *document* legitimately carries the
   full ID; a UI surface masks via `maskIdNumber`)
7. No PII in console.log, no PII in audit_log values
8. **`id_number_hash` is dedup + analytics ONLY — service-role only, never cross-org in any org-facing query
   path, and never under `app/`.** `hashIdNumber` salts with a single GLOBAL env var, not a per-org one, so the
   same human hashes identically in every organisation on the platform — it is already a cross-org identity key
   by construction. Today no caller resolves across orgs, but that is the *absence of a caller*, not a control.
   The moment an agent can see "this applicant also applied at another agency", Pleks has shipped a shared
   tenant blacklist: a different product, with a different consent basis and a different regulatory profile,
   built by accident. Enforced by `pleks/no-id-number-hash-in-app` (ESLint) — 3 pre-existing route handlers are
   baselined and burning down; a new site anywhere under `app/` fails immediately. Keep the lookup in `lib/`
   (`hashIdNumber` / `idNumberColumns` / the import identity matcher), org-scoped. **Never rotate the salt** —
   rotation breaks every historical join; if forced, version the column and dual-write through a transition.
   See `brief/build/SPEC_ANALYTICS_CAPTURE.md` §2.3.

---

## PATH-SCOPED RULES — .claude/rules/

Domain-specific instructions were moved out of this file into `.claude/rules/*.md` (2026-07-10, CD — CLAUDE.md was 60k chars and always-loaded). Each rule file carries `paths:` frontmatter and loads automatically when you read or edit a matching file. They carry the SAME authority as this file — lazy loading is a performance measure, not a demotion. Never duplicate their content back here; add new domain guidance as a new rule file, not a CLAUDE.md section.

Current set: migrations · schema-gotchas · supabase-queries · data-access · routing-auth · crons · ai-routing · comms-urls · billing-gates · inspections · finance-trust · fitscore · marketing-voice · legal-docs-jsx · domain-architecture · components.

---

## UNATTENDED SESSIONS — GATE SEQUENCING

Sequence push / prod-SQL / deploy actions at the END of a task: complete all local work (edits, tests, commits) first, so an unattended session parks at the approval gate with everything finished rather than stalling mid-flow. The PreToolUse hook (`.claude/hooks/bash-gate.js`) allows routine bash without prompting; `git push` and prod DB operations deliberately require approval — those gates are load-bearing, do not engineer around them.

---

## AGENT DELEGATION — USE SUBAGENTS FOR SCANS, KEEP MAIN CONTEXT FOR SYNTHESIS

Custom subagents live in `.claude/agents/`. Delegate to them PROACTIVELY — they run with their own context window, so repo-wide file dumps never pollute the main session:

- **census** (read-only, Sonnet) — any repo-wide count, search, classification, or find-all-usages. Never run a multi-file grep sweep inline; spawn census and receive the classified result.
- **grounder** (read-only, Sonnet) — at the START of every spec implementation: it maps the existing machinery the spec touches (helpers, tables + migration §, gates, SSOTs) so you extend instead of duplicate.
- **walker** (read-only, Opus) — before opening or un-drafting any PR: read-only adversarial review of the diff against origin.
- **implementer** (WRITE, Sonnet) — a PRE-SCOPED mechanical transform: a codemod, a migrate-these-N-sites sweep, a rename, a header/baseline fill. **Spawn it with `isolation: "worktree"`** so it edits an isolated copy and can run in parallel with you (or with a second implementer on a disjoint file set). It ends at `npm run check` green + a report; YOU commit and push (it never does). Give it the exact transform + scope — it returns the misfit "judgment sites" for you to decide, never guesses a mapping. This is the multitasking lever: hand off the mechanical bulk (this is what the 100-site item-5/6 migrations were), keep your context for the rule design and the judgment calls.
- **db-inspector** (read-only, Sonnet) — verify a live-data claim ("NULL on all three rows"), check schema/RLS/advisors before a migration, or read prod logs, so large query output stays out of your context. Every answer comes back with the query behind it. (Its `execute_sql` calls are read-only and sit behind the approval gate.)

Run INDEPENDENT work in parallel (multiple agents in one turn, `run_in_background` for true multitasking — you're notified on completion). Keep the main session for judgment and synthesis; push mechanical reading INTO census/grounder/db-inspector and mechanical writing INTO a worktree-isolated implementer. A task that starts with "first find all the places where..." is a census delegation by definition; a task that is "now apply this same change to all of them" is an implementer delegation. For a large fan-out (census → migrate → adversarially verify across many sites) the `Workflow` tool pipelines it deterministically — but that is opt-in (the user says "use a workflow" / "ultracode"), not a default.

---

## DO NOT DO

- Do not deploy without running `npm run security:quick` first
- Do not commit without running `npm run check` first
- Do not create new migration files — amend the existing domain file (see MIGRATIONS section)
- Do not use raw `CREATE POLICY` without `DROP POLICY IF EXISTS` first — it aborts the migration
- Do not apply ad-hoc SQL to the live DB — put it in the appropriate migration file instead
- Do not change existing RLS policies without flagging it
- Do not add new npm packages without checking if an existing
  package already covers the use case
- Do not use ANON_KEY — the correct env var is
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
- Do not build debit order or DebiCheck mandate features — Pleks reads bank statement matches only. Agencies hold mandates bank-side between themselves and their bank. Pleks is not in the payment flow.
- Do not split an extension migration across commits — when changing a file extension (.ts → .tsx, .js → .ts, etc.), delete the predecessor in the same commit that introduces the successor. A surviving .ts shadow alongside a new .tsx file causes TypeScript to resolve to the old interface (.ts takes priority over .tsx in module resolution), silently masking the extension and breaking builds downstream.