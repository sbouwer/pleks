# CLAUDE.md — Pleks

<!--
  Built from standards/CLAUDE-MD-STANDARD v4.5 (C:\dev\dev-standards).
  BINDING METRIC: the UNENFORCEABLE RATIO — N of D. N = rules whose only control is model
  attention; D = all marker-carrying rules, here AND in .claude/rules/*.md.
  N may only FALL and D may only RISE — both pinned in scripts/claude-md-ratio.ceiling.json.
  D is pinned because markers are required only in the tagged sections, so without a floor a rule
  could be MOVED into untagged prose and N would fall with the rule still unenforced.
  ADVISORY: ~250 visible lines. A tripwire for a ratchet pass, never a reason to relocate prose —
  aperture decides location, the count decides urgency. This file being over it is a signal that N
  is still high, not an instruction to hide prose in a scoped file. (The number itself is not
  restated here — it rots. `node scripts/check-claude-md.mjs` prints the current one.)
  MARKERS — the "### Enforced" heading (§4) and §5 hold ONLY marker-carrying bullets:
    @enforced <ns:id>          → inline comment at the END of the rule line (E2: inline SURVIVES,
                                 blocks like this one are stripped). Same-line placement is what
                                 binds the tag to its rule for the resolver.
    @enforced <ns:id>:shared   → one control legitimately enforcing several DISTINCT rules
    UNENFORCEABLE + reason     → visible prose; attention is the only control (the FLOOR)
    UNENFORCEABLE — MECHANISABLE → M-0NN → DEBT; the sketch lives in docs/MECHANISABLE.md
  Namespaces: audit: · check: · ci: · eslint: · hook: · test:
  Harness experiments: docs/EXPERIMENTS.md (E1 yes · E1b NO, read-triggered · E2 blocks stripped
  but inline tags survive · E3 YES, subagents skim). Re-run E1b/E2 on a Claude Code major upgrade.
  Audit: node scripts/check-claude-md.mjs (--selftest for its own fixtures).
-->

## 1 · START HERE

**Repo:** `c:\dev\pleks` · **Standards + lesson ledger:** `c:\dev\dev-standards` (its own repo).

**First moves, before touching code:**

```bash
git status                     # never assume this machine is current
git fetch && git log --oneline HEAD..origin/main
git pull
```

**Session state:** `brief/build/CURRENT.md` — what step is active, what was just done, the next
action, mid-build decisions. Read it before asking; it survives compaction because it is on disk.
**And WRITE it — after every meaningful step, before committing:** move finished items to "just
completed", set the next action to the exact thing to do, record mid-build decisions the spec does
not carry, files not to touch, and bugs found along the way. A file that is only ever read goes
stale in one session and then misleads the next.
`brief/build/INDEX.md` is the build-status source of truth and its "Known open work" is confirmed
gaps, not ideas. **`brief/` is a symlink to OneDrive and is NOT version-controlled** — anything the
tooling depends on belongs in the tracked tree instead.

**Check `c:\dev\dev-standards\ledgers\LESSONS.md` for open items naming this project.**

---

## 2 · WHAT THIS PROJECT IS, AND HOW TO REACH ITS SYSTEMS

South African residential property management: leases, tenants, applications, trust accounting,
maintenance, arrears. Next.js 16 + Supabase (Postgres, RLS) on Vercel. Multi-tenant by
`org_id`; POPIA governs every data path, and a voided statutory notice is worse than downtime.

| Server | Capability |
|--------|-----------|
| **GitHub** (`sbouwer/pleks`) | PRs, issues, CI runs, code search, branch management — **via the `gh` CLI, which is authenticated. There is no GitHub MCP server; do not look for `mcp__github__*` tools.** |
| **Supabase** | Execute SQL, apply migrations, get logs, list tables, check advisors |
| **Vercel** | List/check deployments, build logs, runtime logs, project info |
| **Figma** | Read designs, get screenshots, convert designs to code |
| **Gmail** | Search threads, create drafts (bouwer.stean@gmail.com) |
| **Google Calendar** | Read/create/update events |
| **Google Drive** | Read, search, and create files |

Default to using these instead of asking the user to copy-paste data. For example: check GitHub for open PRs rather than asking; check Vercel for deployment status rather than asking; query Supabase directly rather than asking for schema details.

---

## 3 · THE GATES

| Gate | Command |
|---|---|
| Before every commit | `npm run check` — enforced by `.githooks/pre-commit` |
| Before every push | `npm run check:full`, scoped by `scripts/prepush-scope.mjs` (the DB tier runs only when the diff touches it; CI runs it on every PR regardless) |
| Before every deploy | `npm run security` (`security:quick` for a routine check) |

**The deploy gate has two prerequisites, and without them it reports success while checking less
than it appears to.** `npm run dev` must be running — Categories 3, 4, 6 and 8–12 probe localhost,
so eight of the fifteen silently cannot fire without it. And `get_rls_audit()` must exist in
Supabase (`scripts/security/setup-rls-audit.sql`); Category 7 is the RLS policy audit and has
nothing to query without it.

**Push policy: announce intent, then push.** `hook:bash-gate` makes every push an approval gate —
the announcement is the *content* of that approval: what is in the batch, what was verified, what
to walk before it lands. Trivial commits (typo/docs) skip the announcement, never the gate. Never
push red; never force-push.

**Hook-denied** (`.claude/hooks/bash-gate.js`): force-push · `git reset --hard` · `rm -rf` on
root or home · `--no-verify`. **Hook-ask:** `git push` · `.env` files · prod database operations.
**Settings-ask twins** (`.claude/settings.json`, coarse, consulted when the hook is dead): the
Supabase MCP mutation tools. The MCP surface has its own gate, `.claude/hooks/mcp-ddl-gate.js`,
which shows the statement before asking.

Approval-gated actions sequence to the **END** of a task, so an unattended session parks at the
gate with everything finished. Run the check after each logical change, not after ten.
`--no-verify` bypasses the commit gate, which is why it is forbidden — and now denied outright,
because no gate downstream can see a hook that did not run. <!-- @enforced hook:bash-gate:shared -->
`git cherry-pick` and `git revert` run NEITHER `pre-commit` NOR `pre-merge-commit`; they are gated
by `.githooks/prepare-commit-msg`, which runs the chain unless a prior hook already approved this
exact tree. <!-- @enforced check:check-git-hooks:shared -->

---

## 4 · WHERE THE RULES LIVE

| Family | Where |
|---|---|
| ESLint rules | `eslint-rules/*.mjs` + `eslint.config.mjs`; baselines beside each rule |
| Checks | `scripts/check-*.mjs`, chained in `npm run check` — each named after the bug class it catches |
| Security audit | `scripts/security/audit.mjs` — 15 categories, route + server-action censuses derived from disk |
| Hooks + twins | `.claude/hooks/` + `.claude/settings.json` |
| Tests | `vitest` (`*.test.ts`) + the DB tier (`*.dbtest.ts`, needs Docker) |
| Commands | `.claude/commands/` — `/build` · `/walk` · `/wrap` |
| Rule files | `.claude/rules/*.md` — path-scoped domain guidance, one file per domain |
| Registers | `docs/MECHANISABLE.md` (build queue) · `docs/EXPERIMENTS.md` (harness results) |

(No counts — they are stats, stale by definition. The audit is the inventory.)

`.claude/rules/*.md` — every file carries `paths:` frontmatter and loads when you **READ** a
matching file. **Read-triggered ONLY, never on write** (E1b). A session that edits without reading
first receives NONE of them, so they are **guidance, never the sole holder of an incident-class
rule** — anything that must hold regardless needs a rung-1/2 twin. Same authority as this file when
loaded. Never duplicate their content here; add new domain guidance as a new rule file.

**Where a new rule goes — what does it cost the day the model ignores it once?** Annoyance → prose
here. Incident → a hook (one tool call's aperture, reaches every context) and/or a check
(whole-tree aperture, catches what lands anyway), plus probes — **probe first, both directions: a
planted violation must fail AND a known-good case must pass.** If it concerns one file, it goes in
that file as a comment, not here.

**Precedence:** mechanisms enforce, they don't assert. Prose contradicting a green check is stale
prose — report it, don't act on it.

**Allowlists and baselines are decision logs:** an entry means *read and classified*, never
*exempt*; every entry carries or points to its reason; they only shrink. Never widen one to make
CI green — that deletes the finding.

**A check's first number is a hypothesis, not a finding.** Classify per site before recording
anything: a first run of the migration check reported 27 violations of which 23 were legitimate
patterns it did not yet know.

**Coverage boundaries split the rule, never qualify the tag.** A rule half-covered by a control
becomes two bullets: the covered half tagged, the uncovered half its own line with an M-register
pointer.

### Enforced

<!-- ONLY marker-carrying bullets below this heading. A marker-less bullet here fails the audit. -->

- Never use `createClient()` for database queries in server actions or server components. <!-- @enforced eslint:pleks/no-cookie-client-from -->
- **PR titles** (which become the squash-merged commit on `main`) MUST be `<type>(<scope>)?: <subject>` — subject lowercase, imperative, under 72 chars, no trailing period. `feat` minor · `fix`/`perf`/`revert` patch · `refactor`/`chore`/`docs`/`test`/`build`/`ci`/`style` no release. `!` plus a `BREAKING CHANGE:` footer for a break. **The type is a versioning decision:** semantic-release cuts a GitHub Release from it, so never label tooling work `feat`. <!-- @enforced ci:pr-title (required by main-protection ruleset) -->
- Domain-specific instructions were moved out of this file into `.claude/rules/*.md` (2026-07-10, CD — CLAUDE.md was 60k chars and always-loaded). Each rule file carries `paths:` frontmatter <!-- @enforced check:check-rules-tracked --> and loads when you **READ** a matching file — **read-triggered ONLY, never on write** (E1b, measured 2026-08-18: Bash-editing a covered file summoned nothing; reading the same file summoned its rule instantly, and a `Write` creation summoned nothing either).
- The PreToolUse hook (`.claude/hooks/bash-gate.js`) allows routine bash without prompting; `git push` and prod DB operations deliberately require approval — those gates are load-bearing, do not engineer around them. <!-- @enforced hook:bash-gate:shared -->
- **Create a new file** → write the header filled in from the start. Never commit a `FILL:` stub. <!-- @enforced check:check-file-headers -->

TS/TSX format:
- Every service-client `.update()` / `.upsert()` MUST include `.eq("org_id", orgId)` — the service client bypasses RLS <!-- @enforced eslint:pleks/require-org-scope-on-service-write -->
- Every service-client `.delete()` MUST include `.eq("org_id", orgId)` <!-- @enforced eslint:pleks/require-scope-on-delete -->
- Every service-client `.select()` MUST include `.eq("org_id", orgId)` — the service client bypasses RLS, so nothing else bounds a read to the caller's organisation <!-- @enforced eslint:pleks/require-org-scope-on-service-read -->
  Cookie/browser-client reads are NOT in scope: RLS applies there and the filter would be redundant. Grandfathered sites live in the rule's baseline, which only shrinks; a read outside it fails immediately.
- Always check `{ data, error }` from Supabase queries — never use `(data ?? [])` without logging `error` first <!-- @enforced eslint:pleks/require-supabase-error-check -->
- `any` types leaking through (fix them, don't suppress) <!-- @enforced eslint:@typescript-eslint/no-explicit-any -->
- Missing `key` props in .map() renders <!-- @enforced eslint:react/jsx-key -->

- When adding new API routes: Category 8 auto-discovers them from disk — no list to update. Just gate the route with a recognized auth helper; a route with no gate that isn't a conscious public route FAILS the census until you add it to `PUBLIC_ALLOWLIST` (with a reason) in `route-census.mjs`. <!-- @enforced audit:cat8_serverActionAbuse -->
- When adding new server actions (`"use server"`): Category 15 auto-discovers them — gate each with the helper appropriate to its location (`app/(admin)` → `requireAdminAuth`; agent → `requireAgentWriteAccess`/`gateway`; portal → `getTenantSession`), or add the file to `ACTION_ALLOWLIST` (with a reason) in `server-action-census.mjs`. A bare `gateway()` on an `app/(admin)` action FAILS — admin surfaces need the admin gate. <!-- @enforced audit:cat15_serverActionAuth -->
- When adding new webhook handlers: add signature verification from day one. Category 10 sends forged payloads. <!-- @enforced audit:cat10_webhookSignatures -->
- No bundle is sold below cost — asserted INSIDE the SSOT module, runs under `npm run check`. <!-- @enforced test:lib/screening/__tests__/bundle-economics.test.ts -->
- org_id on every new table — **one bounded exception: identity-scoped tables** (a row describing a
   HUMAN, read before `/switch-role` selects an org: `user_passkeys`, `passkey_challenges`,
   `passkey_aal_grants`). Membership test + cascade companion rule in
   `.claude/rules/identity-scoped-tables.md`. Do not invoke the exception without applying the test.
   <!-- @enforced check:check-migration-integrity:shared -->
   The allowlist is read FROM that rule file, so the doc is the single source — no mirrored constant
   to drift. 29 pre-existing tables are baselined with a stated reason each; the baseline only shrinks.
- RLS on every new table <!-- @enforced audit:cat7_rlsPolicyAudit -->
- audit_log on every state change — **for the tables the rule covers** (`contact_bank_accounts`, `tenant_bank_accounts`, `leases`): a module that mutates one must write an audit row in the same module. <!-- @enforced eslint:pleks/require-audit-on-sensitive-mutation -->
- Encrypt before INSERT, decrypt after SELECT for high-value PII identifiers. <!-- @enforced eslint:pleks/require-id-number-encryption --> The SA **`id_number`** is
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
- **`id_number_hash` is dedup + analytics ONLY — service-role only, never cross-org in any org-facing query <!-- @enforced eslint:pleks/no-id-number-hash-in-app -->
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

- Do not commit without running `npm run check` first <!-- @enforced check:check-git-hooks:shared -->
- Do not create new migration files — amend the existing domain file (see MIGRATIONS section) <!-- @enforced check:check-migration-integrity:shared -->
  The file SET is asserted to be exactly the twelve named files — a thirteenth passed every other
  gate in this repo, since `check-migration-forward-refs` validates order WITHIN the twelve.
- Do not use raw `CREATE POLICY` without `DROP POLICY IF EXISTS` first — it aborts the migration <!-- @enforced check:check-migration-integrity:shared -->
  Two other idempotency patterns are accepted, because both are genuinely safe and classifying them
  per site is what kept this check honest: an `IF NOT EXISTS (SELECT 1 FROM pg_policies …)` guard
  naming the policy, and a dynamic `EXECUTE format('DROP POLICY IF EXISTS %I ON t', …)` loop over the
  table. 6 real consolidation defects are baselined — each DROPs old names and CREATEs a new one that
  is never dropped, so a re-run aborts. Fix is one `DROP POLICY IF EXISTS` line each.
- Do not apply ad-hoc SQL to the live DB — put it in the appropriate migration file instead <!-- @enforced hook:mcp-ddl-gate -->
- Do not import a payment-initiation SDK — Pleks reads bank statement matches only. Agencies hold mandates bank-side between themselves and their bank. Pleks is not in the payment flow. <!-- @enforced eslint:no-restricted-imports -->

---

## 5 · DOCTRINE THE MACHINE CANNOT HOLD

<!-- The visible budget, by design. MECHANISABLE → M-0NN entries are DEBT and leave via the
     register; plain UNENFORCEABLE entries are the FLOOR and leave approximately never. -->

- **Touch a file with a stub header (contains `FILL:`)** → fill it in before committing. Replace every `FILL:` line with real content; delete unused placeholder lines.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `check-file-headers.mjs` only fails on a `FILL:` stub NOT already in `file-headers.baseline.json`; touching a baselined file's body without filling its header leaves the file still baselined and still passing. Full sketch → **M-048** in `docs/MECHANISABLE.md`.
- **Update a file that already has a filled header** → update the header if the purpose, route, auth, or data source has changed.
  **UNENFORCEABLE** — requires judging whether the file's purpose/route/auth/data actually changed; no check reads header prose against code semantics.
- `requireAgentWriteAccess(action)` for ALL agent-side mutations — never bare `gateway()` on a write path
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — twin of `.claude/rules/data-access.md:28`, same mechanism, not re-annotated there. The server-action census (Cat-15, `scripts/security/server-action-census.mjs`) only requires SOME recognized gate to be present (`requireAgentWriteAccess`, `gateway`, `gatewaySSR`, etc. are all interchangeable to it outside `app/(admin)`); it does not distinguish `gateway()` from `requireAgentWriteAccess`, nor a read path from a write path. A write silently gated with bare `gateway()` and no allowlist entry does NOT fail Cat-15, contrary to the "provably intentional" claim in `.claude/rules/data-access.md`. Full sketch → **M-011** in `docs/MECHANISABLE.md`.
- Cron and webhook handlers: do NOT use `requireAgentWriteAccess` — they fire regardless of subscription state
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `route-census.mjs` classifies a route as `cron`/`webhook` by path prefix or secret header, but nothing greps those same files for a `requireAgentWriteAccess(` call and fails if found. Full sketch → **M-037** in `docs/MECHANISABLE.md`.
- Tenant/landlord/supplier portal actions: use `getTenantSession()` — not subject to agent lockdown
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: auth) — `server-action-census.mjs`'s `expectedGateFamily()` only special-cases `app/(admin)/`; every other location (including portal routes) accepts ANY recognized gate, so a portal action gated with `gateway()` instead of `getTenantSession()` passes Cat-15 undetected. Full sketch → **M-031** in `docs/MECHANISABLE.md`.

**Interdependent files belong in ONE commit.** A type change in `decisions.ts`
that requires updates to `facts.ts` and `decisions.test.ts` is one commit, not
three. Splitting interdependent changes produces commits that don't typecheck
individually — useless for `git bisect` and noisy in review.

- **Unrelated concerns in one file = multiple commits.** If a single file change
contains an auth fix AND a JSDoc tidy AND a style nit, stage them separately
with `git add -p` and commit them as three.
**UNENFORCEABLE** — commit-boundary judgement (what is "one coherent change", whether a diff is genuinely interdependent) has no test derivable from a diff's shape alone; two unrelated one-line changes in the same file are textually indistinguishable from two interdependent ones.

- Same logical change as the previous commit, with a tweak. **AMEND**
  (`git commit --amend`) — do not pile on `fix: oops` and `fix: oops again`.
**UNENFORCEABLE** — "tested", "verified", "same logical change" are judgement calls about intent and completeness; git has no concept of "this commit represents a completed thought."

- Multiple commits pushed together is normal and good. Related work arrives
  on the remote as a coherent unit.
**UNENFORCEABLE** — "complete and tested locally" before a push is a judgement the pusher makes; `hook:bash-gate` requires human approval on the `git push` invocation itself (a real, load-bearing gate — see UNATTENDED SESSIONS below) but does not verify any test suite ran first.

- `npm run check:full` (typecheck + lint + tests + architecture audit + security:db) — **must be green**
   **UNENFORCEABLE** — MECHANISABLE (rung: hook · blast: other) — `check:full` exists and is genuinely strict when run (it chains `check`, `test:db`, `security:db`, `check-drift-if-sql-changed`), but nothing forces it to run before a push: it is not in `ci.yml` (CI's `db-tests` job, added 2026-08-17, now runs `test:db` and `security:db` as separate steps on the PR — a real, newer mitigation, but still POST-push/pre-merge, not the local pre-push gate this rule states, and it skips `check-drift-if-sql-changed`) and `hook:bash-gate` gates the push action on approval, not on this command's exit code. Full sketch → **M-051** in `docs/MECHANISABLE.md`.
- For behavioural changes (routing, auth, UI, data): manually walk the
   affected flow in dev. Console errors count as failures.
   **UNENFORCEABLE** — a manual walkthrough leaves no artefact; "I walked it, no console errors" is asserted in chat, not verifiable after the fact.

- If any step fails, fix it locally and **AMEND** the relevant commit before
pushing. Don't pile fix commits on top of broken commits — squash them in.
**UNENFORCEABLE** — amend-vs-new-commit discipline is a judgement call with no diff-shape signature.

The current anti-pattern this kills: commit → push → see error → commit fix →
push → see error → commit fix → push. Each cycle is a partial deploy that
Vercel/Sentry/CI react to. The local gate is supposed to catch what the remote
was catching.

- **New commit** when the change is a different concern, even if it touches
  the same file.
**UNENFORCEABLE** — "same logical change" vs "different concern" is the same judgement call as commit granularity above; not derivable from a diff.

Once a commit is pushed, treat it as immutable. Do not force-push to `main`. (Same control as `hook:bash-gate`, tagged under UNATTENDED SESSIONS below — not re-tagged here to avoid a double claim; that hook's DENY list blocks force-push to any branch, a superset of "to main.")
A pushed commit with a problem is fixed forward with a new commit.

- Never use "can't test locally" as a general escape hatch — 95%+ of changes
  can and should be tested before push
**UNENFORCEABLE** — whether a given change genuinely couldn't be tested locally (vs. testing being skipped) is a judgement call; nothing distinguishes a legitimate "Vercel-preview-only" commit body from a rationalised one.

- Zero critical findings before any deployment. No exceptions.
  **UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: data-boundary) — twin of the identical rule under DO NOT DO (`Do not deploy without running npm run security:quick first`), same mechanism, not re-annotated there. No gate blocks the actual deployment on this script's exit code; Vercel deploys on push independently of `npm run security`. Running it is a manual pre-deploy step, not a CI/deploy gate. Full sketch → **M-018** in `docs/MECHANISABLE.md`.
- If a finding is a false positive (e.g. `prime_rates` intentionally has no RLS because it's read-only public data), the correct fix is to add a read-only RLS policy (`USING (true)` for SELECT, block INSERT/UPDATE/DELETE) — not to remove the test.
  **UNENFORCEABLE** — "add a policy" vs "delete the finding" are both edits to files the audit doesn't distinguish by intent; nothing stops the latter.
- Never disable or skip categories to pass the audit.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: data-boundary) — sketch: a self-check asserting all 15 `catN_*` functions are invoked unconditionally in `main()`/`runCiMode()`, the same self-referential pattern this file's own `--selftest` uses.
- When adding new public routes: add them to the Category 9 rate limit test list.
  **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — `PUBLIC_API_ROUTES` is hand-maintained (unlike Category 8's disk-derived census) and `cat9_rateLimiting` only floods `.slice(0, 2)` of it regardless of length, so nothing fails if a new public route is never added. Full sketch → **M-042** in `docs/MECHANISABLE.md`.

**Prerequisites:**
- Update the "Known open work" paragraph if the build changes what's pending
**UNENFORCEABLE** — no check compares shipped code against INDEX.md's claimed status; a stale INDEX entry is only found by a human (or grounder) re-reading it against the code.

**⚠ WHOLE-FILE RECONCILIATION — when you correct a status line, reconcile the WHOLE file in that same edit.**
Never fix only the line someone happened to notice. A spec file's status lives in its header, its
acceptance checklist, its open-decisions list, its sequencing notes and its inline "CC should…"
instructions — and they rot independently. Fixing one and leaving the rest is worse than fixing none,
because the file now *looks* reviewed.

- This is not hypothetical: `ADDENDUM_62E`'s header said "Slice B awaiting build" for two months after
Slice B shipped. The header was corrected on 2026-08-15 — and the body still listed D-70-12 as a fix
to make, still had nine unticked acceptance boxes for shipped work, and still asked to "confirm Slice
A lands first". That stale file came within one grounding pass of sending ADDENDUM_62F off to rebuild
working code. When you touch a status claim: grep the file for `awaiting`, `not yet`, `CC should`,
`- [ ]`, `TODO`, and every decision marked open, and settle all of them or say explicitly why not.
**UNENFORCEABLE** — "reconcile the WHOLE file" requires reading and judging every section of a spec against current code; no check greps a touched spec file for stale phrases and fails.

- **Verify before you tick.** A checkbox is a claim that something was confirmed. Confirm it against the
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

- The distinction that makes this workable: **authored** sections assert intent and cannot be anchored;
**grounding** sections assert observation and must be. If it says the code *should* do X, no anchor.
If it says the code *does* X, anchor it.
**UNENFORCEABLE** — distinguishing an "authored" (intent) sentence from a "grounding" (observation) one, and checking the latter carries a SHA/mtime, both require reading prose for meaning — exactly what `check-claude-md.mjs`'s own header explains this file's approach refuses to do ("validates MARKERS ONLY — never prose").

- **Read the actual source files before writing code.** Do not guess at the current state of a file — read it. This is non-negotiable.
**UNENFORCEABLE** — whether a file was actually read (vs. guessed at) before code was written leaves no trace once the code is correct.

- CD resolves architecture questions; CC implements confirmed decisions
**UNENFORCEABLE** — recognising ambiguity (vs. a confident, wrong reading) is exactly the judgement no static check performs; there is no artefact distinguishing "resolved a genuine ambiguity correctly" from "guessed and got lucky."

- Record any bugs or issues discovered
**UNENFORCEABLE** — nothing checks `CURRENT.md` was updated in step with the commits that landed alongside it; a stale `CURRENT.md` is caught only by the next session finding it wrong.

**On compaction or new session:** read CURRENT.md first. It tells you where you are. Do not ask Stéan to re-explain — the answer is in the file.

- Never hardcode a fee literal at a CALL SITE — import `APPLICATION_FEE_CENTS` instead.
  **UNENFORCEABLE** — MECHANISABLE → **M-009**. The test above asserts price > cost WITHIN the SSOT module; it does not scan call sites. A call site writing `25000` rather than importing the constant would not fail it.

- **PRICING PRECEDENCE (Stéan ruling 2026-08-15).** When `brief/legal/SEARCHWORX_RATE_CARD.md` and
`brief/build/INDEX.md`/ADDENDUMs disagree about a DECISION — a bundle cancelled, a fee changed, a
product dropped — **INDEX/ADDENDUM wins.** The rate card is a supplier-pricing reference, not a
decision log, and its `updated:` date is the last EDIT, not the last ruling: it was edited 2026-07-10
still describing the Estate bundle as live, seven weeks after ADDENDUM_14E cancelled it. A later edit
date does not make a stale document authoritative. Supplier per-call prices remain the card's domain.
Estate + Huru + criminal screening are CANCELLED — Pleks sells one bundle.
**UNENFORCEABLE** — resolving a conflict between two documents requires reading both and judging which one is the ruling; no check parses `SEARCHWORX_RATE_CARD.md` against `INDEX.md` for disagreement.

- **Citations must be verified, not plausible.** A fabricated SSOT reference is worse than none: it
survives review by looking rigorous. `grep` the cited file for the claim before citing it — a
zero-hit grep is the check (this is how `JOINT_APPLICATION_FEE_CENTS` was found citing a rate-card
section that never mentioned joint applications).
**UNENFORCEABLE** — the rule names its own check ("a zero-hit grep is the check") but that grep is a manual step the author performs per-citation while writing; there is no CI gate that re-runs every citation's grep against the cited file and fails on a miss.

- Supabase key name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
(not ANON_KEY — match this exactly)
**UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: other) — twin of the "Do not use ANON_KEY" rule under DO NOT DO, same mechanism, not re-annotated there. `pleks/no-raw-process-env` blocks a raw read of ANY env var name outside `lib/env.ts`, so it happens to touch this one without knowing the string "ANON_KEY" — it would equally flag the correct name, and would miss a wrong alias declared inside `lib/env.ts` itself. Full sketch → **M-035** in `docs/MECHANISABLE.md`.

   - The REST of "every state change" — `applications`, `properties`, `tenants`, `user_orgs` role changes — still has no mechanism.
     **UNENFORCEABLE** — MECHANISABLE → **M-004**. Those tables are dominated by ROUTINE traffic — draft autosave, consent and document touches, a widget dismissal, a last-seen write — so a table-level rule over them reports mostly noise, which is why `user_orgs` was excluded from this rule on day one. Auditing the *sensitive subset* needs finer-than-table-level detection: a different mechanism, not a longer table list. The measurement behind that, and the classification of every site, live in the register entry.
- consent_log for any new POPIA-sensitive operation
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — no rule or script references `consent_log` as a write requirement. Full sketch → **M-015** in `docs/MECHANISABLE.md`.
- Mask before display — never show raw decrypted ID/account in UI (a lease *document* legitimately carries the
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — no check inspects JSX for a raw decrypted identifier reaching render. Full sketch → **M-016** in `docs/MECHANISABLE.md`.
   full ID; a UI surface masks via `maskIdNumber`)
- No PII in console.log, no PII in audit_log values
  **UNENFORCEABLE** — MECHANISABLE (rung: eslint · blast: data-boundary) — the audit_log half is now partly structural (`recordAudit` sanitises, and denied keys are marked rather than dropped). The console.log half has NO control — there is no `no-console` rule configured and no PII-shaped-argument check. Full sketch → **M-017** in `docs/MECHANISABLE.md`.
- **implementer** (WRITE, Sonnet) — a PRE-SCOPED mechanical transform: a codemod, a migrate-these-N-sites sweep, a rename, a header/baseline fill. **Spawn it in the MAIN CHECKOUT — do NOT use `isolation: "worktree"`** (E10: a worktree is created from `origin/main`, not your HEAD, so on any feature branch the agent transforms a different tree from yours and its green gate proves nothing about yours). What isolation was standing in for is better served by a rung-1 control, and it now covers BOTH halves of the rule: **an implementer may only write inside its declared scope, and no subagent may create or publish a commit** — the hook matches `Bash` as well as the edit tools and denies `commit`/`merge`/`rebase`/`cherry-pick`/`revert`/`am`/`push`, leaving read-only git and the main session untouched. Both checked per tool call on `agent_type`. <!-- @enforced hook:agent-write-scope --> It ends at `npm run check` green + a report; YOU commit and push. Give it the exact transform + scope — it returns the misfit "judgment sites" for you to decide, never guesses a mapping. This is the multitasking lever: hand off the mechanical bulk (this is what the 100-site item-5/6 migrations were), keep your context for the rule design and the judgment calls.
  **Worktree isolation remains available for exactly one case** — two implementers running in parallel on DISJOINT file sets, on `main`, with artefact paths passed absolute — chosen explicitly each time, never inherited from a recommendation.
  **UNENFORCEABLE** — the "never guesses a mapping" half, and the judgment-sites report. Nothing inspects a subagent's self-reported list of misfits for completeness or honesty: an agent that silently guessed a mapping and reported nothing is textually identical to one that found no misfits. Not mechanisable from a diff — the evidence is what the agent chose not to say.
- Do not deploy without running `npm run security:quick` first
  **UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: data-boundary) — twin of "Zero critical findings before any deployment" above, same mechanism, not re-annotated there: no gate blocks a Vercel deploy on this script having run or passed.
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
- Do not hand-roll a debit-order / DebiCheck mandate flow out of ordinary Supabase writes.
  **UNENFORCEABLE** — MECHANISABLE → **M-010** (related: **M-012**, D-TRUST-01). The rule above forbids the named payment SDKs (`@stitch-money/*`, `ozow-sdk`, `snapscan*`, `@absa/banking-api`, `@standard-bank/payment-api`) repo-wide, but names no DebiCheck-specific package and cannot see a flow built from plain writes with no SDK import at all.
- Do not split an extension migration across commits — delete the predecessor in the SAME commit that introduces the successor. A surviving `.ts` shadow makes TypeScript resolve every unextended import to the stale file, silently masking the new one. **All eight spellings are covered**: `.ts`/`.tsx`, the js-family (`.js`/`.jsx`/`.mjs`/`.cjs`) and the multi-extension pair (`.mts`/`.cts`) — the two bullets this rule was split into are rejoined, because the coverage boundary that justified the split is gone. Case-only collisions (`Card.ts` beside `card.tsx`) are reported as a separate class, because the remedy is a rename, not a delete. <!-- @enforced check:check-extension-stem-pairs -->
  Two claims the old text carried are NOT restated here, because M-063's build could not establish either. **`allowJs` is on** (verified in `tsconfig.json`), so a `foo.js` beside a new `foo.ts` is a real shape — but that webpack resolves `.js`/`.mjs` *ahead* of `.ts`/`.tsx` was **not verifiable from this repository** (no override, upstream default only), and the js-family half being the "more dangerous" one has **no live surface today**: all 81 js-family files sit in `scripts/`, `eslint-rules/`, `.claude/hooks/`, postcss and supabase, with **zero** under `app/`, `lib/` or `components/`. The check is a ratchet against the first one that lands there, not a response to an existing hazard. Detection is deliberately **symmetric**, not directional, for the same reason.
- **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — sketch: scan filled headers for surviving literal placeholder text (e.g. "(omit if not a page)") and fail; nothing does today.
- **UNENFORCEABLE** — MECHANISABLE (rung: ci · blast: other) — the `pr-title` job validates only the title's `type(scope): subject` grammar (`amannn/action-semantic-pull-request`, no `subjectPattern` configured); it does not check the PR/commit body for a `BREAKING CHANGE:` footer. `semantic-release` (the `release` job) parses the footer at RELEASE time to size the version bump, but that runs after merge — nothing blocks a `!` with no matching footer from merging. Full sketch → **M-052** in `docs/MECHANISABLE.md`.
- **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — sketch: scan `app/**`/`lib/**` for tier-price/name/lease-cap-shaped literals (e.g. "R699", "R1,199", "R2,599", "R4,499", the lease-cap numbers 15/30/75/150) outside the two SSOT files, the way `no-rerolled-money-format`/`no-adhoc-dates` guard their own SSOTs.
- **UNENFORCEABLE** — MECHANISABLE (rung: check · blast: money) — sketch: scan for a raw `25000`/`47000`/`0.30`-shaped literal outside `lib/constants.ts`, the way a `no-rerolled-*` rule guards its own SSOT. Same mechanism family as the tier-literal check above — could ship as one combined script.
- **UNENFORCEABLE** — "never duplicate content" is a semantic overlap judgement between two prose files; `check-rules-tracked.mjs` verifies each rules file is git-tracked and carries `paths:` frontmatter (tagged above) but does not compare content against CLAUDE.md.
- **UNENFORCEABLE** — the ORDERING of actions within a session (local work before the gated action) is a planning choice with no artefact; only the final gated action itself is checkable (see next).
- **UNENFORCEABLE** — whether a task "should have" been delegated is a judgement about task shape; nothing in a transcript or diff fails when a repo-wide grep sweep was run inline instead of via `census`.

---

## 6 · SCARS

<!-- Outside any budget. Narrative stays while un-mechanised; once mechanised it moves to a
     comment at the site and one citation line remains. -->

- **2026-07-06 · cross-org IDOR on caller-supplied ids.** An agent in org A could mutate org B's
  row by passing a foreign uuid — the service client bypasses RLS, so a uuid alone is not an
  isolation boundary. → `eslint:pleks/require-org-scope-on-service-write` · `require-scope-on-delete`
- **2026-08-19 · the same class on READS.** Writes and deletes were guarded; reads were not, and a
  cross-org read *leaks rather than corrupts*, so nothing broke and nothing drew attention.
  → `eslint:pleks/require-org-scope-on-service-read`
- **2026-08-19 · the rule written to close that hole did not run on the surface that mattered.**
  Its service-client test omitted `requireAgentWriteAccess`, which returns the same RLS-bypassing
  client, so it silently skipped 63 files — 40 with reads — on the canonical agent-write surface.
  **Every probe passed**, because each exercised a file the discriminator already recognised.
  A probe suite confirms the cases you thought of; it cannot report the class you did not. Caught
  by adversarial review, and the reason a new control gets one before it is believed.
- **2026-07-02 · the site-content hole.** A write gated with bare `gateway()` was
  indistinguishable from a write whose gate was forgotten. Narrative in `.claude/rules/data-access.md`.
- **Payout-banking fraud vector (F1).** Swapping a bank account left no who/when.
  → `eslint:pleks/require-audit-on-sensitive-mutation`
- **`inviteTenant` returned a 90-day tenant session URL** into the agent dashboard with a copy
  button. Its two siblings returned `{ success: true }`; **the return type was the security
  boundary and TypeScript cannot see it — a string is a string.** Two of three siblings were
  checked and "the invite paths" declared safe. Narrative in `.claude/rules/lint-rules.md`.
- **A `CREATE POLICY` pairing scan reported 328, then 29, then 21** unpaired policies across three
  rebuilds, misclassifying a known-good file every time; root cause a `\s` degrading to `s` inside
  a template literal. It was left **unmeasured** rather than publish a fourth number.
  → `check:check-migration-integrity`, built probe-first with a fixture copied from a real migration.
- **Migrations that abort halfway.** A `CREATE POLICY` with no preceding `DROP POLICY IF EXISTS`
  fails on re-run with `42710` and silently leaves everything below it unapplied.

---

## 7 · AGENTS

| Agent | For | Access |
|---|---|---|
| `grounder` | Before writing code: map the machinery a task touches | read-only |
| `census` | Repo-wide counts / find-all-usages, returned **classified** | read-only |
| `db-inspector` | Live-data claims; every answer carries its query | read-only, SELECT |
| `implementer` | Pre-scoped mechanical transform; returns misfit judgment sites | write (scope-gated per `agent_type`), **main checkout — NOT `isolation: worktree`** (E10), never commits |
| `walker` | Adversarial pre-PR review — tries to **refute** | read-only |

Mechanical reading → the read-only three. Mechanical writing → the implementer, **in your own
checkout**. Judgment stays in the main session. **Every agent claim about the tree carries the SHA
it observed** — the anchor rule of §8, applied to agents, and the thing that would have caught E10
in any isolation mode. Subagents DO receive this file (E3) but a narrow-task agent skims it,
and rung-4 rule files never reach an edit-blind session (E1b) — presence is not enforcement.

**Classify per site, never sweep.** Two sites identical to twenty-five others were correct for a
reason invisible to the regex.

---

## 8 · SESSION HYGIENE

**Read the actual source files before writing code.** Non-negotiable — and reading is also what
summons the scoped rules (E1b).

**Anchor grounding claims** to the version read. *Does X* → anchor, past tense. *Should X* → no
anchor. An unanchored observation is itself a finding. **This file states intent; it does not carry
observations about the tree** — no counts, no "as at" states. Those rot. Name the artefact instead.

**Whole-file reconciliation** on any status correction — grep `awaiting`, `TODO`, `- [ ]`, `CC
should`, and settle all or say why not. A partially-fixed file looks reviewed.

**Verify before you tick.** A commit message proves attempt, not landing.

**Citations verified, not plausible** — a zero-hit grep is the check. Build the destination before
citing it.

**Commit ≠ push.** One coherent revertable change; interdependent files together; amend un-pushed
fixes; pushed commits are immutable — fix forward. Reasoning about *the change* → commit message.
Reasoning about *the code's shape*, false leads included → a comment at the site.

Each message describes a real behavioural delta in imperative mood — never "wip" or "more changes".
The test for one commit: could I revert exactly this and leave the repo working?

**Never author a pattern through a shell string.** Backslashes do not survive `node -e`, heredocs
or template literals; a corrupted regex produces a plausible-but-wrong artefact. Write the script
to a file with an editor.

**Ambiguous spec, or spec-vs-code conflict:** flag it and stop. Do not implement around it.

**TOKEN COST IS TURN COUNT × CONTEXT SIZE. Output is noise.** Measured over one 6,653-turn session:
6M output, 31M cache-write, **3.0 BILLION cache-read** — every turn re-sends the whole conversation,
so at 600k of context a one-line `grep` costs the same ~60k as a large edit. Three consequences, in
order of how much they save:
- **`/compact` when a NEW TASK starts**, not when the window fills. One compaction took per-turn
  context 941k → 324k, cutting every later turn ~3×. Nothing else comes close, and no hook can do
  it for you — `PreCompact` fires when a compaction is already happening.
- **Batch independent tool calls into ONE message.** Reads, greps and writes that do not depend on
  each other are one turn, not five. 351 Bash turns in one working window were the single largest
  line item.
- **Pipe long command output** (`| tail`, `| grep`) — a commit's full check chain is ~15k chars and,
  unpiped, is re-sent on every subsequent turn until compaction.
`.claude/hooks/context-budget.js` re-injects the live figure on every prompt, from outside the
conversation, so this cannot fall out of context or go stale. <!-- @enforced hook:context-budget -->

---

## 9 · PROJECT SLOTS

**SSOTs — never restate values here:**

| What | File |
|---|---|
| Tier names, prices, lease caps | `lib/marketing/tiers.ts` (cents in `lib/constants.ts`) |
| Screening bundle cost + margin | `lib/screening/searchworxBundle.ts` — all DERIVED, never a literal |
| Application/joint fees, affordability threshold | `lib/constants.ts` |
| Screening cost + margin (all derived) | `lib/screening/searchworxBundle.ts` |
| Dates, business days, SA public holidays | `lib/dates/*` |
| Audit writes · money format · property label | `recordAudit` · `formatZAR` · `formatPropertyLabel` |
| Env access | `lib/env.ts` |

**File header format** (every `.ts` / `.tsx` / `.yml`, filled from the start — the rule is in §4):

```ts
/**
 * app/path/to/file.tsx — one-line purpose
 *
 * Route:  /the/url        (omit if not a page)
 * Auth:   what gate protects it
 * Data:   where data comes from
 * Notes:  gotchas or non-obvious decisions (omit if none)
 */
```

YAML uses the same fields as `#` comments with a `Trigger:` line. Delete lines that don't apply;
never leave the parenthetical hints in a real header.

**What does not live in code:** the Supabase publishable key is
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — **not** `ANON_KEY`; the old name is a
misdocumented trap that reads as correct. `brief/` is a OneDrive symlink outside version control.

**Tier gating: NO per-user seat caps on any tier — lease count is the only gate.** A product rule,
not a value, so the SSOT table above cannot carry it. Annual pricing is not live; bespoke and
white-label are deferred.

**Pricing precedence (Stéan ruling 2026-08-15):** when `brief/legal/SEARCHWORX_RATE_CARD.md` and
`brief/build/INDEX.md`/ADDENDUMs disagree about a DECISION, **INDEX/ADDENDUM wins** — the rate card
is a supplier-pricing reference, not a decision log. Estate + Huru + criminal screening are
CANCELLED; Pleks sells one bundle.

**Migrations:** twelve domain files, amend-forward only. Never create a thirteenth; never amend
`007`/`008`. Detail in `.claude/rules/migrations.md`.

<!--
  MAINTENANCE (stripped, free)
  Intake on every incident — stop at the first structural yes:
    name the bug CLASS → hook? (+twin +probes) → check? (+probes) → either way, the reasoning
    (false leads included) to a comment at the site → single-file? that file only → cross-cutting?
    a scoped rule file → global or unenforceable? here, visibly (MECHANISABLE → M-register if
    buildable) → portable? dev-standards/ledgers/LESSONS.md with Applied: lines (a date or n/a: — never
    "pending").
  Probe-first, both directions, before version one. A never-matching pattern reports 100% clean;
  tool failure and catastrophic finding are the same output, and partial fixes make the number MORE
  believable. Probes cannot travel through the channel the control inspects — fixtures on disk, and
  seed at least one known-good fixture by COPYING a real instance out of the tree.
  A measurement window too small deforms the document into its shape, then manufactures passes from
  the deformation. A conditional gate can be structurally always-false in the stage it runs in.
  Deletion is never justified on budget grounds alone: stripped content was never in the budget.
  Ratchet each release: report N of D + both deltas, and the M-register depth + delta.
  Full contract: C:\dev\dev-standards\standards\CLAUDE-MD-STANDARD.md
-->

