# CLAUDE CODE INSTRUCTIONS
# Pleks
# Repository: github.com/sbouwer/pleks

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
- `npm run check` — both, plus every gate script below (run this before every commit)
- `npm run test:db` — the DB-integration tier (needs the local Supabase docker stack up)
- `npm run schema:drift` — migrations vs LIVE production: functions, CHECKs, triggers, columns
- `npm run fuzz [cases]` — generated agency books through the importer's pure path (default 5 000)

`npm run check` runs these gates, each of which exists because something got through without it:
- `check-import-fields` — a field the agent can PICK, or a header can MAP to, that the runner never reads
- `check-server-action-exports` — a non-async export from a `"use server"` file (tsc and eslint pass; **only
  `next build` fails**, so this used to surface at DEPLOY)
- `check-csv-escaping` — a CSV emitter that does not route its cells through `escapeCsvCell` (formula injection)
- `check-file-headers`, `schema-contract-scan`, `check-audit-columns`, `check-pii-classification`

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

**Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.

---

## TIER MODEL (post-April 2026 — locked)

| Tier | Price | Lease limit |
|------|-------|-------------|
| Owner | Free | 1 |
| Steward | R699/mo | 15 |
| Growth | R1,199/mo | 30 |
| Portfolio | R2,599/mo | 75 |
| Firm | R4,499/mo | 150 |
| Bespoke | Custom | Custom |

No per-user seat caps on any tier — lease count is the only gate.
Annual pricing not yet live. Bespoke/white-label deferred until first enterprise customer.

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

## KEY CONSTANTS (unchanged — do not modify)

APPLICATION_FEE_CENTS = 39900         // R399
JOINT_APPLICATION_FEE_CENTS = 74900   // R749
INCOME_AFFORDABILITY_THRESHOLD = 0.30

Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
(not ANON_KEY — match this exactly)

---

## SECURITY RULES (unchanged — still apply to any new code)

1. org_id on every new table
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

---

## PATH-SCOPED RULES — .claude/rules/

Domain-specific instructions were moved out of this file into `.claude/rules/*.md` (2026-07-10, CD — CLAUDE.md was 60k chars and always-loaded). Each rule file carries `paths:` frontmatter and loads automatically when you read or edit a matching file. They carry the SAME authority as this file — lazy loading is a performance measure, not a demotion. Never duplicate their content back here; add new domain guidance as a new rule file, not a CLAUDE.md section.

Current set: migrations · schema-gotchas · supabase-queries · data-access · routing-auth · crons · ai-routing · comms-urls · billing-gates · inspections · finance-trust · fitscore · marketing-voice · legal-docs-jsx · domain-architecture · components.

---

## UNATTENDED SESSIONS — GATE SEQUENCING

Sequence push / prod-SQL / deploy actions at the END of a task: complete all local work (edits, tests, commits) first, so an unattended session parks at the approval gate with everything finished rather than stalling mid-flow. The PreToolUse hook (`.claude/hooks/bash-gate.js`) allows routine bash without prompting; `git push` and prod DB operations deliberately require approval — those gates are load-bearing, do not engineer around them.

---

---

---

## ⚠ MANDATORY: DOCUMENTATION SWEEP AFTER EVERY IMPLEMENTATION

**Before you call any piece of work done, sweep the docs.** Not "if it feels significant" — every time. The sweep
is cheap (a minute); a stale register is not, because the next session TRUSTS it and acts on it.

This is not hypothetical. `CURRENT.md` sat listing PR-IMP-1 … PR-IMP-7 as "NEXT" for days after every one of them
had shipped. The stale-register pattern has bitten repeatedly — enough that the standing rule already exists:
**verify any register item against the source before acting on it.** This section is the other half: *do not
leave the register wrong in the first place.*

### The sweep — walk all six, every time

| # | Surface | Ask |
|---|---|---|
| 1 | `brief/build/CURRENT.md` | Is the "Active work" / "Next action" still TRUE? **Delete what shipped** — this file carries OPEN items only. |
| 2 | `brief/build/INDEX.md` | Update the **Last updated** line + the build/addendum row. Status emoji 📝 → ✅. |
| 3 | `brief/build/OUTSTANDING.md` | **Close what is done.** Open-only register — no DONE tombstones. |
| 4 | `CLAUDE.md` (this file) | New command, gate script, ESLint rule, or doctrine? It belongs here. A gate nobody knows to run is not a gate. |
| 5 | `.claude/rules/*.md` | Did a domain rule change (migrations, data-access, crons, comms)? Rules load by path and carry the SAME authority as this file. |
| 6 | **Memory** (`~/.claude/.../memory/`) | Something learned that the code and git history do NOT record? A ruling, a why, a live-data fact, a trap. Then add the one-line pointer to `MEMORY.md`. |

### Also sweep the code's own documentation
- **File headers** — a purpose, route, auth or data source that CHANGED must be reflected. (`check-file-headers`
  enforces presence, not truth. Only you can do truth.)
- **The spec** (`brief/build/**`) — if the build DEVIATED from the spec, say so IN the spec and say WHY. A spec
  that quietly disagrees with the code is worse than no spec, because it will be trusted.
- **A comment you invalidated.** The comment that says "this is the only place it can be caught" is a lie the
  moment you add a second place.

### The test
> **If the next session read only the docs and never the diff — would they be misled?**

If yes, the work is not done. This applies to a one-line fix as much as a 3 000-line arc: the one-liner that
removes a gate, changes a default, or closes a register item is exactly the change nobody remembers to document.

---

## ⚠ TESTING DOCTRINE — two rules, both earned the hard way

The import-hardening arc found sixteen instances of one bug shape (*a write that fails, an error that is
swallowed, a caller that reports success*). By the end, **every remaining miss was a COVERAGE miss, not a logic
miss** — the code was locally correct and the PROOF had a hole exactly where the bug lived. These two rules are
what came out of that, and they outrank any individual fix.

### 1. PROBE-FIRES, OR IT IS THEATRE

**Every test, harness, corrupter, guard or detector must be SHOWN FAILING against the broken code before it is
allowed to pass.** A harness that cannot produce the failure the feature exists to handle is not a proof.

This is not a formality. It has caught, at minimum:
- a **crash client that failed WRITES** while the auto-retry it "proved" exists for **READ** failures — the
  claim and the proof never overlapped, and the retry was a trust-ledger duplication engine
- the same client then **THROWING**, when `supabase-js` **never throws** (it resolves to `{ data: null, error }`)
  — so the code was fail-closed *by accident* and the probe proved nothing
- a **corrupter that corrupted nothing** at 10% density, so every assertion passed vacuously
- a **drift detector** that printed "✓ No drift" while suppressing every enum CHECK in the schema
- a **fuzzer** that reported 5 912 failures which were all its own (it was asking the wrong function)

When a probe finds nothing, the FIRST hypothesis is that the probe is broken.

### 2. CENSUS, NOT SPOT-CHECK — a grep counts what you point it at

**Never report the size of a class from a grep of one idiom.** "10 guards fixed" was a count of the sites that
happened to log in the idiom just written; the real denominator was 14, and the two missed landlord guards would
have duplicated an owner's payout identity. The same shape produced "the minus sign is fixed" while the **plus**
(every E.164 phone number) shipped broken.

If you are fixing a CLASS, enumerate the class by what it IS (every lookup that gates an insert), not by how it
currently spells itself.

### Corollaries
- **No silent caps.** A bounded sweep (`.limit(2000)`, top-N, sampling) must SAY what it dropped, or "no match
  found" is indistinguishable from "no match found in the first two thousand".
- **Label what a tier proves.** The fuzz tier runs 50 000 books in 100 seconds and cannot see a `NOT NULL`, a
  `CHECK`, a trigger or a phantom column. "50 000 passed" is NOT "proven" — say so wherever the number appears.
- **A green test can be FALSE PROOF.** `deposit-pattern-a` passed for months against a function production has
  never had. Green means "the test ran"; it does not mean "the claim is true".

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