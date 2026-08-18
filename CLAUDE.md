# CLAUDE CODE INSTRUCTIONS
# Pleks
# Repository: github.com/sbouwer/pleks
<!-- Harness experiments: full results, protocols + re-run instructions in brief/build/EXPERIMENTS.md
     (E1 yes-observed · E1b NO, read-triggered · E2 yes, placement-dependent · E3 open).
     Re-run E1b/E2 on a Claude Code major upgrade before trusting rule scoping or marker invisibility. -->

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
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `check-file-headers.mjs` only fails on a `FILL:` stub NOT already in `file-headers.baseline.json`; touching a baselined file's body without filling its header leaves the file still baselined and still passing. Full sketch → **M-048** in `brief/build/MECHANISABLE.md`.
- **Update a file that already has a filled header** → update the header if the purpose, route, auth, or data source has changed.
  **UNENFORCEABLE** — requires judging whether the file's purpose/route/auth/data actually changed; no check reads header prose against code semantics.
- **Create a new file** → write the header filled in from the start. Never commit a `FILL:` stub. <!-- @enforced check:check-file-headers -->

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
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — sketch: scan filled headers for surviving literal placeholder text (e.g. "(omit if not a page)") and fail; nothing does today.

---

## ⚠ MANDATORY: RUN CHECKS BEFORE EVERY COMMIT

Before committing ANY changes, run:

```bash
npm run check
```

This runs `tsc --noEmit` (type check) + `eslint . --max-warnings 0` (lint).

**If it fails, fix the errors before committing.** Do not push code that fails `npm run check`. Do not skip this step. Do not use `--no-verify`.
**UNENFORCEABLE** — MECHANISABLE (rung: hook · blast: other) — same gap as the identical rule under DO NOT DO (twin, same mechanism, not re-annotated there). There is no pre-commit hook in this repo (no `.husky`, no `core.hooksPath`), so nothing stops a commit that fails `npm run check`. CI's `quick-check` job (`ci:quick-check`) runs `npm run check` but only after the commit exists, on the PR. Full sketch → **M-049** in `brief/build/MECHANISABLE.md`.

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

Never use `createClient()` for database queries in server actions or server components. <!-- @enforced eslint:pleks/no-cookie-client-from -->
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
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — twin of `.claude/rules/data-access.md:28`, same mechanism, not re-annotated there. The server-action census (Cat-15, `scripts/security/server-action-census.mjs`) only requires SOME recognized gate to be present (`requireAgentWriteAccess`, `gateway`, `gatewaySSR`, etc. are all interchangeable to it outside `app/(admin)`); it does not distinguish `gateway()` from `requireAgentWriteAccess`, nor a read path from a write path. A write silently gated with bare `gateway()` and no allowlist entry does NOT fail Cat-15, contrary to the "provably intentional" claim in `.claude/rules/data-access.md`. Full sketch → **M-011** in `brief/build/MECHANISABLE.md`.
- `gateway()` for server action reads (not cached — one-shot)
- `gatewaySSR()` for server component reads (React.cache — deduplicates per render)
- Cron and webhook handlers: do NOT use `requireAgentWriteAccess` — they fire regardless of subscription state
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `route-census.mjs` classifies a route as `cron`/`webhook` by path prefix or secret header, but nothing greps those same files for a `requireAgentWriteAccess(` call and fails if found. Full sketch → **M-037** in `brief/build/MECHANISABLE.md`.
- Tenant/landlord/supplier portal actions: use `getTenantSession()` — not subject to agent lockdown
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: auth) — `server-action-census.mjs`'s `expectedGateFamily()` only special-cases `app/(admin)/`; every other location (including portal routes) accepts ANY recognized gate, so a portal action gated with `gateway()` instead of `getTenantSession()` passes Cat-15 undetected. Full sketch → **M-031** in `brief/build/MECHANISABLE.md`.
- Every service-client `.update()` / `.upsert()` MUST include `.eq("org_id", orgId)` — the service client bypasses RLS <!-- @enforced eslint:pleks/require-org-scope-on-service-write -->
- Every service-client `.delete()` MUST include `.eq("org_id", orgId)` <!-- @enforced eslint:pleks/require-scope-on-delete -->
- Every service-client `.select()` MUST include `.eq("org_id", orgId)`
  **UNENFORCEABLE** — MECHANISABLE → **M-002** (twin: **M-014**, `.claude/rules/data-access.md:13`). The two rules above are baseline-limited (pre-existing sites grandfathered) and cover writes/deletes ONLY. Plain `.select()` reads have NO scoping check of any kind — an unscoped read is invisible to both rules and to Category 7. **This is the half that leaks.**
- The only valid use of `createClient()` is for `auth.getUser()` — never for data queries. **Enforced by `pleks/no-cookie-client-from`** (ESLint): `.from()` on the cookie client hard-fails CI. ~75 pre-existing sites are grandfathered in `eslint-rules/no-cookie-client-from.baseline.json` and burning down via the caller-supplied-ID census — remove a file from that JSON as you fix it (the baseline only shrinks); a NEW violation anywhere else fails immediately. (Same control as `eslint:pleks/no-cookie-client-from`, tagged above — not re-tagged here to avoid a double claim.)
- Always check `{ data, error }` from Supabase queries — never use `(data ?? [])` without logging `error` first <!-- @enforced eslint:pleks/require-supabase-error-check -->
- `any` types leaking through (fix them, don't suppress) <!-- @enforced eslint:@typescript-eslint/no-explicit-any -->
- Missing `key` props in .map() renders <!-- @enforced eslint:react/jsx-key -->

---

## ⚠ MANDATORY: CONVENTIONAL COMMIT MESSAGES

Every commit to `main` drives semantic-release. Release notes and version bumps
are generated from commit messages. Format matters.

**PR titles** (which become the squash-merged commit on `main`) MUST follow: <!-- @enforced ci:pr-title (required by main-protection ruleset) -->

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
**UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: other) — the `pr-title` job validates only the title's `type(scope): subject` grammar (`amannn/action-semantic-pull-request`, no `subjectPattern` configured); it does not check the PR/commit body for a `BREAKING CHANGE:` footer. `semantic-release` (the `release` job) parses the footer at RELEASE time to size the version bump, but that runs after merge — nothing blocks a `!` with no matching footer from merging. Full sketch → **M-052** in `brief/build/MECHANISABLE.md`.

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

**UNENFORCEABLE** — commit-boundary judgement (what is "one coherent change", whether a diff is genuinely interdependent) has no test derivable from a diff's shape alone; two unrelated one-line changes in the same file are textually indistinguishable from two interdependent ones.

### What's NOT a commit

- Mid-implementation, code written but not tested. Not a commit yet.
- A fix attempt that hasn't been verified. Not a commit.
- "Just in case I lose my changes." Use `git stash` or a local WIP branch.
- Same logical change as the previous commit, with a tweak. **AMEND**
  (`git commit --amend`) — do not pile on `fix: oops` and `fix: oops again`.

**UNENFORCEABLE** — "tested", "verified", "same logical change" are judgement calls about intent and completeness; git has no concept of "this commit represents a completed thought."

### Push is a separate verb

Commit and push are different gates with different bars.

- Do not push after every commit. Push when a logical unit of work — usually
  one or several related commits — is COMPLETE and TESTED locally.
- Multiple commits pushed together is normal and good. Related work arrives
  on the remote as a coherent unit.

**UNENFORCEABLE** — "complete and tested locally" before a push is a judgement the pusher makes; `hook:bash-gate` requires human approval on the `git push` invocation itself (a real, load-bearing gate — see UNATTENDED SESSIONS below) but does not verify any test suite ran first.

### Mandatory pre-push checklist

Before every `git push`, in order:

1. `npm run check:full` (typecheck + lint + tests + architecture audit + security:db) — **must be green**
   **UNENFORCEABLE** — MECHANISABLE (rung: hook · blast: other) — `check:full` exists and is genuinely strict when run (it chains `check`, `test:db`, `security:db`, `check-drift-if-sql-changed`), but nothing forces it to run before a push: it is not in `ci.yml` (CI's `db-tests` job, added 2026-08-17, now runs `test:db` and `security:db` as separate steps on the PR — a real, newer mitigation, but still POST-push/pre-merge, not the local pre-push gate this rule states, and it skips `check-drift-if-sql-changed`) and `hook:bash-gate` gates the push action on approval, not on this command's exit code. Full sketch → **M-051** in `brief/build/MECHANISABLE.md`.
2. For behavioural changes (routing, auth, UI, data): manually walk the
   affected flow in dev. Console errors count as failures.
   **UNENFORCEABLE** — a manual walkthrough leaves no artefact; "I walked it, no console errors" is asserted in chat, not verifiable after the fact.
4. Each commit message describes the actual change in imperative mood

If any step fails, fix it locally and **AMEND** the relevant commit before
pushing. Don't pile fix commits on top of broken commits — squash them in.
**UNENFORCEABLE** — amend-vs-new-commit discipline is a judgement call with no diff-shape signature.

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

**UNENFORCEABLE** — "same logical change" vs "different concern" is the same judgement call as commit granularity above; not derivable from a diff.

Once a commit is pushed, treat it as immutable. Do not force-push to `main`. (Same control as `hook:bash-gate`, tagged under UNATTENDED SESSIONS below — not re-tagged here to avoid a double claim; that hook's DENY list blocks force-push to any branch, a superset of "to main.")
A pushed commit with a problem is fixed forward with a new commit.

### Announce push intentions

**Push policy: announce intent, then push.** `hook:bash-gate` makes every push an
approval gate — the announcement is the *content* of that approval: what's in the
batch, what was verified, what to walk before it lands. Trivial commits (typo/docs)
skip the announcement, never the gate. Never push red; never force-push (hook-denied).

(The hook is tagged once, under UNATTENDED SESSIONS — not re-tagged here, or it would
register as a control claimed twice. This slot binds an existing practice to an existing
mechanism; it does not add a new one.)

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

**UNENFORCEABLE** — whether a given change genuinely couldn't be tested locally (vs. testing being skipped) is a judgement call; nothing distinguishes a legitimate "Vercel-preview-only" commit body from a rationalised one.

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
  **UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: data-boundary) — twin of the identical rule under DO NOT DO (`Do not deploy without running npm run security:quick first`), same mechanism, not re-annotated there. No gate blocks the actual deployment on this script's exit code; Vercel deploys on push independently of `npm run security`. Running it is a manual pre-deploy step, not a CI/deploy gate. Full sketch → **M-018** in `brief/build/MECHANISABLE.md`.
- If a finding is a false positive (e.g. `prime_rates` intentionally has no RLS because it's read-only public data), the correct fix is to add a read-only RLS policy (`USING (true)` for SELECT, block INSERT/UPDATE/DELETE) — not to remove the test.
  **UNENFORCEABLE** — "add a policy" vs "delete the finding" are both edits to files the audit doesn't distinguish by intent; nothing stops the latter.
- Never disable or skip categories to pass the audit.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: data-boundary) — sketch: a self-check asserting all 15 `catN_*` functions are invoked unconditionally in `main()`/`runCiMode()`, the same self-referential pattern this file's own `--selftest` uses.
- When adding new tables: add RLS + org_id policy immediately. The Category 7 audit will catch you if you forget. (Same control as `audit:cat7_rlsPolicyAudit`, tagged on SECURITY RULE 2 — not re-tagged here to avoid a double claim.)
- When adding new API routes: Category 8 auto-discovers them from disk — no list to update. Just gate the route with a recognized auth helper; a route with no gate that isn't a conscious public route FAILS the census until you add it to `PUBLIC_ALLOWLIST` (with a reason) in `route-census.mjs`. <!-- @enforced audit:cat8_serverActionAbuse -->
- When adding new server actions (`"use server"`): Category 15 auto-discovers them — gate each with the helper appropriate to its location (`app/(admin)` → `requireAdminAuth`; agent → `requireAgentWriteAccess`/`gateway`; portal → `getTenantSession`), or add the file to `ACTION_ALLOWLIST` (with a reason) in `server-action-census.mjs`. A bare `gateway()` on an `app/(admin)` action FAILS — admin surfaces need the admin gate. <!-- @enforced audit:cat15_serverActionAuth -->
- When adding new webhook handlers: add signature verification from day one. Category 10 sends forged payloads. <!-- @enforced audit:cat10_webhookSignatures -->
- When adding new public routes: add them to the Category 9 rate limit test list.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `PUBLIC_API_ROUTES` is hand-maintained (unlike Category 8's disk-derived census) and `cat9_rateLimiting` only floods `.slice(0, 2)` of it regardless of length, so nothing fails if a new public route is never added. Full sketch → **M-042** in `brief/build/MECHANISABLE.md`.

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

**UNENFORCEABLE** — no check compares shipped code against INDEX.md's claimed status; a stale INDEX entry is only found by a human (or grounder) re-reading it against the code.

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
**UNENFORCEABLE** — "reconcile the WHOLE file" requires reading and judging every section of a spec against current code; no check greps a touched spec file for stale phrases and fails.

**Verify before you tick.** A checkbox is a claim that something was confirmed. Confirm it against the
code — a commit message is evidence that work was attempted, not that it landed.
**UNENFORCEABLE** — confirming a checkbox against code is exactly the grounding work no automated check performs; this is the discipline the `grounder` subagent exists to apply, not something CI can verify after the fact.

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
**UNENFORCEABLE** — distinguishing an "authored" (intent) sentence from a "grounding" (observation) one, and checking the latter carries a SHA/mtime, both require reading prose for meaning — exactly what `check-claude-md.mjs`'s own header explains this file's approach refuses to do ("validates MARKERS ONLY — never prose").

**Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.
**UNENFORCEABLE** — whether a file was actually read (vs. guessed at) before code was written leaves no trace once the code is correct.

---

## TIER MODEL (post-April 2026 — locked)

Names, prices, lease caps → `lib/marketing/tiers.ts` (canonical) · cents → `lib/constants.ts`.
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — sketch: scan `app/**`/`lib/**` for tier-price/name/lease-cap-shaped literals (e.g. "R699", "R1,199", "R2,599", "R4,499", the lease-cap numbers 15/30/75/150) outside the two SSOT files, the way `no-rerolled-money-format`/`no-adhoc-dates` guard their own SSOTs.

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

**UNENFORCEABLE** — recognising ambiguity (vs. a confident, wrong reading) is exactly the judgement no static check performs; there is no artefact distinguishing "resolved a genuine ambiguity correctly" from "guessed and got lucky."

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

**UNENFORCEABLE** — nothing checks `CURRENT.md` was updated in step with the commits that landed alongside it; a stale `CURRENT.md` is caught only by the next session finding it wrong.

**On compaction or new session:** read CURRENT.md first. It tells you where you are. Do not ask Stéan to re-explain — the answer is in the file.

---

## KEY CONSTANTS — WHERE THEY LIVE (never restated here)

`APPLICATION_FEE_CENTS` · `JOINT_APPLICATION_FEE_CENTS` · `INCOME_AFFORDABILITY_THRESHOLD`
→ `lib/constants.ts`. Open it; never trust a restatement.
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — sketch: scan for a raw `25000`/`47000`/`0.30`-shaped literal outside `lib/constants.ts`, the way a `no-rerolled-*` rule guards its own SSOT. Same mechanism family as the tier-literal check above — could ship as one combined script.

Screening fee SSOT: `lib/constants.ts` (price) + `lib/screening/searchworxBundle.ts` (cost, margin —
all DERIVED). Bundle cost is R202.80 incl VAT, so R250 carries R47.20 (19%). Never hardcode a fee

- No bundle is sold below cost — asserted INSIDE the SSOT module, runs under `npm run check`. <!-- @enforced test:lib/screening/__tests__/bundle-economics.test.ts -->
- Never hardcode a fee literal at a CALL SITE — import `APPLICATION_FEE_CENTS` instead.
  **UNENFORCEABLE** — MECHANISABLE → **M-009**. The test above asserts price > cost WITHIN the SSOT module; it does not scan call sites. A call site writing `25000` rather than importing the constant would not fail it.

**PRICING PRECEDENCE (Stéan ruling 2026-08-15).** When `brief/legal/SEARCHWORX_RATE_CARD.md` and
`brief/build/INDEX.md`/ADDENDUMs disagree about a DECISION — a bundle cancelled, a fee changed, a
product dropped — **INDEX/ADDENDUM wins.** The rate card is a supplier-pricing reference, not a
decision log, and its `updated:` date is the last EDIT, not the last ruling: it was edited 2026-07-10
still describing the Estate bundle as live, seven weeks after ADDENDUM_14E cancelled it. A later edit
date does not make a stale document authoritative. Supplier per-call prices remain the card's domain.
Estate + Huru + criminal screening are CANCELLED — Pleks sells one bundle.
**UNENFORCEABLE** — resolving a conflict between two documents requires reading both and judging which one is the ruling; no check parses `SEARCHWORX_RATE_CARD.md` against `INDEX.md` for disagreement.

**Citations must be verified, not plausible.** A fabricated SSOT reference is worse than none: it
survives review by looking rigorous. `grep` the cited file for the claim before citing it — a
zero-hit grep is the check (this is how `JOINT_APPLICATION_FEE_CENTS` was found citing a rate-card
section that never mentioned joint applications).
**UNENFORCEABLE** — the rule names its own check ("a zero-hit grep is the check") but that grep is a manual step the author performs per-citation while writing; there is no CI gate that re-runs every citation's grep against the cited file and fails on a miss.

Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
(not ANON_KEY — match this exactly)
**UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: other) — twin of the "Do not use ANON_KEY" rule under DO NOT DO, same mechanism, not re-annotated there. `pleks/no-raw-process-env` blocks a raw read of ANY env var name outside `lib/env.ts`, so it happens to touch this one without knowing the string "ANON_KEY" — it would equally flag the correct name, and would miss a wrong alias declared inside `lib/env.ts` itself. Full sketch → **M-035** in `brief/build/MECHANISABLE.md`.

---

## SECURITY RULES (unchanged — still apply to any new code)

1. org_id on every new table — **one bounded exception: identity-scoped tables** (a row describing a
   HUMAN, read before `/switch-role` selects an org: `user_passkeys`, `passkey_challenges`,
   `passkey_aal_grants`). Membership test + cascade companion rule in
   `.claude/rules/identity-scoped-tables.md`. Do not invoke the exception without applying the test.
   **UNENFORCEABLE** — MECHANISABLE → **M-005**. Nothing inspects migration SQL for the column, so a new table with no `org_id` at all is invisible to Category 7 and to the org-scope ESLint rules (which govern app-code USAGE, not schema). The statement stays here because the rule is incident-class and a write-blind session must still see it; the membership test's detail lives in the rule file.
2. RLS on every new table <!-- @enforced audit:cat7_rlsPolicyAudit -->
3. audit_log on every state change
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — enforced for TWO tables only (`contact_bank_accounts`, `tenant_bank_accounts` — `pleks/require-audit-on-sensitive-mutation`). Leases, applications, properties, tenants and `user_orgs` role changes have NO mechanism requiring an audit row to exist. The rule as written claims far more coverage than exists. Full sketch → **M-004** in `brief/build/MECHANISABLE.md`.
4. consent_log for any new POPIA-sensitive operation
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — no rule or script references `consent_log` as a write requirement. Full sketch → **M-015** in `brief/build/MECHANISABLE.md`.
5. Encrypt before INSERT, decrypt after SELECT for high-value PII identifiers. <!-- @enforced eslint:pleks/require-id-number-encryption --> The SA **`id_number`** is
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
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — no check inspects JSX for a raw decrypted identifier reaching render. Full sketch → **M-016** in `brief/build/MECHANISABLE.md`.
   full ID; a UI surface masks via `maskIdNumber`)
7. No PII in console.log, no PII in audit_log values
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — the audit_log half is now partly structural (`recordAudit` sanitises, and denied keys are marked rather than dropped). The console.log half has NO control — there is no `no-console` rule configured and no PII-shaped-argument check. Full sketch → **M-017** in `brief/build/MECHANISABLE.md`.
8. **`id_number_hash` is dedup + analytics ONLY — service-role only, never cross-org in any org-facing query <!-- @enforced eslint:pleks/no-id-number-hash-in-app -->
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

Domain-specific instructions were moved out of this file into `.claude/rules/*.md` (2026-07-10, CD — CLAUDE.md was 60k chars and always-loaded). Each rule file carries `paths:` frontmatter <!-- @enforced check:check-rules-tracked --> and loads when you **READ** a matching file — **read-triggered ONLY, never on write** (E1b, measured 2026-08-18: Bash-editing a covered file summoned nothing; reading the same file summoned its rule instantly, and a `Write` creation summoned nothing either).

⚠ **This sentence used to say "read or edit". That was false**, and the experiment record proving it false was sitting invisibly in this same file — visible prose contradicting hidden evidence, where only the visible half instructs.

**The consequence is the architecture, not a footnote:** a session that edits without reading first receives NONE of these files. Since the `Edit` tool refuses to run without a prior `Read`, the uncovered paths are exactly Bash-mediated edits and `Write` creations — which is to say, coverage is proportional to the care already being taken. **Scoped files are guidance; they are never the sole holder of an incident-class rule.** Anything that must hold regardless needs a rung-1/2 twin (a hook or a check). They carry the SAME authority as this file *when loaded* — lazy loading is a performance measure, not a demotion, but "when loaded" is doing real work in that sentence. Never duplicate their content back here; add new domain guidance as a new rule file.
**UNENFORCEABLE** — "never duplicate content" is a semantic overlap judgement between two prose files; `check-rules-tracked.mjs` verifies each rules file is git-tracked and carries `paths:` frontmatter (tagged above) but does not compare content against CLAUDE.md.

Current set: migrations · schema-gotchas · supabase-queries · data-access · routing-auth · crons · ai-routing · comms-urls · billing-gates · inspections · finance-trust · fitscore · marketing-voice · legal-docs-jsx · domain-architecture · components.

---

## UNATTENDED SESSIONS — GATE SEQUENCING

Sequence push / prod-SQL / deploy actions at the END of a task: complete all local work (edits, tests, commits) first, so an unattended session parks at the approval gate with everything finished rather than stalling mid-flow.
**UNENFORCEABLE** — the ORDERING of actions within a session (local work before the gated action) is a planning choice with no artefact; only the final gated action itself is checkable (see next).

The PreToolUse hook (`.claude/hooks/bash-gate.js`) allows routine bash without prompting; `git push` and prod DB operations deliberately require approval — those gates are load-bearing, do not engineer around them. <!-- @enforced hook:bash-gate -->

---

## AGENT DELEGATION — USE SUBAGENTS FOR SCANS, KEEP MAIN CONTEXT FOR SYNTHESIS

Custom subagents live in `.claude/agents/`. Delegate to them PROACTIVELY — they run with their own context window, so repo-wide file dumps never pollute the main session:
**UNENFORCEABLE** — whether a task "should have" been delegated is a judgement about task shape; nothing in a transcript or diff fails when a repo-wide grep sweep was run inline instead of via `census`.

- **census** (read-only, Sonnet) — any repo-wide count, search, classification, or find-all-usages. Never run a multi-file grep sweep inline; spawn census and receive the classified result.
- **grounder** (read-only, Sonnet) — at the START of every spec implementation: it maps the existing machinery the spec touches (helpers, tables + migration §, gates, SSOTs) so you extend instead of duplicate.
- **walker** (read-only, Opus) — before opening or un-drafting any PR: read-only adversarial review of the diff against origin.
- **implementer** (WRITE, Sonnet) — a PRE-SCOPED mechanical transform: a codemod, a migrate-these-N-sites sweep, a rename, a header/baseline fill. **Spawn it with `isolation: "worktree"`** so it edits an isolated copy and can run in parallel with you (or with a second implementer on a disjoint file set). It ends at `npm run check` green + a report; YOU commit and push (it never does). Give it the exact transform + scope — it returns the misfit "judgment sites" for you to decide, never guesses a mapping. This is the multitasking lever: hand off the mechanical bulk (this is what the 100-site item-5/6 migrations were), keep your context for the rule design and the judgment calls.
  **UNENFORCEABLE** — "spawn with worktree isolation", "never guesses a mapping", "YOU commit, it never does" are behavioural constraints on how a subagent is invoked and how it reports; nothing outside the harness inspects a subagent invocation's parameters or its self-reported judgment-sites list for compliance.
- **db-inspector** (read-only, Sonnet) — verify a live-data claim ("NULL on all three rows"), check schema/RLS/advisors before a migration, or read prod logs, so large query output stays out of your context. Every answer comes back with the query behind it. (Its `execute_sql` calls are read-only and sit behind the approval gate.)

Run INDEPENDENT work in parallel (multiple agents in one turn, `run_in_background` for true multitasking — you're notified on completion). Keep the main session for judgment and synthesis; push mechanical reading INTO census/grounder/db-inspector and mechanical writing INTO a worktree-isolated implementer. A task that starts with "first find all the places where..." is a census delegation by definition; a task that is "now apply this same change to all of them" is an implementer delegation. For a large fan-out (census → migrate → adversarially verify across many sites) the `Workflow` tool pipelines it deterministically — but that is opt-in (the user says "use a workflow" / "ultracode"), not a default.

---

## DO NOT DO

- Do not deploy without running `npm run security:quick` first
  **UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: data-boundary) — twin of "Zero critical findings before any deployment" above, same mechanism, not re-annotated there: no gate blocks a Vercel deploy on this script having run or passed.
- Do not commit without running `npm run check` first
  **UNENFORCEABLE** — MECHANISABLE (rung: hook · blast: other) — twin of the identical rule under RUN CHECKS BEFORE EVERY COMMIT above, same mechanism, not re-annotated there. There is NO pre-commit hook in this repo (no .husky, no core.hooksPath, empty .git/hooks). CI catches it on the PR, after the commit exists. `--no-verify` has nothing to bypass.
- Do not create new migration files — amend the existing domain file (see MIGRATIONS section)
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: schema) — nothing counts migration files. `check-migration-forward-refs.mjs` checks reference ORDER inside the existing twelve; a thirteenth file would pass every gate. Full sketch → **M-006** in `brief/build/MECHANISABLE.md`.
- Do not use raw `CREATE POLICY` without `DROP POLICY IF EXISTS` first — it aborts the migration
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: schema) — zero scripts scan migration SQL for the pairing. Trivially mechanisable — a regex over `supabase/migrations/*.sql` asserting every `CREATE POLICY "name"` is preceded by a matching `DROP POLICY IF EXISTS "name"` — and worth doing, since the failure mode is a migration that aborts partway and silently leaves everything below it unapplied.
- Do not apply ad-hoc SQL to the live DB — put it in the appropriate migration file instead
  **UNENFORCEABLE** — MECHANISABLE (rung: hook · blast: data-boundary) — `check-schema-drift.mjs` can detect the RESULTING drift reactively (and only when someone runs it, or via `check:check-drift-if-sql-changed` in `check:full` — itself not CI-wired, see Git rhythm above), but nothing prevents the ad-hoc execution itself: the Supabase MCP's SQL execution is not gated by `hook:bash-gate`, which only inspects the Bash tool. Full sketch → **M-001** in `brief/build/MECHANISABLE.md`.
- Do not change existing RLS policies without flagging it
  **UNENFORCEABLE** — "flagging" is a chat act, not a repo state. The policy CHANGE is visible in the diff; the flagging is not checkable.
- Do not add new npm packages without checking if an existing
  package already covers the use case
  **UNENFORCEABLE** — requires judgement about functional overlap between packages. Not statically decidable.
- Do not use ANON_KEY — the correct env var is
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: other) — twin of the "Supabase key name" rule under KEY CONSTANTS above, same mechanism, not re-annotated there. `pleks/no-raw-process-env` catches a raw read of ANY env var outside
  `lib/env.ts`, which incidentally catches this one. It has no knowledge of the string "ANON_KEY"
  and would equally flag a raw read of the CORRECT name; if `lib/env.ts` itself aliased it, nothing
  would notice. A coincidental catch of a general pattern, not enforcement of this rule.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
- Do not import a payment-initiation SDK — Pleks reads bank statement matches only. Agencies hold mandates bank-side between themselves and their bank. Pleks is not in the payment flow. <!-- @enforced eslint:no-restricted-imports -->
- Do not hand-roll a debit-order / DebiCheck mandate flow out of ordinary Supabase writes.
  **UNENFORCEABLE** — MECHANISABLE → **M-010** (related: **M-012**, D-TRUST-01). The rule above forbids the named payment SDKs (`@stitch-money/*`, `ozow-sdk`, `snapscan*`, `@absa/banking-api`, `@standard-bank/payment-api`) repo-wide, but names no DebiCheck-specific package and cannot see a flow built from plain writes with no SDK import at all.
- Do not split an extension migration across commits — when changing a file extension (.ts → .tsx, .js → .ts, etc.), delete the predecessor in the same commit that introduces the successor.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — a check could fail on a `.tsx` whose stem matches a sibling `.ts`. The stated failure (TypeScript resolves to the stale `.ts`, masking the new file) is exactly the silent class that earns a check. A surviving .ts shadow alongside a new .tsx file causes TypeScript to resolve to the old interface (.ts takes priority over .tsx in module resolution), silently masking the extension and breaking builds downstream. Full sketch → **M-041** in `brief/build/MECHANISABLE.md`.