# CONTROL-AIM AUDIT — is each control pointed where its class lives?

**Task:** CD, 2026-08-21 (`brief/build/OUTSTANDING.md` §control-aim audit). **Run:** 2026-08-22.
**Anchored at `5ddbaee1`** — every observation below was read against that commit. Re-derive before
trusting any row that has since been touched.

## What this asks, and what it does NOT ask

> *"Does this control reduce risk, or feel rigorous?"*

**This is not a probe pass.** A probe proves a control CAN fire. This asks whether it is POINTED
where the class lives. Those are different questions, and the second had never been asked here.

| Verdict | Meaning (CD's definitions) |
|---|---|
| **AIMED** | the class can occur inside the control's scope |
| **MISAIMED** | the class occurs OUTSIDE its scope |
| **NO-CLASS** | the failure it guards has never occurred here and plausibly cannot |

**Nothing is deleted on the strength of this document.** MISAIMED and NO-CLASS both need a ruling.
A NO-CLASS control may be a correct ratchet against a class that has not arrived yet — that is what
`check-extension-stem-pairs` is — and NO-CLASS is not a synonym for "remove it".

### Why a sweep, and not more care

Three findings this month are all this shape, and **each was found by accident rather than by
looking**:

- `pleks/require-org-scope-on-service-read`'s discriminator omitted `requireAgentWriteAccess`, so it
  skipped 63 files on the canonical agent-write surface. **Every probe passed.**
- The statusline read `{"type":"mode"}` — cardinality 1 across 1735 records, a constant rather than a
  state — and rendered a permanent red on the only always-visible surface.
- `sonarjs/super-linear-regex` was configured, then pointed away from `.claude/hooks/**` by
  `globalIgnores`. It flagged two live patterns the moment the ignore was lifted.

In each case **the control was green and the class was uncovered.** Nothing in the gate can report
that: a control cannot check its own aim.

---

## PART 0 · The inventory is derived, not recalled

Counting matters here — an audit that silently misses a family reports safety it did not check, which
is the very defect it is auditing. So the inventory is machine-derived and its derivation is stated:

| Family | How enumerated | Count |
|---|---|---|
| ESLint — local `pleks/*` rules | `ls eslint-rules/*.mjs`, excluding `__tests__` | 21 |
| ESLint — config-level restrictions | read of `eslint.config.mjs` blocks | 6 blocks |
| Gate scripts | regex over **every** `package.json` script value | 50 paths, 34 in `check` |
| Hooks | `ls .claude/hooks/*.js` | 4 |
| Security audit categories | `grep '^async function cat'` + `cat14`/`cat15` | 15 |
| Wired test tiers | `vitest` + `vitest.db.config.ts` | 2 |

**The first enumeration was wrong and is worth recording.** A `scripts/[a-z0-9-]+\.(mjs|mts)` regex
missed every nested path, dropping `scripts/security/audit.mjs`, `cat14-behavioural.mts`,
`check-pii-classification.mts` and `trust-sovereignty-parity.mts` — i.e. **the entire security
family** — from the inventory of an audit about missed coverage. Caught by re-deriving rather than by
review. Same class as everything below.

---

## PART 1 · TWO CONFIG-LEVEL FINDINGS — these outrank any individual rule row

A per-rule table implicitly assumes the rules are pointed at the tree. Two blocks in
`eslint.config.mjs` decide that for all 21 at once, so they are audited first.

### 1.1 🟥 MISAIMED — `scripts/**` is ignored as *"not production code"*, and four of its files say otherwise in their own headers

`eslint.config.mjs:55-56` ignores `scripts/**` with the stated reason **"Dev-only utility scripts —
not production code."** That reason is false for at least four tracked files, each of which declares
production intent in its own header and holds a service-role key:

| File | Its own header says | Service-role? |
|---|---|---|
| `scripts/encrypt-existing-pii.ts` | *"the highest-risk, IRREVERSIBLE operation in the PII programme"* · *"Run ONCE per environment"* | yes |
| `scripts/migrate-totp-host-claims.ts` | *"Run once after deploying ADDENDUM_AUTH_RESOLVER to production"* | yes |
| `scripts/backfill-insurance-checklists.ts` | *"Run once on 60A go-live"* | yes |
| `scripts/nuke-user.mjs` | deletes a user + all their data, cascade loop | yes, **plus a management PAT** |

**This is the `sonarjs` finding again, one directory over.** `.claude/**` was ignored for the same
stated reason — "not production code" — and that reason had stopped being true the moment the hooks
became security controls. `eslint.config.mjs:57-69` now carries a long, correct note explaining
exactly that, **for `.claude/` only.** The identical premise sitting nine lines above it was not
re-examined.

Rules thereby pointed away from service-role, production-touching code:
`require-org-scope-on-service-read` · `require-org-scope-on-service-write` · `require-scope-on-delete`
· `require-supabase-error-check` · `no-popia-raw-delete` · `require-id-number-encryption` ·
`no-raw-audit-log-insert` · `no-raw-process-env` · `no-restricted-imports` (payment SDKs).

**⚠ The remedy is NOT "lint `scripts/**`" — classify per site first.** Several of these exclusions are
correct *on the merits* and would be wrong to enforce:

- `encrypt-existing-pii.ts` **must** handle raw `id_number` values — it IS the encryption
  implementation, so `require-id-number-encryption` would be backwards there.
- The one-off migrations are **deliberately platform-wide**; `.eq("org_id", …)` would defeat them.
- `nuke-user.mjs`'s raw delete is the point of the script.

**That is exactly the finding.** Every one of those is a defensible per-file judgement — and *none of
them is recorded anywhere*. A blanket directory ignore makes "deliberately exempt" and "never
examined" the same state, which is the property this repo already rejects for allowlists and
baselines: *an entry means read-and-classified, never exempt.* `scripts/**` is an allowlist with 54
entries and no reasons.

**Ruling needed** — see PART 4, item R1.

### 1.2 🟡 NEEDS A RULING — the two org-scope rules disagree about three surfaces, and both surfaces are live

`require-org-scope-on-service-write.mjs:49` and `require-org-scope-on-service-read.mjs:136` carry
near-identical `SKIP_PATH` regexes. They differ in three places, and nothing in either file explains
the difference:

| Surface | WRITE rule | READ rule | Live sites at `5ddbaee1` |
|---|---|---|---|
| `app/api/applications/**` | **skipped** | **covered** | 16 files, **8** with a service client |
| `lib/admin/**`, `components/admin/**` | **covered** | **skipped** | 21 files, **8** with a service client |

So today: a *read* in `lib/admin` needs no org filter but a *write* there does; a *write* in
`api/applications` needs none but a *read* does. **Both asymmetries are populated** — this is not a
theoretical gap in an empty directory.

One of the two is probably right and the other is probably drift, but **which way is a judgement about
the isolation model, not something the code answers.** Note the direction of risk is not symmetric:
the 2026-08-19 scar is precisely that reads were left uncovered because *a cross-org read leaks rather
than corrupts, so nothing breaks and nothing draws attention.* That argues the READ rule's two extra
skips deserve the harder look.

**Ruling needed** — see PART 4, item R2.

---

## PART 2 · ESLint — the 21 local `pleks/*` rules

Scope for all 21 is `files: ["**/*.ts", "**/*.tsx"]` (`eslint.config.mjs:128`), minus `globalIgnores`.

**One scope fact checks out cleanly and is worth stating, because it is the one that could have been
silently false:** `**/*.ts(x)` does not match `.mts`/`.cts`/`.js`/`.jsx`/`.mjs`/`.cjs`. Measured at
`5ddbaee1` — **`app/`, `lib/` and `components/` contain 965 `.tsx` and 925 `.ts` files and ZERO files
of any other code extension.** So the glob covers 100% of the app surface, and
`check-extension-stem-pairs` is the ratchet against the first js-family file that lands there.
**AIMED**, and the coverage is measured rather than assumed.

### 2.1 How "can the class occur here?" was evidenced

Three evidence sources, in descending strength. **The column says which was used**, because "AIMED"
backed by a live probe and "AIMED" backed by a docstring are not the same claim:

- **`probe`** — a violation was planted in a real file on the guarded surface and the rule fired.
  Done via a temporary `lib/__aim_probe__.ts`, linted and deleted in one command.
- **`baseline`** — the baseline is populated. **A populated baseline is proof the class occurs in
  scope**, since every entry is a real site someone classified.
- **`scar`** — the class is recorded in CLAUDE.md §6 as having actually happened here.

**An EMPTY baseline is not evidence of aim in either direction**, and this is the trap that made the
probes necessary. Twelve of the fifteen baselines are now empty arrays. Empty + green gate is equally
consistent with *"burned down to zero"* and *"the rule silently stopped firing"* — the mis-derived
`relPath` failure that `.claude/rules/lint-rules.md` names as failure mode #1. So the empty-baseline
rules were probed rather than assumed.

**Probe result:** `no-raw-process-env` and `no-adhoc-dates` both fired on planted violations. Their
`~150`-site and multi-site baselines are **genuinely burned down**, not disabled. That is a real
result and it is the good news in this section.

### 2.2 🟥 MISAIMED — `no-inline-app-url` is defeated by a one-hop alias, and a live instance exists

The rule matches a `TemplateLiteral` whose expressions include an **`Identifier` literally named**
`APP_URL` or `MARKETING_URL` (`no-inline-app-url.mjs:48`). Assigning the constant to any other name
first walks straight past it.

This is not hypothetical. `app/api/paia-manual-pdf/route.ts` does exactly that, twice over:

```ts
const rawAppUrl = APP_URL                                  // alias 1
const fontBase = !rawAppUrl || rawAppUrl.startsWith("http://localhost")
  ? "https://app.pleks.co.za" : rawAppUrl                  // alias 2
…
{ src: `${fontBase}/fonts/InterTight-Regular.ttf`, … }     // interpolation — NOT flagged
```

**The site itself is benign** — `@react-pdf`'s `Font.register` cannot fetch from localhost during
SSR, so falling back to the production origin is deliberate and correct. Classified, not swept.

**What it demonstrates is the bypass**, and the bypass is reachable by the most ordinary refactor
there is: extract a variable. The rule's docstring anticipated the bare read — *"Reading them bare
(`const origin = APP_URL`) is fine"* — but not bare-read-then-interpolate, which is the same inline
URL construction through one hop. Its baseline is empty, so the surface currently reads as fully
migrated; the empty baseline and the alias blindness compound.

**⚠ A hypothesis I had to withdraw, recorded because the withdrawal is the lesson.** I first planted
a hardcoded `"https://app.pleks.co.za/dashboard"` string, saw nothing fire, and had written this up
as a broken rule. **It is not** — the rule's stated class is *interpolation of the env constant*, not
a hardcoded origin, and it is correctly aimed at that. The plant was the wrong class. *A control that
does not fire on the wrong violation is working.*

### 2.3 🟡 A COVERAGE BOUNDARY, not a defect — the hardcoded origin has no control at all

That withdrawn hypothesis left a genuine gap behind. `no-inline-app-url`'s own rationale names three
failures — *"one site double-slashes, another forgets the leading `/`, **a third hardcodes the origin
next to it**"* — and the rule detects only the first two. Nothing covers the third.

Live plain-string `"https://app.pleks.co.za"` sites, **classified per site**:

| Site | Verdict |
|---|---|
| `lib/env.ts:33` | **legitimate** — the SSOT's own canonical default. By definition it is the one place the literal belongs. |
| `lib/auth/passkeys/rp-config.ts:19` | **legitimate** — WebAuthn `rpId` must be a bare registrable domain and `origin` an exact match. `absoluteUrl()` cannot express either, and indirection on a security-critical exact-match would be a downgrade. |
| `app/api/paia-manual-pdf/route.ts:20` | **legitimate** — the deliberate localhost→prod font fallback above. |
| 2 × test files | out of scope |

**Zero defects — and that is the finding, not a clean bill.** Per CLAUDE.md, *"coverage boundaries
split the rule, never qualify the tag"*: the covered half is enforced, the uncovered half needs its
own line and an M-register pointer. Today the docstring claims a scope the rule does not have.
Whether the third failure is worth a control is a judgement — all three live sites are legitimate, so
the true-positive rate of a naive origin-literal rule would currently be **0%**, and per
`lint-rules.md` *"a test with 20 false positives gets an allowlist with 20 entries and then means
nothing."* **Recommendation: do not build it; narrow the docstring instead.**

### 2.4 🟢 NO-CLASS (latent, correctly so) — `no-rerolled-money-format` knows one spelling

The rule requires a `.toLocaleString("en-ZA", { …FractionDigits })` shape
(`no-rerolled-money-format.mjs:50-53`). `new Intl.NumberFormat("en-ZA", { style: "currency", currency:
"ZAR" })` is the same operation in a spelling it does not know — the *"single-spelling pattern
measures a false zero"* trap, failure mode #2 in `lint-rules.md`.

**Measured at `5ddbaee1`: `Intl.NumberFormat` appears ZERO times under `app/`, `lib/`, `components/`.**
So the gap is **latent, not live** — the rule is aimed at the spelling that actually occurred (its
header records ~16 re-rolled copies). Recorded so the next author extending it knows the second
spelling exists; **not a finding, and not a reason to touch the rule.**

### 2.5 The remaining rules

Every rule below is scoped `**/*.ts(x)` minus `globalIgnores`, so **§1.1 applies to all of them** and
is not repeated per row.

| Rule | Evidence | Verdict |
|---|---|---|
| `require-org-scope-on-service-read` | `baseline` (80 entries) + `scar` (2026-08-19, twice) | **AIMED** — see §1.2 for the skip asymmetry |
| `require-org-scope-on-service-write` | `scar` (2026-07-06 cross-org IDOR) | **AIMED** — see §1.2 |
| `require-scope-on-delete` | `scar` (same 2026-07-06 incident) | **AIMED** |
| `require-audit-on-sensitive-mutation` | `baseline` (8 entries) + `scar` (payout-banking F1) | **AIMED** |
| `no-raw-process-env` | **`probe` — fired** | **AIMED**, baseline genuinely at zero |
| `no-adhoc-dates` | **`probe` — fired** | **AIMED**, baseline genuinely at zero |
| `no-inline-app-url` | `probe` — see §2.2 | **MISAIMED** (alias bypass, live instance) |
| `no-rerolled-money-format` | `probe` — see §2.4 | **AIMED** at the live spelling |
| `no-cookie-client-from` · `no-popia-raw-delete` · `no-direct-resend-send` · `no-raw-cron-secret` · `no-raw-content-hash` · `no-raw-audit-log-insert` · `no-derived-contact-column-write` · `no-rerolled-phone-normalise` · `no-rerolled-property-label` · `no-id-number-hash-in-app` · `require-id-number-encryption` · `require-supabase-error-check` · `settings-use-detail-tabs` | **NOT INDIVIDUALLY PROBED** | **UNVERIFIED** |

**⚠ That last row is thirteen rules and it is stated as unverified rather than assumed AIMED.** Each
has an empty baseline, and §2.1 establishes that an empty baseline plus a green gate cannot tell
"burned down" from "silently disabled" — `no-inline-app-url` had a live blind spot behind exactly
that pair. Two of the four rules that *were* probed returned something the docstring did not predict,
so **extrapolating from a 50% surprise rate to thirteen unprobed rules would be the sampling error
this audit exists to find** (`lint-rules.md`: *a parity test enumerates its members; it never samples
them*). Probing each costs one planted violation; that is PART 4, item R3.

---

## PART 3 · Hooks, the security audit, and the gate chain

### 3.1 🟥 MISAIMED — `bash-gate`'s prod-DB clause misses the repo's own prod-apply script

Probed live against the real hook, **both directions**, at `5ddbaee1`:

| Command | Decision |
|---|---|
| `supabase db push` | **ask** — "prod database operations require approval" |
| `npx supabase db reset` | **ask** — same |
| `node supabase/reconcile/apply-prod.mjs --confirm` | **allow** — "default allow (unattended profile)" |
| `psql $DATABASE_URL -f 01_reconcile.sql` | **allow** — same |

The clause is a single pattern, `/supabase\s+db\s+(push|reset)/` (`bash-gate.js:365`). The known-good
half passes, so the hook is working — **it is pointed at one spelling of the class.**

`supabase/reconcile/apply-prod.mjs` is not hypothetical. Its own header reads *"⚠ WRITES TO
PRODUCTION"*, it posts a whole SQL file through the Management API, and `bash-gate.js` **cites it
twice in its own comments** (lines 39 and 131) as a source of the ReDoS lesson — so the file was read
by whoever last hardened this hook, and its invocation still is not gated.

**It is not ungoverned**, and that matters for the ruling: the script demands `--confirm`, refuses any
file but `01_reconcile.sql`, and refuses a script not wrapped in `BEGIN`/`COMMIT`. Those are real
controls. But they are **rung-0 — inside the thing being invoked** — and the actor who types
`--confirm` is the actor the hook exists to interrupt. CLAUDE.md's stated posture is *unattended
autonomy*; under it, `node …/apply-prod.mjs --confirm` runs with no human in the loop.

`psql` is listed for completeness and is **weaker evidence**: nothing in the repo invokes it and it
may not be installed. The `apply-prod.mjs` row is the finding.

**Ruling needed** — PART 4, R4.

### 3.2 🟢 AIMED — `.env` protection, stated precisely because the obvious reading is wrong

I nearly filed this as a hole. The precise coverage matrix at `5ddbaee1`:

| Vector | Control | Rung |
|---|---|---|
| `Read` tool | `permissions.deny`: `Read(.env)`, `Read(.env.*)`, `Read(//**/.env*)` | settings (2) |
| Bash (`cat`, `type`, `<`, `>`, `*.env`) | `bash-gate.js:362` — anchored `.env` path-token pattern | hook (1) |
| `Edit` tool | **transitively blocked** — Edit requires a prior Read, and Read is denied | harness |
| `Write` to an EXISTING `.env*` | **transitively blocked** — overwriting an unread file fails | harness |
| `Write` creating a NEW `.env*` | **nothing** | — |

So the residual gap is exactly one shape: *creating a `.env*` file that does not yet exist.* Narrow,
and it cannot exfiltrate anything. **Not worth a control** — recorded so the next reader does not
re-derive it, and because `defaultMode` is `acceptEdits`, which makes the reasoning worth having
written down rather than re-guessed.

Worth noting the `.env` controls are **tool-layer, not filesystem-layer**: `apply-prod.mjs:27` reads
`.env.local` with `readFileSync` at runtime. That is normal and expected — any executed script can —
but it means the deny list bounds *what the model may do directly*, not what a script it runs may do.

### 3.3 🟢 AIMED, and the reference example — `mcp-ddl-gate`

Matcher `mcp__claude_ai_Supabase__.*`. Its header records that **the tool namespace was enumerated
before the matcher was written**, that the natural guess `mcp__supabase__*` does not exist in this
session and was probed both directions, and that a matcher against it *"would match nothing forever,
and a gate that matches nothing is indistinguishable from a gate that is working."*

It also rejects the obvious "DDL-keyword AND tool" formulation on evidence: `merge_branch` merges
migrations into production and takes only a `branch_id`, so there is no SQL text to keyword-match and
an AND-gate would never fire on the highest-blast tool in the set.

**That is this audit's question, asked and answered by the control's own author before shipping.** It
is the model for what the rest should look like.

### 3.4 🟥 THE DEPLOY GATE COMMAND DOES NOT EXIST

CLAUDE.md §3 THE GATES: *"Before every deploy | `npm run security` (`security:quick` for a routine
check)"*, and §5: *"Do not deploy without running `npm run security:quick` first."*

**Neither script is in `package.json`.** What exists is `security:db`, `security:behavioural`,
`security:prod`, `security:prod:quick`. `npm run security` errors.

The doctrine then describes that gate's failure modes in careful detail — *"`npm run dev` must be
running — Categories 3, 4, 6 and 8–12 probe localhost, so eight of the fifteen silently cannot fire
without it"* — **all of it about a command that cannot be invoked.** The paragraph is more precise
than the thing it describes, which is exactly how it survived review: precision reads as verification.

**Ruling needed** — PART 4, R5.

### 3.5 🟥 Seven of fifteen categories skipped, and the run still reports ALL TESTS PASSED

Run at `5ddbaee1` with **no dev server** (`localhost:3000` refused), `node scripts/security/audit.mjs
--quick`:

```
📋 Category 3: SKIPPED (app not running)      📋 Category 9:  SKIPPED (app not running)
📋 Category 4: SKIPPED (app not running)      📋 Category 10: SKIPPED (app not running)
📋 Category 6: SKIPPED (app not running)      📋 Category 11: SKIPPED (app not running)
📋 Category 8: SKIPPED (app not running)      📋 Category 12: SKIPPED (app not running)
…
  Tests run:    293
  Tests passed: 55
  Findings:     0
  ✅ ALL TESTS PASSED — No findings
```

**exit code 0.**

**⚠ A HYPOTHESIS I HELD AND HAD TO WITHDRAW — the withdrawal is half the value of this section.** I
read `cat3_gatewayBypass` and found that `appFetch` returns `status: 0` on a refused connection
(`audit.mjs:176`), and that 0 is neither 401/403/302 nor 200, so it falls to the `else` at line 526 →
`ok("returned 0")` → `pass(3, …)`. I concluded the category fail-open **passes**, and had begun
writing that up. **Running it refuted that**: a reachability precheck upstream skips the category
outright, so those lines are never reached. *I read a function body and inferred behaviour without
reading its caller.* The mechanical sweep that found 29 such fallthrough sites was, on its own,
worthless — and would have shipped as a 29-item finding.

**What is actually wrong is worse than fail-open, and the repo has already ruled on it.** The skip is
honestly *labelled* — and the run still exits 0 saying **ALL TESTS PASSED**. `audit.mjs:1197` carries
a CD ruling of 2026-08-17 about precisely this shape, for the other half of the file:

> *"ABSENT CREDENTIALS ARE A CRITICAL FINDING, NOT A SKIP … A green tick meaning 'I had no
> credentials' is indistinguishable from 'I looked and found nothing', and only one of those is
> assurance."*

That ruling was applied to the DB categories (1, 2, 5, 7) and **not** to the app-surface categories,
whose absent *server* is the same condition as an absent *credential*. The reasoning is written out at
length, in this file, twelve hundred lines from the code that contradicts it.

### 3.6 🟡 The summary counters do not reconcile, and the verdict ignores them

From the same run: **`Tests run: 293` · `Tests passed: 55` · headline `ALL TESTS PASSED`.**

238 tests are neither passed nor failed. `test()` increments the run counter; `pass()` increments the
passed counter; many assertions call `ok()` without `pass()`, so they vanish. **The headline verdict
is derived from `findings === 0` alone** — it never compares passed against run.

A category could execute two hundred assertions, record none, produce no findings, and print ALL
TESTS PASSED. That is the same collapsed-analysis shape `check-knip-floor.mjs` guards in its own
domain, and `check-register-integrity.mjs` (#263) adopted last week: **an enumeration that analyses
zero items must fail, not pass.** The audit's own summary is the one place it is not applied.

**Ruling needed** — PART 4, R5 (same fix as 3.5).

### 3.7 The gate chain — honest status

**Not individually aimed-audited.** 34 scripts run in `check`; auditing each against its class is
comparable in size to everything above. What was established mechanically:

- **14 of 36 gate invocations wire a `--selftest`.** The other 22 mostly do not need one:
  `check-bash-gate.mjs`, `check-mcp-ddl-gate.mjs` and `check-agent-write-scope.mjs` *are* probe
  suites — they are the hooks' probes, so "no selftest" there is correct, not a gap.
- **A detector I wrote to find dormant selftests produced one false positive and zero findings.** It
  flagged `check-prepush-composition.mjs` as having an unwired `--selftest`; the string it matched is
  a **comment** on line 8 referencing `prepush-scope --selftest`, a different script's flag. The
  script's default run already *is* its probe suite (9 probes, green) and is already wired.

**That false positive is the third of its kind in one day** — after `/BUILT/` matching "HALF BUILT"
(#263) and a heading *mentioning* an M-number being read as declaring one. Same root each time: **the
pattern matched a mention of the thing instead of the thing.** Recorded in PART 4 as R6, because three
independent instances in one session is a pattern about how these tools get written, not three
accidents.

---

## PART 4 · RULINGS NEEDED

Nothing here has been changed. Each item is a decision, not a task.

| # | Finding | Question for CD/Stéan |
|---|---|---|
| **R1** | §1.1 — `scripts/**` ignored as "not production code"; 4 files contradict that in their own headers | Lint `scripts/**` with a **classified** per-file exemption list (replacing a 54-entry blanket ignore with reasons), or state the ignore's real rationale? Several exemptions are correct on the merits — this is about recording *which*. |
| **R2** | §1.2 — the two org-scope rules' `SKIP_PATH` differ on `api/applications` and `lib/admin`+`components/admin`; both surfaces have 8 live service-client files | Which direction is intent and which is drift? The 2026-08-19 scar argues the READ rule's two extra skips deserve the harder look, since a cross-org read leaks silently. |
| **R3** | §2.5 — 13 rules marked UNVERIFIED, all with empty baselines | Authorise a probe pass (one planted violation each). 2 of the 4 rules probed returned something their docstring did not predict. |
| **R4** | §3.1 — `node supabase/reconcile/apply-prod.mjs --confirm` passes `bash-gate` | Add it to the prod-DB clause? It has real rung-0 controls, but they do not interrupt an unattended session — which is the hook's stated purpose. |
| **R5** | §3.4–3.6 — the deploy gate command does not exist; 7/15 categories skip yet exit 0 saying ALL TESTS PASSED; 238 of 293 tests unaccounted | Three fixes, one decision: wire a real `security` script; make an absent server a finding (the 2026-08-17 ruling, applied to the half it was not); reconcile passed-vs-run before printing a verdict. |
| **R6** | §3.7 — three "matched a mention, not the thing" defects in one session | Worth an M-register entry as a *class*? Each was cheap to fix and none was caught by review — all three were caught by a number disagreeing with itself. |

### What this audit did NOT cover

Stated so the gap is visible rather than implied:

- **34 gate scripts, not individually aimed-audited** (§3.7).
- **13 of 21 ESLint rules, unprobed** (§2.5).
- **The DB test tier and `vitest` suite** — not examined at all.
- **Audit categories 1, 2, 5, 7, 13, 15** — observed running, but their *aim* (does each inspect where
  its class lives) was not assessed; only the skip/verdict behaviour above was.

Roughly **half the inventory by count**. The half that was audited produced four findings that no
green gate could report, which is the argument for finishing it rather than for trusting the rest.
