# DEAD-CODE QUEUE

A classified `knip` census, promoted out of `.claude/handoff/` on 2026-08-21 so it survives `/wrap`.

**What this is:** 103 knip findings at commit `a5b6f541`, each classified DEAD / RETAINED / JUDGMENT /
FALSE POSITIVE by a 3-way census fan-out, with per-item grep evidence preserved in the appendices.
This was a queue of candidates, not a record of work done — every DEAD verdict a claim to re-verify
against HEAD before acting on it.

---

## ▶ CLOSED, 2026-08-21 — 103 → 0, and knip is now IN `npm run check`

**This queue is finished. Read this banner and stop; everything below is the working record.**

`npx knip` reports **zero findings** and the tool entered the commit gate on 2026-08-21 — the exit
condition `knip.jsonc`'s own header set when it was deliberately kept out.

| | Count | How it was closed |
|---|---:|---|
| Genuinely dead | 56 | deleted, un-exported, or dropped from a barrel — three shapes, not one sweep |
| Deliberate keeps, tagged at the site | 40 | `@knipignore <reason>` on the declaration |
| Deliberate keeps, whole files | 4 | path entries in `knip.jsonc` (a tag does NOT clear an unused file — probed) |
| Duplicate exports | 3 | `rules.duplicates: "off"` — all three are live aliases |
| | **103** | |

**Zero means "every finding is classified", NOT "there is no dead code."** The gate's aperture is
narrower than it looks: `ignoreExportsUsedInFile` suppresses 174 further findings that nobody will be
shown again. That is a deliberate trade — a type used only in its own module is that module's
vocabulary — but it is the number to remember when reading the green.

**A floor check guards the green.** `scripts/check-knip-floor.mjs` exists because a knip run that
analyses *zero files* also reports zero and exits 0, which is indistinguishable at the gate from a
clean tree. It asserts a **parity**: the count of `@knipignore` tags on disk must equal the count of
findings when the `tags` key is removed. Not a hardcoded floor — that would rot the first time
someone legitimately wires one of the 40 up. It caught a real error during its own construction (a
`git checkout` reverting a probe also wiped a real tag in the same file).

**Full baseline, for whoever asks "how much dead code is there really":** 258 with every suppression
lifted — `ignoreExportsUsedInFile` 174, the `ignore` paths 28, `ignoreDependencies` 8. Those attribute
to 210, not 211, because one finding sits in two buckets; each number was produced by its own run,
since attributing by subtraction is how you get a plausible wrong answer.

---

## ▶ STATUS, 2026-08-21 at `c3eafb81` — the DEAD half is actioned. 103 → 49.

**⚠ The sections below are the ORIGINAL census, left verbatim as evidence. They still say "nothing
deleted" and still describe 57 DEAD items. That was true at `a5b6f541` and is not true now.** Read
this banner first; treat every DEAD row below as *actioned unless named as a refusal here*.

`npx knip --no-progress` at `c3eafb81`: **49 items** — 4 unused files, 38 unused exports, 4 unused
exported types, 3 duplicate-export pairs. The 49 reconcile exactly:

| Class | Count | State |
|---|---:|---|
| RETAINED | 21 | settled keeps — reasons in the table below; a future census must not re-raise them |
| JUDGMENT | 25 | **awaiting a CD ruling.** 7 money-adjacent, 11 security/compliance-adjacent |
| Refused DEAD verdicts | 3 | re-classified during the burn-down — see immediately below |
| **Total still reported** | **49** | |

**THREE DEAD VERDICTS WERE REFUSED and the code kept.** Each was re-verified, found to be an unwired
feature half rather than obsolete code, and is now the JUDGMENT class in everything but the original
label:

1. **`lib/actions/inspections.ts:rescheduleInspection`** — the live reschedule path,
   `respondToRescheduleRequest` in `app/(dashboard)/inspections/[inspectionId]/actions.ts`, updates
   `scheduled_date` but sends **no tenant communication**. This module's own header says "I3 fires on
   rescheduleInspection when tenant_id is set", so deleting it deletes the only implementation of
   comm I3. **That gap is itself a finding: as at `c3eafb81`, a tenant whose inspection is
   rescheduled through the live path is not notified.**
2. **`lib/actions/leases.ts:giveNotice`** — the only lease-termination-notice implementation in the
   tree. `issueDemandToVacate` in `lib/actions/notices.ts` is the *breach* instrument, a different
   thing. It carries SAST calendar arithmetic written to fix a real off-by-one (an agent giving
   notice at 00:30 SAST recorded yesterday). Deleting it means the next person to wire a termination
   notice re-derives that.
3. **`lib/screening/bankStatementExtraction.ts:BankStatementExtraction`** — deleted and then restored
   mid-pass. Removing it orphaned `RecurringDebit` / `StatementQuality` / `DeclaredRentMatch` /
   `PleksInvoiceReference`; those five interfaces together **are** the JSON schema the prompt fifty
   lines below asks the model to return. The name collision with the live, unrelated
   `BankStatementExtraction` in `lib/extraction/types.ts` is now documented at the site.

**What the DEAD burn-down actually did** — three shapes, deliberately not one sweep: an export used
inside its own file lost the `export` keyword and kept its body; a barrel line shrank without
touching the definition it pointed at (`lib/crypto/index.ts` −9, `lib/dates/index.ts` −4); a genuinely
unreachable symbol was deleted with a comment at the site naming what went and why. Two second-order
cascades surfaced (`validateCompanyPeopleIdentity` + `companyAddressError`; both inspection room
arrays) and were caught by lint, not assumed.

**The path to gating knip in `npm run check`** — the exit condition `knip.jsonc`'s own header sets —
is now blocked only on the JUDGMENT rulings, not on more deletion. When they are ruled, each survivor
needs its reason recorded *at the site* (knip reads JSDoc tags, which suits this better than a
central list) before the tool can go green and enter the gate.

---

## ▶ THE JUDGMENT RULINGS, 2026-08-21 at `a309c74b` — 47 left, and the pass turned up four findings

**CD ruling:** apply the M-register triage pattern. Default verdict is DELETE; **retention requires a
reason**, and two classes get a real per-item verdict regardless — anything money- or
security/compliance-adjacent, and anything another artefact actually references.

### OTHER class (5) — ACTIONED, the class where a default is safe

| Item | Verdict | Reason |
|---|---|---|
| `HoaRulesUpload.tsx:HoaUploadStub` | **DELETED** | permanently `disabled` placeholder for BUILD_44, rendered by nothing, named by no spec |
| `emails.tsx:formatDate` + its re-export | **DELETED** | re-export claimed "purge step callers"; all 7 importers checked, none is one. Removing it left the wrapper with no internal caller either |
| `help-data.ts:HELP_CONTENT_DRAFT` | **RETAINED** | cited 3× in `docs/MECHANISABLE.md` — referenced |
| `searchworx/utils.ts:normaliseOwnerType` | **RETAINED** | specified with its body in `brief/vendors/searchworx/raw/lightstone-erf-valuation/endpoint_reference.md` — referenced |
| `applyDomain.ts:STEP_DOCS_OPTIONAL\|LAST_DATA_STEP` | **RETAINED** | not dead: both names live and separately imported. knip flags the aliasing, not the code |

### MONEY-ADJACENT (7 names) — every one KEPT, and two of them are findings

| Item | Verdict | Evidence |
|---|---|---|
| `QuickPaymentButton.tsx`, `lib/actions/payments.ts`, `templates/tenant/rent/payment-received.tsx` | **KEEP** | referenced: `.claude/crawlers/INTENTIONAL.md` already holds this chain as an open product question. `recordPayment` is the ONLY single-payment recording implementation; bulk import calls `record_payment_atomic` directly. Deleting the chain decides the question |
| `municipal.ts:createMunicipalAccount`, `uploadMunicipalBill` | **KEEP — ⚠ FINDING** | **these are the missing entry half of a LIVE feature.** Their two siblings in the same file, `confirmMunicipalBill` and `markMunicipalBillPaid`, ARE wired — to `app/(dashboard)/billing/municipal/[billId]/MunicipalBillActions.tsx`. So a municipal bill can be confirmed and marked paid, and **as at `a309c74b` there is no UI path that creates an account or uploads a bill.** Deleting these strands the live half |
| `commercial.ts:declareDirectors`, `replaceDirector` | **KEEP** | mid-build commercial-applicant flow; both are genuinely gated (`verifyApplicantToken` is CALLED, not merely described) ahead of wiring, and `replaceDirector` touches `application_screening_payments` and a manual-refund flag. **Worth noting for whoever wires them:** both take `orgId` as a caller-supplied parameter and use it as the write scope. That is the shape of the 2026-07-06 cross-org IDOR scar; derive it at wiring time rather than accepting it |

### SECURITY / COMPLIANCE-ADJACENT (13 names) — every one KEPT, one is a finding

| Item | Verdict | Evidence |
|---|---|---|
| `CapabilitiesProvider.tsx:useCan`, `can.ts:can`, `orgRoles.ts:capabilitiesForRole`, `requireCapability.ts:requireMinTier` | **KEEP** | one family. Each file states outright that gating is deliberately not yet wired and that surfaces adopt them one at a time. Deleting removes the primitives a documented rollout still needs |
| `auth/server.ts:getCurrentSubscriptionState` | **KEEP** | built ahead of consumers named in ADDENDUM_57G |
| `platform-org.ts:excludePlatformOrg` | **KEEP** | referenced — `docs/MECHANISABLE.md` **M-067** |
| `ApplicantLegalFooter.tsx:INFORMATION_REGULATOR_URL` | **KEEP** | referenced — **M-069** |
| `disclaimer.ts:DISCLAIMER_GATE_TEXT`, `DOCUMENT_DISCLAIMER_TEXT` | **KEEP** | referenced — **M-078**. Verified SSOT drift, not dead code: two counsel-reviewed liability texts hand-copied into live sites. The fix is wiring those sites to import these, the opposite of deletion |
| `inviteTenant.ts:issueTenantPortalLinkForHandover` | **KEEP** | sanctioned exception to "no portal action returns a session credential" (ADDENDUM_62F, post-incident). Too security-sensitive to guess mid-build vs abandoned — and this is the exact symbol family behind the `inviteTenant` scar in CLAUDE.md §6 |
| `decisionReasonLabels.ts:NOT_SHORTLISTED_REASON_LABELS`, `WITHDRAWN_REASON_LABELS` | **KEEP** | exhaustive `Record`s over counsel-signed decision-code unions. Deleting removes a compile-time exhaustiveness check, not inert code — the union gains a member and nothing complains |
| `retention.ts:RETENTION_PROTECTED_TABLES` | **KEEP — ⚠ FINDING** | its own header says *"BUILD_65 imports this array rather than defining its own"*, and `supabase/migrations/010_platform_features.sql:1690` says a table was *"Added to RETENTION_PROTECTED_TABLES"*. **Neither is true.** A whole-repo grep finds no importer: this is a PPRA/POPIA retention list (audit_log, trust_transactions, consent_log, auth_events, tos_acceptances) that governs nothing, with two artefacts asserting it is live. Same shape as M-067/M-069 — **files as a new M-register entry** |

### The four findings this pass produced, which is the actual yield

1. **Comm I3 has no live sender.** The live inspection-reschedule path updates `scheduled_date` and
   notifies nobody; the only implementation of the tenant notification is in the function the census
   called dead.
2. **The municipal bill flow has no UI entry point.** Confirm and mark-paid are wired; create-account
   and upload-bill are not.
3. **`RETENTION_PROTECTED_TABLES` enforces nothing**, while a module header and a migration comment
   both state that it does.
4. **`declareDirectors` / `replaceDirector` take `orgId` from the caller** and use it as the write
   scope — the 2026-07-06 IDOR shape, harmless while unwired and not harmless after.

A dead-code pass is a poor tool for finding these and an excellent one for *provoking* them: every
finding above came from asking "why does this have no caller?" rather than from the count.

**Why it is a register rather than a report.** The 25 JUDGMENT items are routed for a human and had
no durable home; 7 are money-adjacent and 11 security/compliance-adjacent, which is exactly the set
that must not be swept by a mechanical dead-code pass. The 57 DEAD items are cheap to action and the
21 RETAINED are the reasons a future census must not re-raise them.

**Anchoring.** Every observation below was made at `a5b6f541` and is a photograph, not a standing
fact — a later commit may have deleted, revived, or added callers to any symbol named here. Re-run
`npx knip --no-progress` and re-grep before deleting anything. Two findings were verified against the
tree by the parent rather than taken on a child's word; they are marked in the Promote section.

**Provenance.** Sections below are the census artefacts verbatim, including their `anchor:` and
`## Contract` blocks, so the classification can be audited against who produced it. The parent's
"see child artefacts" references now point at the appendices in this file.

---

anchor: task=fanout-probe · agent=census · utc=2026-08-21T09:00:00Z · commit=a5b6f541

# Census — knip findings @ a5b6f541, synthesised from 3-way fan-out

`npx knip --no-progress` @ HEAD `a5b6f541`: 103 items (4 unused files, 79 unused exports, 17 unused
exported types, 3 duplicate-export pairs). Classification only — nothing deleted by this report.

## Run note (findings about the run itself, not about knip)

- The fan-out took two passes to land. First pass: a message claiming "all three children
  completed" arrived while slices 2 and 3 had no artefact on disk and 0-byte task-output files —
  verified directly before writing anything, and declined to synthesise on an unverified claim.
  Second pass (this one): all three artefacts independently confirmed on disk before being read.
- **Two of three child artefacts (slice 1 = Appendix A, slice 3 = Appendix C) carry no `## Contract`
  section** — grep for `## Contract`/`Verdict`/`Promote` inside both returns zero hits. This was the
  observation that produced census v8's write-order rule: the block was composed for the return and
  the disk copy never happened. Only slice 2's artefact (Appendix B)
  ends with the required block. This is a real gap in what's on disk, not smoothed over: I cannot
  confirm from the artefact alone what verdict slice 1 or slice 3 closed on, only what their body
  text says. Their body text is internally reconciled (each states its own sum and it checks out),
  which is why I've treated the content as usable — but the missing Contract sections are
  themselves findings about this fan-out, not just a formatting nit.
- Per the coordinator's instruction, no claim is made here about whether any permission prompt
  fired for any child — that signal isn't observable from this session and a confident answer
  either way would be fabricated.

## The partition

Cut along domain boundaries, not file count, so each slice's classification calls needed the same
kind of context throughout:

| Slice | Scope | Items | Why this boundary |
|---|---|---|---|
| 1 | `app/`, `components/`, `lib/auth/`, `lib/consent/` | 25 | UI + access-control surface — RBAC rollout state (Phase 4) recurs across several items and is easier to judge together |
| 2 | `lib/constants.ts`, `lib/crypto/`, `lib/dates/`, `lib/exports/`, `lib/finance/`, `lib/payfast/`, `lib/popia/`, `lib/subscriptions/`, `lib/tier/` | 37 | Compliance/money-adjacent SSOT + crypto barrel — the barrel-vs-submodule question (9 `lib/crypto/index.ts` entries) needed one consistent method applied per-item |
| 3 | `lib/actions/`, `lib/applications/`, `lib/comms/`, `lib/help/`, `lib/inspections/`, `lib/leases/`, `lib/legal/`, `lib/parties/`, `lib/portal/`, `lib/queries/`, `lib/reports/`, `lib/screening/`, `lib/searchworx/`, `lib/maintenance/`, `lib/extraction/` | 41 | Domain business logic — the largest, most heterogeneous remainder; grouped because none of it overlapped the other two slices' directories |

25 + 37 + 41 = **103**, matching the live knip total. No directory appears in two slices.

## Combined headline

| Class | Files | Exports | Types | Duplicates | Total |
|---|---|---|---|---|---|
| DEAD | 0 | 43 | 14 | 0 | **57** |
| RETAINED | 1 | 15 | 3 | 2 | **21** |
| JUDGMENT | 3 | 21 | 0 | 1 | **25** |
| FALSE POSITIVE | 0 | 0 | 0 | 0 | **0** |
| **Total** | **4** | **79** | **17** | **3** | **103** |

Row sums: 0+1+3+0=4 ✓ · 43+15+21+0=79 ✓ · 14+3+0+0=17 ✓ · 0+2+1+0=3 ✓.
Column sums (per slice, restated from each child): slice 1 = 17 DEAD + 0 RETAINED + 8 JUDGMENT + 0
FALSE POSITIVE = 25 ✓ · slice 2 = 18 + 17 + 2 + 0 = 37 ✓ · slice 3 = 22 + 4 + 15 + 0 = 41 ✓.
57 + 21 + 25 + 0 = **103** ✓. No FALSE POSITIVE class was used anywhere — all three children
checked the two knip config hints (`types/**/*.ts` glob, `.css` compiled-extension imports)
against their slice and found neither applied to any item.

## Classification table (file + symbol, grouped by class, DEAD first — full per-item reasons live
in Appendices A–C; this table is the merge, not a re-derivation)

### DEAD (57) — see Appendices A–C for full per-item grep evidence
**Slice 1 (17):** `applyDomain.ts:PERIOD_DIVISOR` · `applyReview.tsx:AccountStep` ·
`useApplyFlow.ts:TYPE_LABEL` · `SuppliersClient.tsx:SPECIALITY_OPTIONS` (dead re-export) ·
`Sidebar.tsx:NAV_GROUPS` · `partyFields.tsx:Stepper` · `partyFields.tsx:Field` ·
`partySteps.tsx:IdentityStep` · `partySteps.tsx:ReviewStep` · `partySteps.tsx:SuccessView` ·
`PropertyCards.tsx:PropertyCards` · `email-policy.ts:requiresOrgDomain` · `mfa-host.ts:ALLOWED_HOSTS`
· `LandlordVerificationCard.tsx:LatestPull` (type, dead re-export) · `mfa-host.ts:AllowedHost` (type)
· `server.ts:SubscriptionState` (type, dead re-export) · `verification.ts:SendResult` (interface)

**Slice 2 (18):** `constants.ts:GUARANTOR_MIN_INCOME_MULTIPLE` (stale-design comment) ·
`bankAccount.ts:maskBankAccount` · `encryption.ts:encryptIfNeeded` · `crypto/index.ts:` `encrypt`,
`decrypt`, `decryptNullable`, `encryptIfNeeded`, `isEncrypted`, `hashIdNumber`, `validateSAIdNumber`,
`maskIdNumber`, `maskBankAccount` (all 9 — barrel re-export lines specifically, verified per-item,
not as a class) · `holidayAudit.ts:isWithinHolidayHorizon` · `dates/index.ts:` `addBusinessDays`,
`subtractBusinessDays`, `isPublicHoliday`, `HOLIDAY_TABLE_COVERS_FROM` (barrel re-exports) ·
`constants.ts:LeaseType` (type, name-collides with an unrelated, live `LeaseType` elsewhere)

**Slice 3 (22):** `inspections.ts:rescheduleInspection` · `leases.ts:giveNotice` ·
`roomTemplates.ts:getRoomTemplate`, `getItemsForRoom` (superseded by templateEngine) ·
`partyValidation.ts:validateIdentity`, `validateDetails` (superseded by step validators) ·
`portfolioActions.ts:fetchApplicationsAction` · `searchworxBundle.ts:getApplicationFee` (dead
re-export) · `combinedConsumerCreditReport.ts:` `COMBINED_SEARCH_TYPE`, `COMBINED_DISPLAY_NAME`,
`COMBINED_DESCRIPTION` · `vccbIncomeEstimator.ts:VCCB_SEARCH_TYPE` ·
`comms/templates/seed/render.ts:TemplateBodyVariants` (type, dead re-export) ·
`extraction/pipeline.ts:PipelineDocumentResult` (type, dead re-export, stale justifying comment) ·
`_pdf/primitives/theme.ts:` `ApplicantEmployment`, `NarrativeResponse`, `ExpenditureItem`,
`FitScoreFinancialAnalysis` (types, dead re-exports) · `svgCharts.ts:ChartPoint`, `PieSlice`
(interfaces — no chart function implements them) · `bankStatementExtraction.ts:BankStatementExtraction`
(interface — unrelated live twin exists in `lib/extraction/types.ts`) ·
`_primitives/theme.ts:T` (web-side style object; web primitives use Tailwind, never this)

### RETAINED (21)
**Slice 2 (17):** `lib/tier/canDowngradeTo.ts` (file — paired half-built feature) ·
`constants.ts:HOA_LIMITS` (named future consumer not yet built) · `FOUNDING_AGENT_PRICE_CENTS`,
`FOUNDING_AGENT_DURATION_MONTHS` (documented pricing) · `exports/bundle.ts:verifyBundle` (POPIA
tamper check, unwired-but-deliberate) · `sarsCategories.ts:PROVISIONAL_TAX_THRESHOLD_CENTS`
(statutory figure) · `payfast/forms.ts:buildSubscriptionForm` (paired with `canDowngradeTo`) ·
`popia/erasure.ts:anonymiseRecord`, `popia/export.ts:regenerateExport`,
`popia/requests.ts:assignRequest` (each self-documented "unwired, flag for human") ·
`popia/retention.ts:getRetentionForSubject`, `getErasureEligibleDate` (pinned by
`invariant-coverage.test.ts`'s pending ratchet) · `screeningArtefactPurge.ts:countEligibleScreeningArtefacts`
(documented dry-run safety check) · `subscriptions/acceptance.ts:getLatestTosAcceptance` (named in an
untracked spec doc, independently re-read) · `popia/erasure.ts:ErasurePreview` (type, travels with
`anonymiseRecord`) · `idNumber.ts:encryptIdNumber|encryptDob` and `decryptIdNumber|decryptDob`
(deliberate aliases, each name independently called)

**Slice 3 (4):** `legal/changelog.ts:getTosHighlights`, `getPrivacyHighlights` (module's own header:
kept because `TOS_CHANGELOG` carries live drafted v3.4.0 copy — the exact TOS/PRIVACY_CHANGELOG
scenario the census framework warns about, already resolved once here) ·
`maintenance/warranty.ts:WarrantyMatchInput`, `WarrantyMatchResult` (types kept on record after the
function using them was deliberately removed 2026-08-20)

### JUDGMENT (25) — see dedicated section below, routed for a human
### FALSE POSITIVE (0)
No item in any slice was attributed to knip's own config gaps.

## JUDGMENT — routed for a human, money-adjacent and security/compliance flagged

**MONEY-ADJACENT (7):**
- `app/(dashboard)/leases/[leaseId]/QuickPaymentButton.tsx` (file, slice 1) — dead chain around a
  live money path; `.claude/crawlers/INTENTIONAL.md` already frames this as an open product
  question, not a deletion call.
- `lib/actions/payments.ts` (file, slice 3) + `lib/comms/templates/tenant/rent/payment-received.tsx`
  (file, slice 3) — same dead chain as above, from the other end (the action + its comms template).
- `lib/applications/commercial.ts:declareDirectors`, `replaceDirector` (slice 3) — **the flagged
  known positive.** Zero importers confirmed independently by two people now (me, earlier in this
  run, and slice 3). Both carry their own "gate-before-wiring — unwired today" comments.
  `replaceDirector` touches `application_screening_payments` and a refund-flag path; deleting is a
  product decision on a money-adjacent, mid-build commercial-applicant flow, not a knip call.
- `lib/actions/municipal.ts:createMunicipalAccount`, `uploadMunicipalBill` (slice 3) — zero callers;
  a property page's own empty-state copy describes a municipal-bill-upload flow that doesn't exist
  in any property page checked. Same unwired-entry-point shape as the two items above.

**SECURITY / COMPLIANCE-ADJACENT (11):**
- `components/auth/CapabilitiesProvider.tsx:useCan`, `lib/auth/can.ts:can`,
  `lib/auth/orgRoles.ts:capabilitiesForRole`, `lib/auth/requireCapability.ts:requireMinTier` (slice
  1) — one family: RBAC "Phase 4" primitives, each file states outright that gating is deliberately
  not yet wired ("surfaces adopt them one at a time"). Deleting removes primitives a documented
  rollout still needs.
- `lib/auth/server.ts:getCurrentSubscriptionState` (slice 1) — built ahead of named-but-not-yet-built
  consumers (ADDENDUM_57G).
- `lib/subscriptions/retention.ts:RETENTION_PROTECTED_TABLES` (slice 2) — doc claims a live consumer
  (BUILD_65) that a whole-repo grep does not find. Doc/code disagreement on a POPIA-retention
  constant — not resolved here.
- `lib/comms/platform-org.ts:excludePlatformOrg` (slice 3) — **already filed, `docs/MECHANISABLE.md`
  M-067**, verified present at that section: a stated cross-org MUST with zero enforcement sites.
  Same class as the CLAUDE.md §6 cross-org IDOR scars.
- `lib/comms/templates/ApplicantLegalFooter.tsx:INFORMATION_REGULATOR_URL` (slice 3) — **already
  filed, `docs/MECHANISABLE.md` M-069** (not M-067 itself as slice 3's text implied — M-069 is a
  separate, adjacent entry that self-describes as "second instance of M-067's class"; corrected
  here after checking the file directly). 34 lines/14 files of competing IR text, a competing SSOT
  actually in use, zero importers of the documented one.
- `lib/screening/decisionReasonLabels.ts:NOT_SHORTLISTED_REASON_LABELS`, `WITHDRAWN_REASON_LABELS`
  (slice 3) — exhaustive `Record`s over counsel-signed decision-code unions; deleting removes a
  compile-time safety net, not inert code, even though nothing renders them today.
  `lib/portal/inviteTenant.ts:issueTenantPortalLinkForHandover` (slice 3) — sanctioned exception to
  "no portal action returns a session credential" (post-incident rule, ADDENDUM_62F). Zero real
  callers; a regex-based leak test matches the name but never calls it. Too security-sensitive to
  guess mid-build vs abandoned.
- `lib/leases/disclaimer.ts:DISCLAIMER_GATE_TEXT`, `DOCUMENT_DISCLAIMER_TEXT` (slice 3) — see
  Promote section; verified as live SSOT drift, not simple dead code.

**OTHER (7):**
- `components/properties/HoaRulesUpload.tsx:HoaUploadStub` (slice 1) — explicit `BUILD_44` stub
  comment.
- `applyDomain.ts:STEP_DOCS_OPTIONAL|LAST_DATA_STEP` (duplicate-export pair, slice 1) — both names
  are live and separately imported; knip flags them because one aliases the other's value. Merging
  the alias is a naming call, not a deletion call.
- `lib/subscriptions/emails.tsx:formatDate` (slice 2) — comment names "purge step callers" that a
  full check of all 7 importing files does not show.
- `lib/help/help-data.ts:HELP_CONTENT_DRAFT` (slice 3) — see Promote section.
- `lib/searchworx/utils.ts:normaliseOwnerType` (slice 3) — written ahead of the deeds/CIPC response
  parsers it depends on (those product files are explicitly stub/pending-UAT).

25 listed = 3 (money, files) + 4 (money, exports) + 11 (security/compliance) + 7 (other) = 25 ✓
(money-adjacent total is 3 files + 4 exports = 7; security/compliance is 11; other is 7;
7 + 11 + 7 = 25, matching the combined JUDGMENT count above).

## Promote — verified against the tree, not taken on the children's word

**✅ BOTH FILED, 2026-08-21, at `b2eda39d` — `M-077` and `M-078` in `docs/MECHANISABLE.md`.** The
register entries are now authoritative; what follows is the fan-out's own reasoning, kept because it
is the provenance. **One claim below was corrected on filing:** item 2 says the gate copy matches
`DISCLAIMER_GATE_TEXT` "word-for-word (intro paragraph, all six numbered clauses, the closer)". That
is true of those three things and loose about the rest — the constant's lead sentence has no
counterpart in the modal, and the clause headings are UPPERCASE in the constant and title-case in the
component. The difference is not cosmetic: it is why the PDF site can import the constant today and
the gate site cannot, which is the whole shape of M-078's fix. Left as written rather than edited,
because a promoted artefact records what the run said.

1. **`HELP_CONTENT_DRAFT` (`lib/help/help-data.ts`) → new `docs/MECHANISABLE.md` entry, third
   instance of the M-067 class.** Verified independently: the file's own header states "DRAFT —
   `HELP_CONTENT_DRAFT` is true until Stéan's §7 content-compliance pass signs off every answer,"
   and a repo-wide grep for the identifier hits only its own declaration — no reader checks the flag
   anywhere (`/help` page and the widget import `HelpRole`/content, never this constant). Confirmed
   this is *not* already filed: grepped `docs/MECHANISABLE.md` for the string and found no existing
   entry. M-067 (`excludePlatformOrg`) and M-069 (`INFORMATION_REGULATOR_URL`) are both already on
   record as the same shape — a stated MUST/gate with zero enforcement sites, standing in for the
   enforcement itself. This is a real third instance, not previously filed. → `Promote` line below.

2. **`DISCLAIMER_GATE_TEXT` / `DOCUMENT_DISCLAIMER_TEXT` (`lib/leases/disclaimer.ts`) — genuine
   SSOT-drift defect, not dead code.** Verified by reading both alleged duplication sites directly
   (not trusting the child's citation): `components/leases/LeaseDisclaimerGate.tsx`'s `SECTIONS`
   array and lead/close paragraphs are the same attorney-reviewed text as `DISCLAIMER_GATE_TEXT`
   word-for-word (intro paragraph, all six numbered clauses, the "By clicking 'I accept'" closer),
   hand-typed rather than imported. `lib/leases/generateDocument.ts`'s `platformDisclaimer` block
   (confirmed at its `IMPORTANT NOTICE` heading and closing sentence) matches
   `DOCUMENT_DISCLAIMER_TEXT` verbatim, same pattern. Both source docs the constants cite
   (`brief/legal/FINAL_PLATFORM_DISCLAIMER.md`, `ADDENDUM_44A_CREDIT_TERMS.md §3`) are named in
   `lib/leases/disclaimer.ts`'s own comments. Two independently-maintained copies of counsel-reviewed
   liability text, no mechanism keeping them in sync — the exact "helper AND its inline
   re-implementations" pattern this project's surface names. Deleting the unused constants would be
   wrong; the live fix is wiring the two duplicate sites to import them instead. → `Promote` line
   below.

## Spellings / mechanisms swept (per child, carried forward)

All three children swept: repo-wide word-boundary grep of the exact export/type identifier, checked
against comment-only mentions (which changed several verdicts — `giveNotice`, `rescheduleInspection`,
`issueTenantPortalLinkForHandover`, `declareDirectors`/`replaceDirector`), direct-submodule-vs-barrel
import distinguished per item (not generalised from the barrel pattern, per the brief's explicit
warning), and the two knip config hints checked against every item and ruled out. Slice 2 additionally
cross-checked an untracked prior-run archive (`brief/build/_AGENT_ARCHIVE/knip-tranche-2/`) as
corroboration only, always re-verified independently at current HEAD.

## Zero-verification

No slice's headline landed at zero for any class except FALSE POSITIVE (0/103, expected — the two
config gaps genuinely don't apply here) and slice 3's duplicate-export bucket (0/41, inherited from
the parent's partition, not a re-run of knip). The DEAD buckets (57 combined) are themselves the
proof the grep method fires: each is a positive, demonstrated zero-importers-outside-the-file
result, not an assumed one, with comment-only hits explicitly distinguished from real references in
every slice's reasoning column.

## Exclusions

Same as the parent brief's scope: `node_modules`, `.next`, and generated types were not swept (none
of the 103 items live there anyway — knip already scopes to source). No slice skipped a directory
within its assigned boundary.

## Contract

```
Agent      census · P2_SWEEP · step 2 of 3
Verdict    ⚠️ decision-needed — 25 items need a human call

Summary    103/103 classified across 3 slices (57 DEAD, 21 RETAINED, 25 JUDGMENT, 0 FALSE POSITIVE),
           arithmetic reconciles at every level (slice/category/grand total). 25 JUDGMENT items need
           a human — 7 money-adjacent, 11 security/compliance, 7 other. 2 slice artefacts (1, 3)
           carry no Contract block on disk — a gap in the fan-out, not smoothed over.

Artefact   .claude/handoff/fanout-probe/02-census.md
Promote    HELP_CONTENT_DRAFT (lib/help/help-data.ts) → docs/MECHANISABLE.md as third M-067-class
           instance; DISCLAIMER_GATE_TEXT/DOCUMENT_DISCLAIMER_TEXT (lib/leases/disclaimer.ts) →
           flag as SSOT-drift defect (live UI + PDF generator hand-duplicate attorney text) rather
           than a knip deletion candidate — both verified against the tree, not taken on report.
```

---

## Appendix A — slice 1 (per-item evidence)

# Census — fan-out slice 1/3 (app/, components/, lib/auth/, lib/consent/)

Knip `npx knip --no-progress` @ HEAD `a5b6f541`. Slice = 25 items (1 file, 19 exports, 4 types, 1 duplicate-export pair).

## Headline counts

| Class | Count |
|---|---|
| DEAD | 17 |
| RETAINED | 0 |
| FALSE POSITIVE | 0 |
| JUDGMENT | 8 |
| **Total** | **25** |

By knip category: files 1 (0 DEAD / 1 JUDGMENT) · unused exports 19 (13 DEAD / 6 JUDGMENT) ·
unused types 4 (4 DEAD / 0 JUDGMENT) · duplicate exports 1 (0 DEAD / 1 JUDGMENT).
Reconciliation: 17 + 0 + 0 + 8 = 25. ✓

## DEAD (17) — zero importers outside the defining file, whole-repo grep

| File | Symbol | Reason |
|---|---|---|
| `app/(applicant)/apply/[slug]/applyDomain.ts` | `PERIOD_DIVISOR` | Grep `PERIOD_DIVISOR` repo-wide: only self-file def + self-file use (`rowMonthlyCents`). `lib/applications/incomeSources.ts` has its own separate, non-exported const of the same name — not an importer. |
| `app/(applicant)/apply/[slug]/applyReview.tsx` | `AccountStep` | Grep `AccountStep`: real JSX use only at its own file's line 434; every other hit (useApplyFlow.ts, page.tsx, buildCoResume.ts/.test.ts) is a comment. |
| `app/(applicant)/apply/[slug]/useApplyFlow.ts` | `TYPE_LABEL` | Grep `TYPE_LABEL`: used only at its own file's line 1011; every other `TYPE_LABEL`/`TYPE_LABELS` hit repo-wide is an unrelated same-named local const in a different file. |
| `app/(dashboard)/suppliers/SuppliersClient.tsx` | `SPECIALITY_OPTIONS` | It's a barrel re-export (`export { SPECIALITY_OPTIONS } from "@/lib/parties/partyConfig"`). The real consumer (`components/parties/partySteps.tsx`) imports straight from `lib/parties/partyConfig`, never from `SuppliersClient`. The re-export site is unused. |
| `components/layout/Sidebar.tsx` | `NAV_GROUPS` | Used internally (line 109) then `export { NAV_GROUPS }` (line 155); no external importer. The sibling `PORTAL_NAV_GROUPS`/`LANDLORD_NAV_GROUPS`/`SUPPLIER_NAV_GROUPS` are separate consts, each genuinely consumed by their own shell — verified each individually, not assumed from one. |
| `components/parties/partyFields.tsx` | `Stepper` | Grep `\bStepper\b`: only the definition + its own banner comment. No JSX call site anywhere, not even in `partySteps.tsx`. |
| `components/parties/partyFields.tsx` | `Field` | Used internally by `TextField`/`SelectField`/`IdField`/`PersonIdFields` in the same file, but `partySteps.tsx`'s import list from `./partyFields` (line 16) names `TextField, SelectField, IdField, EntityToggle, ChipPicker, CheckRow, PeopleRepeater, AddressFields, BankAccountsRepeater` — `Field` itself is not imported anywhere. |
| `components/parties/partySteps.tsx` | `IdentityStep` | Rendered only via its own file's `case "identity"` (line 440); no external importer. |
| `components/parties/partySteps.tsx` | `ReviewStep` | Rendered only via its own file's `case "confirm"` (line 448); the one other hit (`lib/leases/cpaApplicability.ts`) is a comment, not an import. |
| `components/parties/partySteps.tsx` | `SuccessView` | Zero render sites anywhere. Its own module header (`usePartyFlow.tsx`) documents the intended path — "the standalone modal... exposes `done` so the caller can render the SuccessView" — but read `AddPartyModal.tsx` (the only standalone host): it *always* supplies `onDone`, and its own header explains why ("Save + exit:... no success interstitial... the old behaviour re-mounted + reset the form"). The design moved away from this path; the component was left orphaned, not merely un-adopted. |
| `components/properties/PropertyCards.tsx` | `PropertyCards` | Grep confirms `PropertyList.tsx` imports only the *type* `PropertyCardData` from this file and renders the singular `PropertyCard` (different component, different file) instead. No file renders `<PropertyCards`. |
| `lib/auth/email-policy.ts` | `requiresOrgDomain` | Zero call sites anywhere. Notably, the concept it names (`portalClass === "agent"`) is re-implemented inline at ≥5 sites instead of calling this helper: `proxy.ts:224`, `app/api/auth/passkeys/registration-verify/route.ts:114`, `app/account/security/page.tsx:25`, `lib/auth/facts.ts:187`, and even inside `requiresOrgDomain`'s *own file* at `email-policy.ts:77` (`assertEmailAvailableForRole` inlines `targetRoleClass === "agent"` rather than calling the sibling helper it sits next to). The export is dead; the concept is duplicated, which is a separate, related finding worth a consolidation pass but not itself a knip item in this slice. |
| `lib/auth/mfa-host.ts` | `ALLOWED_HOSTS` | Used only inside its own file to derive the `AllowedHost` type. `filterFactorsByHost` (a different, actively-used export from the same file per `.claude/rules/routing-auth.md`) does not reference `ALLOWED_HOSTS` by name in any external grep hit. Zero external importer of the const. |
| `app/(dashboard)/landlords/[id]/LandlordVerificationCard.tsx` | `LatestPull` (type) | This file does `export type { LatestPull }` (a re-export of the type defined in `PropertyVerificationCard.tsx`). Every actual consumer (`page.tsx`, `OverviewTab.tsx`, `landlords/[id]/page.tsx`) imports `LatestPull` from `PropertyVerificationCard.tsx` directly — never from `LandlordVerificationCard.tsx`. The original type is very much alive; this specific re-export site is not. |
| `lib/auth/mfa-host.ts` | `AllowedHost` (type) | Same file as `ALLOWED_HOSTS` above; grep shows the type only appears at its own declaration line. No external importer. |
| `lib/auth/server.ts` | `SubscriptionState` (type) | `server.ts:294` does `export type { AgentWriteAction, SubscriptionState } from "@/lib/subscriptions/state"`. Checked every `from "@/lib/auth/server"` import site repo-wide (94 hits) — none names `SubscriptionState`. The real type (`lib/subscriptions/state.ts`) is genuinely used elsewhere (state.ts itself, `state.test.ts`) — only this re-export site is dead. |
| `lib/consent/verification.ts` | `SendResult` (interface) | Only two files import from `lib/consent/verification`: `app/api/consent/verify-code/route.ts` (imports `verifyCodeMatch, recordFailedAttempt, resetFailedAttempts`) and `send-code/route.ts`. Neither names `SendResult`. Confirmed with a repo-wide grep for the literal identifier restricted to `app/api/consent/` — zero hits beyond the definition. (Note: two unrelated same-named interfaces exist elsewhere — `lib/info-requests/sendInfoRequestEmail.tsx`'s own `SendResult` — out of this slice, not conflated.) |

## JUDGMENT (8) — cannot resolve without a decision that isn't ours

| File | Symbol | Why this needs a human call |
|---|---|---|
| `app/(dashboard)/leases/[leaseId]/QuickPaymentButton.tsx` (file) | — | `.claude/crawlers/INTENTIONAL.md` names this exact file: nothing renders it, so `recordPayment` + the `rent.payment_received` template under it are also unreferenced, but `recordPayment` is the only single-payment-recording implementation (bulk-import uses `record_payment_atomic` directly). The doc's own words: "That is a product question on a money path, and deleting the chain decides it... Left in place deliberately, and out of scope until it is decided." Not a fresh judgment call we're introducing — it's the exact documented open question. |
| `components/auth/CapabilitiesProvider.tsx` | `useCan` | Re-verified the known positive: grep `useCan\b` repo-wide hits only the definition, its own header comment, and one line in `lib/auth/can.ts` describing it as `can()`'s intended client counterpart. Zero call sites. Documented affordance-only hook, explicitly framed as the client half of a boundary pattern — deleting it removes a documented, load-bearing-by-design (if unadopted) primitive. |
| `components/properties/HoaRulesUpload.tsx` | `HoaUploadStub` | Comment directly above it: `// Stub upload API (placeholder — BUILD_44 wires to Supabase Storage)`. Explicitly mid-build placeholder, zero call sites. Whether BUILD_44 still needs it is a build-status call, not ours. |
| `lib/auth/can.ts` | `can` | Zero call sites (`hasCapability` in the same file is the one actually used elsewhere, e.g. `lib/auth/requireCapability.ts`). File header states outright: "ADDENDUM_RBAC Phase 4 primitives... NO gating is wired here — these are the primitives; surfaces adopt them one at a time (Phase 4 rollout)." This is a documented, deliberate incremental-adoption state, same family as `useCan`. |
| `lib/auth/orgRoles.ts` | `capabilitiesForRole` | Zero call sites. Own-file comment: "Enforcement (`can()`) consumes `capabilitiesForRole`; gating real pages/actions is a later phase." Same RBAC Phase 4 family as `can`/`useCan` — explicitly deferred, not abandoned. |
| `lib/auth/requireCapability.ts` | `requireMinTier` | Zero call sites anywhere (only its own definition matches `requireMinTier(`). Sibling `requireRouteTier` in the same file is the SSOT-path-driven guard that route layouts actually use. Header brands this file "RBAC P4 STEP 2" — same rollout family. Whether `requireMinTier` is a superseded draft or a guard reserved for a manual (non-path-derived) tier check is a design call, not a deletion call we can make from usage alone. |
| `lib/auth/server.ts` | `getCurrentSubscriptionState` | Zero call sites (the internal, uncached `getSubscriptionState` helper it wraps IS called, but the exported cached wrapper itself is not). Own comment names specific planned consumers that don't exist yet: "Used by server components that need the full SubscriptionState (e.g. email footer variant, dunning cron)." Explicitly a build-ahead-of-consumers primitive (ADDENDUM_57G). |
| `app/(applicant)/apply/[slug]/applyDomain.ts` | `STEP_DOCS_OPTIONAL` \| `LAST_DATA_STEP` (duplicate-export pair) | Both are genuinely, separately used: `STEP_DOCS_OPTIONAL` in `applyOrchestrator.tsx` (import line 28, use line 92); `LAST_DATA_STEP` in `useApplyFlow.ts` (import line 18, use line 1035). Knip flags them as a duplicate because `LAST_DATA_STEP = STEP_DOCS_OPTIONAL` literally aliases the same value — but the two names carry distinct semantic meaning at their respective call sites ("documents-optional pane index" vs "last pane that is data-entry, for the save-button gate"). Neither is dead; collapsing the alias is a naming/design call, not something usage evidence resolves. |

## Spellings / mechanisms swept

Repo-wide `Grep` for the exact export identifier (word-boundary where the name risked partial
matches, e.g. `\bField\b`, `\bcan\(`), unrestricted by directory except where noted, covering
`app/`, `components/`, `lib/`, `scripts/` (implicitly — grep was repo-root by default except two
narrowed passes), tests, and comments (to distinguish real import from doc mention). For re-export
cases (`SPECIALITY_OPTIONS`, `LatestPull`, `SubscriptionState`) I additionally traced *which file*
each real consumer imports from, since the knip finding is about a specific re-export site, not the
underlying symbol. For `QuickPaymentButton` I read `.claude/crawlers/INTENTIONAL.md` directly since
its own filename is a live entry there. No barrel `index.ts` files exist in the touched directories
(`components/parties/`, `components/properties/`, `lib/auth/`) — checked via directory listing
implicit in the grep hits; none of the 25 items are hidden behind a barrel.

## Zero-verification

Every DEAD verdict above is a demonstrated zero: the identifier's whole-repo grep returns only its
own declaration (and, in several cases, doc comments that mention the name without calling it —
explicitly distinguished from a real import in the reason column). None of these are "the pattern
never fires" — they are all identifiers that DO appear via plain string grep (proving the search
itself works), just nowhere as an import/call/JSX-tag outside the defining file. No FALSE POSITIVE
class applied in this slice: the two known knip-config gaps named in the brief (`types/**/*.ts`
glob, `.css` compiled-extension imports) don't apply to any of these 25 — none are under a `types/`
path and none are CSS-adjacent.

## Boundaries

Read-only. No file edited. No item outside the 25-item slice classified. Two configuration-only
directory checks (implicit barrel-file absence) do not constitute scope creep — they were necessary
to resolve which specific re-export site a given knip finding pointed at.

---

## Appendix B — slice 2 (per-item evidence)

# fanout-probe-slice2 — census (P2_SWEEP, step 2 of 3, fan-out slice 2/3)

**Slice:** `lib/constants.ts` (top-level file only) · `lib/crypto/` · `lib/dates/` · `lib/exports/` ·
`lib/finance/` · `lib/payfast/` · `lib/popia/` · `lib/subscriptions/` · `lib/tier/`
**Items:** 37 knip findings (1 file, 32 exports, 2 types, 2 duplicates), all classified below.
anchor: task=fanout-probe-slice2 · agent=census · utc=2026-08-21T09:00:00Z · commit=a5b6f541

**Commit observed:** `a5b6f541` (HEAD, unchanged throughout).

## Headline counts

| Class | Files | Exports | Types | Duplicates | Total |
|---|---|---|---|---|---|
| DEAD | 0 | 17 | 1 | 0 | 18 |
| RETAINED | 1 | 13 | 1 | 2 | 17 |
| JUDGMENT | 0 | 2 | 0 | 0 | 2 |
| FALSE POSITIVE | 0 | 0 | 0 | 0 | 0 |
| **Total** | **1** | **32** | **2** | **2** | **37** |

Reconciliation: 18 + 17 + 2 + 0 = **37**, matches the slice total. No FALSE POSITIVE class used —
neither of the two repo-wide config hints (`types/**/*.ts` glob, `.css` imports) applied to any item
in this slice.

## A prior run of this exact task exists — used as corroborating evidence, not copied

`brief/build/_AGENT_ARCHIVE/knip-tranche-2/{01-census.md,02-main.md}` (untracked OneDrive doc,
SHA `b180a53a`, different knip flags/count) already litigated 8 of these exact symbols as
POPIA/compliance scaffolding and Main explicitly ruled KEEP on all of them with reasoning. I
independently re-verified each (fresh greps at `a5b6f541`) rather than copying the verdict, and it
agrees. Cited per-item below as corroboration, never as the sole reason.

## Classification table

### DEAD (18)

- `lib/screening/combinedAffordability.ts` + `lib/applications/freeAssessment.ts` doc-comments cite
  **`GUARANTOR_MIN_INCOME_MULTIPLE`** (`lib/constants.ts`) as the guarantor-scoring mechanism, but
  the live implementation (`freeAssessment.ts:suretyUnitsCoverRent`/`guarantorBestResidualCents`)
  scores guarantors by pooled **residual income**, not a multiple — confirmed by
  `freeAssessment.test.ts`: `"stretched high-earner guarantor is no security → does-not-qualify
  (residual, not a multiple)"`. Stale comment pointing at a superseded design; zero real consumers.
- `lib/crypto/bankAccount.ts:maskBankAccount` — zero external callers; only self-call within the
  same file (line 77). A differently-defined `maskBankAccount` in `lib/applications/reviewMasking.ts`
  is the one actually used (tested in `reviewMasking.test.ts`) — two same-named, unrelated twins.
- `lib/crypto/encryption.ts:encryptIfNeeded` — zero callers anywhere in the repo (grepped `encryptIfNeeded` whole-repo).
- `lib/crypto/index.ts:encrypt` — barrel re-export unused; real callers import `encrypt` directly
  from `@/lib/crypto/encryption` (e.g. `lib/applications/applicantAdapter.test.ts`).
- `lib/crypto/index.ts:decrypt` — barrel unused; real caller imports directly
  (`lib/screening/bundle-runner.ts`).
- `lib/crypto/index.ts:decryptNullable` — barrel unused; real caller imports directly
  (`app/(dashboard)/listings/[slug]/applications/[id]/_actions.ts`).
- `lib/crypto/index.ts:encryptIfNeeded` — same underlying function as above, zero callers anywhere.
- `lib/crypto/index.ts:isEncrypted` — barrel unused; real usage is cross-file within `lib/crypto`
  itself (`idNumber.ts`, `bankAccount.ts` both `import { isEncrypted } from "./encryption"`).
- `lib/crypto/index.ts:hashIdNumber` — barrel unused; real callers import directly from
  `@/lib/crypto/idNumber` (`lib/import/importRunner.ts`, `lib/applications/applicantAdapter.ts`, etc).
- `lib/crypto/index.ts:validateSAIdNumber` — barrel unused; real caller imports directly
  (`lib/import/importRunner.ts`).
- `lib/crypto/index.ts:maskIdNumber` — barrel unused; real caller imports directly
  (`lib/applications/reviewMasking.ts`).
- `lib/crypto/index.ts:maskBankAccount` — same underlying function as the bankAccount.ts entry
  above, zero callers anywhere.
- `lib/dates/holidayAudit.ts:isWithinHolidayHorizon` — this specific re-export (`export {
  isWithinHolidayHorizon } from "./saPublicHolidays"`) is unused; the function itself is alive via
  the MAIN barrel (`lib/dates/index.ts` re-export, imported by `lib/leases/cpaRenewal.ts` as
  `import { ..., isWithinHolidayHorizon } from "@/lib/dates"`) and via direct submodule import
  elsewhere. Only the redundant secondary re-export point is dead.
- `lib/dates/index.ts:addBusinessDays` — barrel re-export unused (confirmed against the full list
  of `@/lib/dates` importers, incl. multi-line import blocks); real callers use direct import from
  `@/lib/dates/saPublicHolidays` (`lib/notices/preconditions.ts`).
- `lib/dates/index.ts:subtractBusinessDays` — barrel unused; the advisory function is used only
  internally in `saPublicHolidays.ts` and its own test file, both via direct/relative import.
- `lib/dates/index.ts:isPublicHoliday` — barrel unused; used only internally in `saPublicHolidays.ts`
  and directly by its own test file (`import ... from "./saPublicHolidays"`), never via the barrel.
- `lib/dates/index.ts:HOLIDAY_TABLE_COVERS_FROM` — barrel unused; real usage via direct import from
  `./saPublicHolidays` in `lib/dates/holidayAuditFetch.ts`.
- `lib/constants.ts:LeaseType` (type) — zero external imports of this type anywhere. Note: a
  separate, independently-declared `LeaseType` type exists in `lib/import/classify.ts`
  (`"residential" | "commercial"`) and IS used there (`classifyLeaseType`) — a same-name collision
  between two unrelated declarations, not a re-export relationship. `constants.ts`'s version is dead.

### RETAINED (17)

- `lib/tier/canDowngradeTo.ts` (file) — self-documented "ready-to-wire" (header: enforces the
  lease-cap downgrade invariant, paired with `buildSubscriptionForm`). Corroborated: prior-run
  judgment site, Main ruled KEEP ("compliance/product feature half-built, deleting removes the
  record it was started").
- `lib/constants.ts:HOA_LIMITS` — doc comment names its future consumer explicitly:
  `canCreateHoaEntity() reads this (Stage 2)`. `canCreateHoaEntity` does not exist anywhere in the
  repo yet (grepped whole-repo, zero hits) — genuine not-yet-built future consumer, not a stale claim.
- `lib/constants.ts:FOUNDING_AGENT_PRICE_CENTS`, `FOUNDING_AGENT_DURATION_MONTHS` — documented
  pricing constants ("Founding agent pricing — first 10 clients, 24-month lock"). Corroborated:
  prior run's own KEEP list, "already-held ground per task brief."
- `lib/exports/bundle.ts:verifyBundle` — POPIA export-bundle hash/tamper verifier, zero callers.
  Corroborated: prior-run judgment site, Main ruled KEEP (same unwired compliance-scaffolding family).
- `lib/finance/sarsCategories.ts:PROVISIONAL_TAX_THRESHOLD_CENTS` — codifies a documented SARS
  statutory threshold (R30,000). Corroborated: prior-run KEEP, "deleting removes the documented
  figure even though nothing reads it yet."
- `lib/payfast/forms.ts:buildSubscriptionForm` — paired scaffolding with `lib/tier/canDowngradeTo.ts`:
  each file's comment names the other as the missing half of one not-yet-built tier-downgrade
  feature (`forms.ts`: "See lib/tier/canDowngradeTo.ts"; `canDowngradeTo.ts`: "call
  buildSubscriptionForm... once that action is built"). Same reasoning as the already-corroborated
  `canDowngradeTo` KEEP.
- `lib/popia/erasure.ts:anonymiseRecord` — own `eslint-disable` comment: "has no caller in the
  codebase (unwired)... Flag for a human when wired." Corroborated: prior-run judgment site, Main
  ruled KEEP.
- `lib/popia/export.ts:regenerateExport` — sibling POPIA-export function, same unwired engine
  family. Corroborated: prior-run judgment site, Main ruled KEEP.
- `lib/popia/requests.ts:assignRequest` — own `eslint-disable` comment, same "REVIEW:...unwired...
  Flag for a human when wired" pattern as `anonymiseRecord`. Corroborated: prior-run KEEP.
- `lib/popia/retention.ts:getRetentionForSubject` — explicitly tracked by
  `lib/invariants/__tests__/invariant-coverage.test.ts` (`INVARIANT_REGISTRY`, `pending: "POPIA
  erasure Phase 2 not built — getRetentionForSubject defined but no caller yet"`) — a live repo
  mechanism that deliberately pins its unwired state and would ratchet red if the pending flag were
  removed without the function acquiring a caller.
- `lib/popia/retention.ts:getErasureEligibleDate` — same file, same POPIA-erasure-Phase-2 family as
  `getRetentionForSubject` immediately above it. Corroborated: prior-run judgment site, Main ruled
  KEEP.
- `lib/popia/screeningArtefactPurge.ts:countEligibleScreeningArtefacts` — documented dry-run safety
  check ("BEFORE deleting anything... the non-destructive dry-run"), unwired but deliberate.
  Corroborated: prior-run judgment site, Main ruled KEEP.
- `lib/subscriptions/acceptance.ts:getLatestTosAcceptance` — named with call-site pseudocode at
  `brief/legal/TOS_ARCHIVAL_SPEC.md:52,73,346` (an untracked OneDrive spec doc knip cannot trace).
  Independently re-read the spec file myself (not just the archived finding) — confirmed present.
  This is the exact site `docs/MECHANISABLE.md` M-064 records as a near-miss false-DEAD from a CRLF
  parsing bug in an earlier census run; re-verified clean here.
- `lib/popia/erasure.ts:ErasurePreview` (type) — travels with `anonymiseRecord` in the same module/
  feature. Corroborated: prior-run judgment site, Main ruled KEEP.
- `lib/crypto/idNumber.ts:encryptIdNumber|encryptDob` (duplicate export) — deliberate alias, not
  accidental duplication: comment reads "Aliases kept for the apply-flow call sites that DO write
  the text dob columns; tolerant decrypt as above" (`encryptDob = encryptIdNumber`). Both names have
  independent real callers (`encryptIdNumber` in `app/api/applications/create/route.ts`; `encryptDob`
  in `app/api/applications/co-applicant/[token]/save/route.ts`).
- `lib/crypto/idNumber.ts:decryptIdNumber|decryptDob` (duplicate export) — same deliberate-alias
  pattern (`decryptDob = decryptIdNumber`). Both independently imported (`decryptIdNumber` widely;
  `decryptDob` in `app/(applicant)/apply/[slug]/page.tsx`, `promoteApplicantToTenant.ts`, etc).

### JUDGMENT (2)

- `lib/subscriptions/retention.ts:RETENTION_PROTECTED_TABLES` — doc comment states as present fact
  "BUILD_65 imports this array rather than defining its own," but zero import sites were found
  anywhere in `lib/popia/*` or elsewhere (whole-repo grep). Doc and code disagree — same shape as the
  prior run's `getCurrentSubscriptionState` finding, which that run explicitly left to a human rather
  than resolving. Not deciding here whether the doc is stale or the wiring is simply missing.
- `lib/subscriptions/emails.tsx:formatDate` — exported with comment "// formatDate used by purge step
  callers," but none of the 7 files that import from `@/lib/subscriptions/emails` (checked all of
  them) import `formatDate`, and no cron route or script does either (a same-named but unrelated
  local `formatDate` exists in `app/api/cron/arrears-sequence/route.ts`, confirmed distinct). Doc
  claims a specific consumer that does not exist in the tracked tree — needs a human to say whether
  the "purge step callers" are simply not yet written, or the comment/export is stale.

## Spellings/mechanisms swept

- Direct submodule import vs barrel import, checked separately for every `lib/crypto/index.ts` and
  `lib/dates/index.ts` re-export (this is the exact failure mode the brief warned against — verified
  per symbol, not generalised from the barrel pattern).
- Self-documented "unwired"/"REVIEW" comments, `.claude/.../invariant-coverage.test.ts`'s pending
  ratchet, and untracked `brief/` spec references — three distinct RETAINED mechanisms, not treated
  as interchangeable.
- Cross-checked every close call against the prior `knip-tranche-2` archive run (different SHA,
  different knip flags) as corroboration, always re-verified independently at current HEAD, never
  copied uncritically.

## Zero-verification

No class in this slice landed at zero, so the "does the pattern fire" concern doesn't directly
apply — but the DEAD class (18 items) is itself evidence the grep method fires: e.g.
`GUARANTOR_MIN_INCOME_MULTIPLE`, `LeaseType`(constants.ts), and 7 of the 9 crypto-barrel entries were
positively confirmed unreferenced via exhaustive whole-repo/whole-barrel-importer-list greps, not
assumed from absence in a narrow search.

## Exclusions

None beyond the slice boundary itself (the 9 named directories/files). No generated code, test
fixtures, or migrations were skipped within scope — `supabase/migrations/*.sql` comments were
checked (SQL doesn't import TS, but several constants are *documented* there, which fed the
RETAINED reasoning for `HOA_LIMITS` and `RETENTION_PROTECTED_TABLES`).

## Contract

```
Agent      census · P2_SWEEP · step 2 of 3 (fan-out slice 2/3)
Verdict    ✅ proceed — 37/37 classified, reconciled

Summary    18 DEAD, 17 RETAINED, 2 JUDGMENT, 0 false positives across 37 items; reconciles to 37.
           All 9 `lib/crypto/index.ts` barrel entries verified individually (none blanket-RETAINED)
           — 7 have real direct-submodule consumers, 2 are fully dead. 2 items (RETENTION_PROTECTED_
           TABLES, formatDate) need a human call on stale-doc-vs-missing-wiring; not decided here.

Artefact   .claude/handoff/fanout-probe-slice2/02-census.md
Promote    none
```

---

## Appendix C — slice 3 (per-item evidence)

# Knip census — slice 3/3 (lib/actions, applications, comms, help, inspections, leases, legal, parties, portal, queries, reports, screening, searchworx, maintenance, extraction)

Parent: P2_SWEEP, step 2 of 3, fan-out slice 3/3. Commit anchor: a5b6f541 (HEAD, not moved).

## Headline

41 items total (2 files + 28 exports + 11 types + 0 duplicates) = 41. Reconciled below.

| Class | Files | Exports | Types | Total |
|---|---|---|---|---|
| DEAD | 0 | 13 | 9 | 22 |
| RETAINED | 0 | 2 | 2 | 4 |
| JUDGMENT | 2 | 13 | 0 | 15 |
| FALSE POSITIVE | 0 | 0 | 0 | 0 |
| **Total** | **2** | **28** | **11** | **41** |

22 + 4 + 15 + 0 = 41. ✓

## DEAD (22) — grep across whole repo outside defining file found zero real call sites (comment-only mentions distinguished from calls)

Exports (13):
- `rescheduleInspection` — `lib/actions/inspections.ts`. Only reference elsewhere is a comment in the paired comms template ("Fired from rescheduleInspection"); no `import` anywhere. Sibling exports of the same file (`updateItemCondition`, `updateInspectionStatus`, `createInspection`) ARE imported by UI.
- `giveNotice` — `lib/actions/leases.ts`. Zero imports anywhere in `app/`/`components/`/`lib/`; four other files only *mention* it in prose comments describing its behaviour. No "Give notice" UI control found under `app/(dashboard)/leases`.
- `getRoomTemplate`, `getItemsForRoom` — `lib/inspections/roomTemplates.ts`. Header calls the file itself "legacy flat fallback...the richer path is templateEngine." Confirmed: `templateEngine.ts` reimplements the same lookup as `getItemsForRoomType` (imported live by `seedRooms.ts`), importing the underlying `RESIDENTIAL_ITEMS`/`COMMERCIAL_ITEMS` data constants directly rather than calling these two accessors. Classic inline-reimplementation supersession.
- `validateIdentity`, `validateDetails` — `lib/parties/partyValidation.ts`. Superseded by the per-step wizard validators in the same file (`validateIdentityCore`, `validatePeopleStep`, etc.), which ARE imported live by `app/(applicant)/apply/[slug]/useApplyFlow.ts`.
- `fetchApplicationsAction` — `lib/queries/portfolioActions.ts`. 7 sibling `fetch*Action` wrappers of identical shape; this is the only one with zero importers.
- `getApplicationFee` — `lib/screening/searchworxBundle.ts`. A deliberate re-export (`export { getApplicationFee }`, comment: "Re-exported for callers already holding this module") of the real definition in `lib/constants.ts`. Zero external consumers import it via the searchworxBundle path — all callers (`lib/applications/emails.tsx`) import from `lib/constants.ts` directly. Deleting the re-export line is safe; the canonical function is very much alive.
- `COMBINED_SEARCH_TYPE`, `COMBINED_DISPLAY_NAME`, `COMBINED_DESCRIPTION` — `lib/searchworx/products/combinedConsumerCreditReport.ts`. Sibling constants `COMBINED_PRODUCT_KEY`/`COMBINED_COST_CENTS` ARE imported live by `lib/screening/searchworxBundle.ts` and `bundle-runner.ts`; these three (search-type code + display metadata) have no consumer anywhere — no product catalogue/listing UI exists yet.
- `VCCB_SEARCH_TYPE` — `lib/searchworx/products/vccbIncomeEstimator.ts`. Same pattern as above; sibling `VCCB_PRODUCT_KEY`/`VCCB_COST_CENTS` are live, this metadata constant is not.

Types (9):
- `TemplateBodyVariants` re-export — `lib/comms/templates/seed/render.ts`. Canonical definition lives in `blocks/types.ts`; all real consumers (`seed/types.ts`, `resolveTemplate.test.ts`) import from there directly, not via this file's `export type {...}` line.
- `PipelineDocumentResult` re-export — `lib/extraction/pipeline.ts`. Comment claims the re-export exists "so reconciler/fraud can consume them" but both `reconciler.ts` and `fraudSignals.ts` import the type directly from `./types` — the justifying comment is stale.
- `ApplicantEmployment`, `NarrativeResponse`, `ExpenditureItem`, `FitScoreFinancialAnalysis` — all re-exported (`export type {...}`) from `lib/reports/screening/_pdf/primitives/theme.ts`, sourced from `../../_primitives/theme`. Every actual `_pdf`-side consumer (`agent_single.tsx`, `agent_multi.tsx`, render scripts) imports only `FitScoreReportData`/`FitScoreCreditAnalysis`/`C` from this path, never these four. The underlying interfaces remain fully live via direct import from `_primitives/theme.ts`.
- `ChartPoint`, `PieSlice` — `lib/reports/svgCharts.ts`. Unlike sibling `ChartBar` (used by the live `barChart()` function), no `lineChart`/`pieChart` function exists anywhere in the file — these two interfaces describe chart shapes that were never implemented, not even structurally referenced internally.
- `BankStatementExtraction` — `lib/screening/bankStatementExtraction.ts`. Grepped the whole file: appears exactly once (its own declaration) — not even used internally by `buildExtractionPrompt` in the same file. Note: a **different, actually-used** `BankStatementExtraction` interface exists at `lib/extraction/types.ts:238` (different shape) — a real name collision between two extraction subsystems; the flagged one is the dead one.
- `T` — `lib/reports/screening/_primitives/theme.ts`. A `StyleSheet.create()`-shaped style object. The `_pdf/primitives/theme.ts` sibling file has its *own*, separately-defined `T` (line 135) that IS consumed by `SectionHeader.tsx`/`BlockHeader.tsx` (react-pdf needs `StyleSheet` objects). The web-side primitives (`_web/primitives/*.tsx`) use Tailwind `className` throughout and never reference this web-theme `T` — architecturally dead, not a knip miss.

## RETAINED (4) — referenced/justified in a way knip cannot see; mechanism named

- `getTosHighlights`, `getPrivacyHighlights` — `lib/legal/changelog.ts`. **This is the exact TOS_CHANGELOG scenario the census framework's own field-cost warning describes**, already resolved once in this repo: the module's own header states "As at 2026-08-20 nothing calls getTosHighlights or getPrivacyHighlights... The wiring is unbuilt, not broken... TOS_CHANGELOG carries drafted v3.4.0 changelog copy and is the reason this module survived a dead-code sweep." `PRIVACY_CHANGELOG` (the sibling data object) is empty; `TOS_CHANGELOG` is not. A prior pass already decided: keep. Not re-litigated here.
- `WarrantyMatchInput`, `WarrantyMatchResult` — `lib/maintenance/warranty.ts`. Header: "findWarrantyMatch (the Haiku match call) was removed 2026-08-20 as a dead export. WarrantyMatchInput/WarrantyMatchResult survive it and are now unreferenced; they are kept because reviving the match call needs its contract, not because anything uses them." An explicit, already-made decision.

## JUDGMENT (15) — cannot classify without a decision that isn't mine

Files (2):
- `lib/actions/payments.ts`, `lib/comms/templates/tenant/rent/payment-received.tsx` — Documented in `.claude/crawlers/INTENTIONAL.md`: "`QuickPaymentButton` → `lib/actions/payments.ts` is a dead chain around a LIVE money path." `recordPayment` is the only single-payment recording implementation (bulk-import calls the RPC directly); its one caller, `QuickPaymentButton.tsx`, is itself rendered by nothing. The doc explicitly frames this as "a product question on a money path" and says deleting the chain decides it — not census's call.

Exports (13):
- `declareDirectors`, `replaceDirector` — `lib/applications/commercial.ts`. **The flagged known positive, re-verified myself, not taken on trust.** Repo-wide grep confirms zero importers outside the file's own definition. Both functions carry their OWN source comments: `declareDirectors` — "Gate-before-wiring — unwired today; when wired to the commercial flow (Step 1.5)..."; `replaceDirector` — "Auth: applicant token bound to this application (gate-before-wiring — unwired today)." This is direct, first-party evidence of mid-build, not inference from absence. Money-adjacent exactly as briefed: `replaceDirector` queries `application_screening_payments` and flags a refund; `declareDirectors` inserts director/co-applicant rows and drives real invite emails. The surrounding commercial-application flow (director-portal pages, consent, payment, `co-parties` status page) is extensively live — only the declare/replace entry points are unwired.
- `createMunicipalAccount`, `uploadMunicipalBill` — `lib/actions/municipal.ts`. Zero callers anywhere in `app/`/`components/`. Same file's siblings `confirmMunicipalBill`/`markMunicipalBillPaid` ARE live (imported by `MunicipalBillActions.tsx`). The municipal-bills list page's own empty-state copy says "Upload a municipal bill PDF from a property's page to start tracking" — describing a flow that does not exist anywhere in the property pages I checked (`PropertyDocumentsTab.tsx`, `OverviewTab.tsx`, `PropertyVerificationCard.tsx`). Same shape as the documented `payments.ts` case (live downstream, missing/unwired entry point) but not itself covered by an `INTENTIONAL.md` note — flagging for a product decision rather than assuming the same verdict.
- `excludePlatformOrg` — `lib/comms/platform-org.ts`. Already documented in `docs/MECHANISABLE.md` **M-067**: "a stated MUST with zero call sites... not dead code — it is an unenforced invariant." The doc explicitly sequences the needed work (census every org-iterating query first) before any deletion or wiring decision.
- `INFORMATION_REGULATOR_URL` — `lib/comms/templates/ApplicantLegalFooter.tsx`. Same class, documented as "Second instance of M-067's class" in `docs/MECHANISABLE.md`. Measured 34 lines/14 files of competing/volatile Information-Regulator text still live in the tree; a competing SSOT (`lib/external-links.ts`) is what's actually consumed. The doc states explicitly: "which constant wins... is CD's [decision], not a lint question."
- `HELP_CONTENT_DRAFT` — `lib/help/help-data.ts`. **New instance of the same M-067 class, not previously filed.** Header: "Flip to false only after Stéan's §7 content-compliance pass (D-HELP-20)" — a stated compliance gate with zero readers anywhere (`/help` page and the widget only import `HelpRole`/content, never this flag). Either the gate is genuinely not needed yet, or draft, non-compliance-reviewed content is already live with no code checking the flag — the same "unenforced invariant" shape as M-067, worth filing alongside it.
- `DISCLAIMER_GATE_TEXT`, `DOCUMENT_DISCLAIMER_TEXT` — `lib/leases/disclaimer.ts`. Not simple dead code: the LIVE UI (`components/leases/LeaseDisclaimerGate.tsx` SECTIONS array) and the LIVE PDF generator (`lib/leases/generateDocument.ts` platformDisclaimer paragraphs) both **hand-duplicate this exact attorney-reviewed text verbatim**, citing the same source docs (`brief/legal/FINAL_PLATFORM_DISCLAIMER.md`, `ADDENDUM_44A_CREDIT_TERMS.md §3`) instead of importing these constants. This is the "helper AND its inline re-implementations" pattern the project surface warns about, discovered live: two independently-maintained copies of counsel-reviewed liability text with no mechanism keeping them in sync. Deleting the unused SSOT constants is not obviously correct — the better fix may be wiring the live components to import them. Not census's call.
- `getTosHighlights`/`getPrivacyHighlights` sibling risk noted above under RETAINED, not repeated here.
- `NOT_SHORTLISTED_REASON_LABELS`, `WITHDRAWN_REASON_LABELS` — `lib/screening/decisionReasonLabels.ts`. File header: these `Record` types are deliberately exhaustive "union-traps" over counsel-signed decision-reason code unions — "if counsel adds a code... this file fails to compile until the new code gets a label." Only `DECLINE_REASON_LABELS` (sibling in the same file) is actually rendered, by `DeclineDecisionModal.tsx`; the not-shortlisted/withdrawn codes ARE set programmatically elsewhere (`declineStage1Action(id, "not_shortlisted_property_withdrawn")` in `listingActions.ts`) but no UI currently renders a human label for them (`status/page.tsx` just shows a generic "declined" state). Deleting removes a compile-time safety net for two counsel-governed code unions, not merely inert code.
- `issueTenantPortalLinkForHandover` — `lib/portal/inviteTenant.ts`. Extensively documented as the sole sanctioned exception to "no portal action may return a session credential" (ADDENDUM_62F §3.1/§16, ratified after a real incident where a sibling function leaked a 90-day tenant session). The parity test (`no-session-credential-leak.test.ts`) only regex-scans source text for this name — it does not call/import the function, so it is not a real reference. Zero actual callers anywhere (`app/(tenant)/tenant/access/page.tsx` only *mentions* it in a comment). Security-reviewed, owner-only, 48h-TTL hand-over path with no UI wired to invoke it — mid-build or abandoned, indistinguishable from here, and too security-sensitive to guess.
- `normaliseOwnerType` — `lib/searchworx/utils.ts`. Consumes a `source: "deeds" | "lightstone" | "cipc"` discriminator, but `lib/searchworx/products/deedsSearch.ts` is explicitly headed "(stub) ... Stub pending per-product UAT spike... no real UAT call has been made yet" and returns raw, unparsed responses — the owner-type-bearing response parsers this helper is written for don't exist yet. Mid-build, written ahead of its callers.

## Spellings / method

Grepped each of the 41 exact symbol/type names repo-wide (`Grep` tool, no path restriction, then narrowed per-file) — covering `app/`, `components/`, `lib/`, `scripts/`, `supabase/migrations/`, `*.test.ts`, `docs/`, `.claude/`. For every hit outside the defining file, read enough surrounding context to distinguish a real `import`/call from a comment-only mention (this distinction changed the verdict for `rescheduleInspection`, `giveNotice`, `issueTenantPortalLinkForHandover`, and `declareDirectors`/`replaceDirector`). No dynamic-import or string-path loading pattern was found for anything in this slice.

## Zero-verification

This slice's only zero bucket is duplicate exports (0/41) — that count is inherited from the parent's knip run and partition, not independently re-run by me. I did not re-invoke `npx knip`. For the DEAD/JUDGMENT/RETAINED classification work itself, the "does my grep actually distinguish real references from noise" check was proven positive multiple times: `giveNotice` and `rescheduleInspection` both had multiple comment-only hits that a naive file-count would have misread as "referenced" — reading each hit's context downgraded them correctly to DEAD. `declareDirectors`/`replaceDirector` (the supplied known positive) were re-derived independently rather than trusted, and the "unwired today" comments in the functions' own bodies are stronger evidence than the zero-grep alone.
