# Current Session State
_Updated by CC after every meaningful step. Read this before INDEX.md._

## Active work
**BUILD_64 Phase 0 — ✅ DONE (2026-05-12, 8a40584a)**

Phase 0 (schema) shipped:
- `trust_reconciliation_periods` + `trust_audit_exports` + `bank_recon_sessions` tables in `004_leases_financials.sql`
- Two immutability triggers on `trust_transactions` (INSERT + UPDATE/DELETE period-open checks)
- `ppra_ffc_expiry_date date` column on `organisations`
- Back-link FK: `trust_reconciliation_periods.audit_export_id → trust_audit_exports.id`
- `trust-audit-exports` Storage bucket (private, 50 MB limit, pdf+xlsx only)
- `idx_trust_txn_one_opening_per_period` unique index (one opening-balance row per org+month)
- `001_foundation.sql §3`: COMMENT ON bank_accounts doctrine enforcement (D-TRUST-01)
- Applied to live DB — all 3 tables confirmed, all 5 triggers confirmed, bucket confirmed

**BUILD_64 Phase 1 — ✅ DONE (2026-05-12, 164d1f8f)**
- `lib/trust/invariants.ts` — `assertPleksIsNotTrustee`, `SovereignTrustViolation`, `recordTrustTransaction`
- `lib/trust/close.ts` — `closeTrustPeriod()` server action with step-up + IP capture
- `eslint.config.mjs` — payment-initiation package import block (Stitch/Ozow/SnapScan/bank APIs)

**BUILD_64 Phase 2 — ✅ DONE (2026-05-12, bd3038b4)**
- `app/(dashboard)/finance/trust-ledger/close/page.tsx` — three-balance close form, wires `closeTrustPeriod` with step-up challenge flow
- `app/(dashboard)/finance/trust-ledger/audit/[periodId]/page.tsx` — read-only signed-off period audit view

**BUILD_64 Phase 3 — ✅ DONE (2026-05-12, 5635330e)**
- `lib/trust/TrustAuditPdf.tsx` — React-PDF component (6 pages)
- `lib/trust/audit-export.ts` — generateAuditExport(): PDF+XLSX gen, SHA-256 hash, Supabase Storage upload
- API routes: pdf + xlsx serve from storage with org-ownership verification
- `lib/trust/close.ts` — wired generateAuditExport() non-fatally

**BUILD_64 Phase 4 — ✅ DONE (2026-05-12, 8fcd0ec7)**
- `app/(landlord)/landlord/trust-summary/page.tsx` — landlord deposit summary with sovereign notice
- `LandlordSidebar.tsx` — "Trust deposits" nav entry added

**BUILD_64 Phase 5 — ✅ DONE (2026-05-12, b0bcab63)**
- `app/(admin)/admin/trust-health/page.tsx` — overdue agencies, acknowledged variances, FFC expiry

**BUILD_64 Phase 6 — ✅ DONE (2026-05-12, 62c38b1b)**
- `app/(public)/for-agents/trust-account/page.tsx` — sovereign trust account marketing page

**fix(trust): csv_storage_path → xlsx_storage_path (2026-05-12, dcc736b4)**
- Migration rename + code updates (audit-export.ts, xlsx route, audit page)
- **Action required:** run the DO block at bottom of `004_leases_financials.sql` against live DB

**BUILD_64 Phase 7 — ✅ DONE (2026-05-12, 4e9a4b25)**
- `brief/legal/TRUST_ACCOUNT_POSITIONING.md` — doctrine doc (legal citations, enforcement layers, exception process)
- `CLAUDE.md` — required-reading pointer

**BUILD_64 Phase 8 — ✅ DONE (2026-05-12, abd3e07c)**
- `app/api/cron/trust-period-close/route.ts` — monthly cron, flips ready sessions to ready_for_close
- Wired into daily orchestrator under dayOfMonth === 1

**BUILD_64 — ✅ FULLY COMPLETE (2026-05-12)**

**BUILD_64 follow-up audit — ✅ DONE (2026-05-13)**
- `chore(observability)`: monthly cron tracking in `health.ts` — TRACKED_MONTHLY_JOBS + 35-day staleness (035f88ad)
- `feat(trust)`: SovereignBadge component (§3.3) wired on all 4 trust-ledger pages: index, close, audit, admin trust-health (7f52998a)
- trust_transactions direct inserts: 9 files found bypassing `recordTrustTransaction()` — reported to CD, not changed (significant migration)
- .gitignore: `.claude/` already covers worktrees — no change needed
- RUNBOOK_TRUST_CLOSE.md: deferred to post-first-customer per CD decision

**Next action: ADDENDUM_60B — Warranty tracking** (see queue in INDEX.md)
**Active step: Steps 5–9 pending** (Step 4 done — WarrantiesCard shipped aab0a3de)

Gate 2 — ✅ CLOSED (2026-05-08, f17d156d) — retained counsel package ready to send
ADDENDUM_57G — ✅ ALL STEPS DONE (2026-05-09, d919b338 + d80b774c)
BUILD_67 Phase 1 — ✅ DONE (2026-05-09, 26acef02) — 8 of 9 rules; searchworks-connectivity deferred
ADDENDUM_63C — ✅ DONE (2026-05-11, 61bcbea0) — WhatsApp router + template builders + cron wiring shipped

**Bug fixes shipped (2026-05-11):**
- 5a65f009 — `CommExportPdf.tsx` fontkit RangeError (sanitizePdfText for Helvetica); `preferences.ts` Supabase union type; `paia-manual-pdf` route try-catch
- 1830dbd0 — PAIA PDF: WOFF2 → local Inter Tight TTF variable font (fontkit doesn't support WOFF2)
- f1534741 — `public/InterTight-VariableFont_wght.ttf` committed (567 KB, required for Vercel build)
- Dependabot PR #45 (18 npm bumps) auto-merged; `dependencies` + `ci` GitHub labels created

**Newly unblocked:**
- ADDENDUM_67B `communication-fallback` rule — ADDENDUM_63C dependency satisfied

**Deferred gaps (not blocking anything):**
- ADDENDUM_57H — ToS archival gap closure (reactivation, ownership transfer, privacy banner)
- ADDENDUM_67D — Bounce surface UI — Phase 1 ready for CC (`<ContactField>` + 5-6 page query updates); Phase 2+3 after AT approvals

**Gate 2 ops task (Stéan — one-time):**
- ✅ `ARCHIVE_DEPLOY_SECRET` removed — no longer needed (manual route deleted)
- ✅ Legal archive is now automatic: daily cron runs `runLegalArchiveStep()`, archives within 24h of any legal version deploy
- Verify after next cron run: Supabase Storage → `legal-archive` bucket + `cron_runs.metadata` for that day's daily job
- `LEGAL_SITE_URL=https://pleks.co.za` must remain set in Vercel env vars (cron fetches from apex)

**BUILD_67 Phase 1 status:**
- ✅ Engine infrastructure: `lib/rules/types.ts`, `lib/rules/engine.ts`, `lib/rules/registry.ts`
- ✅ `rule_runs` table (`010_platform_features.sql §24`)
- ✅ `applications.pii_purged_at` column (`005_operations.sql`)
- ✅ Schema drift zeroed: 2 missing tables (`audit_exports`, `tos_acceptances`) + 6 missing columns applied
- ✅ Spec contradiction resolved (v1.2): existing 23 cron handlers untouched; cron migration → ADDENDUM_67C
- ✅ Rules shipped: `rejected-applicant-purge`, `deposit-return-t7-alert`, `deposit-return-t1-alert`, `deposit-deadline-breach`, `trust-reconciliation-drift`, `unallocated-receipt-flag`, `fica-expiry`, `email-bounce-alert`
- ✅ `rule_runs` table confirmed in live DB — was applied last session, concern was stale
- ⬜ Remaining: `searchworks-connectivity` — deferred (no API credentials)
- **Phase 1 is effectively complete.** 8 of 9 rules shipped; 9th deferred with documented reason.

Next build: ADDENDUM_63C — WhatsApp router

**Deferred gaps (not blocking anything):**
- ADDENDUM_57H — ToS archival gap closure (reactivation wire-up, ownership transfer wire-up, privacy banner) — implement when parent features ship

---

## ADDENDUM_57G — Status

**Steps 1–9: ✅ DONE (2026-05-08)**

| Step | What | Status |
|------|------|--------|
| 1 | Schema: status enum widening + lifecycle columns + sentinel org | ✅ |
| 2 | `lib/subscriptions/state.ts` — state machine + lockdown predicates | ✅ |
| 3 | OrgCapabilities: `isLockedDown` + `subscriptionStateVariant` wired | ✅ |
| 4 | `<SubscriptionStateBanner>` + disabled controls across agent UI | ✅ |
| 5 | `requireAgentWriteAccess()` sweep — 100+ callsites gated | ✅ |
| 6 | 11 email templates + `<EmailFooter variant>` + sender functions | ✅ |
| 7 | Dunning + dormancy + purge-warning cron handlers | ✅ |
| 8 | `purgeOrg()` primitive — sentinel guard, cascade, storage purge | ✅ |
| 9 | Self-serve pause / resume / cancel + AAL2 gate + magic link fallback + PENDING_CANCELLATION + 24h expiry cron | ✅ |
| 10 | PayFast webhook — `past_due` on failure, `active` on recovery | ✅ |
| 11 | Testing surface — state machine unit tests + e2e lockdown fixtures | ✅ |

**Step 9 architectural decision (locked):**
- `organisations.deleted_at` is set ONLY by `purge_org_cascade` — never at cancellation
- `claim_purge_slot` mutex (`deleted_at IS NULL`) unchanged
- Dormancy scan: owner-free orgs have no subscription row — no status filter needed
- `subscriptions.cancelled_at` is the cancellation confirmation timestamp

---

## Gate 2 — Pre-counsel review status

| Item | Status |
|------|--------|
| RUNBOOK_LEGAL_HOLD.md v1.4 | ✅ |
| RUNBOOK_ARCHIVE_RBAC.md v1.2 | ✅ |
| TOS_ARCHIVAL_SPEC.md v1.2 — spec complete | ✅ |
| ADDENDUM_57G Steps 1–9 shipped | ✅ |
| POPIA Register B4 — credit check retention inconsistency fix | ✅ |
| POPIA Register B22 — deposit deduction + human review sentences | ✅ |
| ToS archival implementation (from TOS_ARCHIVAL_SPEC.md v1.2) | ✅ |

**Gate 2: ToS archival functionally complete for current feature set — ready for retained counsel package**

| Item | Status |
|------|--------|
| `tos_acceptances` table + immutability trigger + RLS (`010_platform_features.sql §X.8`) | ✅ |
| `recordTosAcceptance()` + `getLatestTosAcceptance()` in `lib/subscriptions/acceptance.ts` | ✅ |
| `checkTosGate()` enforcement in `proxy.ts` — redirect to `/accept-terms` if version mismatch | ✅ |
| `app/(auth)/accept-terms/page.tsx` + server action — `context: 'version_update'` | ✅ |
| Wire at **signup** — `recordTosAcceptance` called in `onboarding.ts` | ✅ |
| `cancellation_terms_version` snapshotted at cancellation confirmation | ✅ |
| `tos_acceptances` in `RETENTION_PROTECTED_TABLES` in `lib/subscriptions/retention.ts` | ✅ |
| `legal-archive` Storage bucket seeded in `006_seed.sql` | ✅ |
| `app/(public)/terms/[version]/page.tsx` — evidentiary route | ✅ |
| Wire at **reactivation** | ❌ Blocked — no reactivation server action exists (future build) |
| Wire at **ownership transfer** | ❌ Blocked — no `transferOwnership` action exists (future build) |
| Privacy Policy version bump banner | ❌ Gap — non-blocking for counsel package |

**Verdict:** The two missing wire-ups are blocked by features that don't exist yet (reactivation flow, ownership transfer flow) — they're hook points for future builds, not Gate 2 blockers. Privacy banner is non-blocking. Gate 2 counsel package can proceed.

**Context enum (v1.2):** `signup` · `version_update` · `reactivation` · `ownership_transfer`
**Hash contract (immutable):** `JSON.stringify({ context, org_id, terms_version, user_id })` — alphabetic key order, never change

---

## Legal doc versions (current — post attorney review)

| Document | Version | Key changes |
|---|---|---|
| `terms` | `v3.4.0` | PENDING_CANCELLATION in §04; 72-hour target softened to self-imposed standard |
| `privacy` | `v4.5.0` | All 11 attorney review items applied |
| `paiaManual` | `v1.1.0` | SAHRC submission claim removed; Form 2 (not Form C) |
| `cookiePolicy` | `v1.2.0` | "effectively anonymous" → "privacy-preserving aggregated form" |
| `creditCheckPolicy` | `v1.4.0` | "irrecoverably deleted" softened; document precedence clause |
| `definitions` | `v1.0.0` | NEW — first in legal nav; 6 sections, 30+ definitions, alphabetical |
| `popiaRegister` | `v2.0.0` | B4 (90-day/5-year retention) + B22 (AI accountability sentences) — shipped |

---

## ## ADDENDUM_63C — WhatsApp router — ✅ DONE (2026-05-11, 61bcbea0)

**Phase A (code) shipped:**
- `lib/whatsapp/sendWhatsApp.ts` — router-compatible sender, tier gate, communication_log write
- `lib/messaging/router.ts` — WhatsApp as third channel, `attemptWhatsApp()`, `dispatchChannel()` refactor
- `lib/tier/gates.ts` — `whatsapp_notifications` in Steward+
- `buildInspectionReminderWhatsApp()` → `inspection_reminder_v1`
- `buildPreMoveoutWhatsApp()` → `pre_moveout_inspection_v1`
- `buildWhatsAppTemplate()` in arrears-sequence → `arrears_step1_friendly_v1` / `arrears_step2_firm_v1`
- `.env.example` — `WA_BUSINESS_PHONE_ID`, `WA_WEBHOOK_SECRET`, `WA_SANDBOX`

**Phase B (ops — Stéan, parallel):**
- Apply for AT WhatsApp Business account
- Meta Business verification via AT account managers
- Register WhatsApp Business profile (display name: "Pleks", category: Real Estate Service)
- Register phone number with AT
- Submit 6 Meta templates for approval (bodies in ADDENDUM_63C spec)

**Deferred (spec out-of-scope):**
- `portal_invite_reminder_v1` and `delivery_fallback_v1` parameter builders — wire when those cron routes are built
- Owner-tier in-product upgrade nudge — deferred per spec (growth addendum later)

Next build: **BUILD_64** — Sovereign Trust Account

---

## Outstanding items (not blocking next build but track)

### POPIA legal commitment gap — URGENT
The PAIA Manual makes a **public legal commitment** that rejected applicant personal information is purged within 90 days. **This commitment is currently unmet.** Add to ADDENDUM_63C or as a standalone:
- `rejected-applicant-purge` cron step: find applications rejected > 90 days ago, delete all Storage objects (identity docs, bank statements, income docs in `identity-docs` + `bank-statements` buckets) in addition to DB rows
- `purgeOrg()` already handles DB cascade — Storage bucket deletion for file-bearing tables needs an explicit pass

### `contractors.deleted_at` missing
- Add `contractors.deleted_at timestamptz` (nullable) to `005_operations.sql`
- Add partial index `WHERE deleted_at IS NULL`
- Update contractor-listing queries to filter `WHERE deleted_at IS NULL`
- Pair with rejected-applicant purge work

### Orphan cleanup (CC async task)
- Org `a0544af1-6c8c-46d7-9d50-488da13ea1f3` (Kenyan signup, never used)
- Auth user `7bace71f-43e9-4961-8825-ebe85718345a`
- Walk FK graph, delete safely, confirm zero FK references remain
- Confirm completion before re-running any orphan-detection queries

---

## Build queue

1. **BUILD_64** — Sovereign Trust Account
5. **ADDENDUM_60B** — Warranty tracking
6. **BUILD_65** — POPIA Customer Surface
7. **ADDENDUM_62B** — Automated breach detection
8. **BUILD_66** — Charter homepage
9. **ADDENDUM_67B** — Rules engine Phase 2 (post first client)
10. **ADDENDUM_67C** — Cron handler migration (opportunistic, lowest priority)

## ✅ BUILD_67 — Rules engine Phase 1 — DONE 2026-05-09

- Engine: `lib/rules/` — types, engine, registry, `rule_runs` table live in DB
- 8 rules: `rejected-applicant-purge` · `deposit-return-t7` · `deposit-return-t1` · `deposit-deadline-breach` · `trust-reconciliation-drift` · `unallocated-receipt` · `fica-expiry` · `contact-email-bounce`
- `searchworks-connectivity` deferred — no API credentials, documented in registry comment
- Wired into daily cron, engine summary written to `cron_runs.metadata`
- Existing cron handlers untouched — hybrid state intentional (ADDENDUM_67C)

---

## Do not touch
- `lib/subscriptions/retention.ts` — add `tos_acceptances` only when Gate 2 ToS archival ships
- `lib/comms/templates/agent/subscriptions/cancellation.tsx` — LEGAL-REVIEW-PENDING flag stays until Gate 2 closes and retained counsel package is sent

## Retained counsel package (Gate 2 — send when all items ✅)
1. `brief/legal/Pleks Cancellation Email Templates v1.1 - Draft.md`
2. `app/(public)/terms/page.tsx` at v3.4.0
3. `app/(public)/privacy/page.tsx` at v4.5.0
4. ADDENDUM_57G fully shipped (Steps 1–11)
5. `brief/legal/RUNBOOK_LEGAL_HOLD.md` v1.4
6. `brief/legal/RUNBOOK_ARCHIVE_RBAC.md` v1.2
7. `brief/legal/TOS_ARCHIVAL_SPEC.md` v1.1 (implemented)
8. POPIA Register B4 + B22 fixed (v2.0.0 shipped)
