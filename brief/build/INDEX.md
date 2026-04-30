# Pleks Build Specs — Master Index

> Last updated: 2026-04-28 — **BUILD_62 fully shipped + hardened.** Policy change: D-AUTH-01 revised to one mandatory TOTP factor + backup secret shown post-enrol (second device opt-in, not mandatory). Security: R-1 open-redirect chain fixed, R-2 base64url JWT decode fixed, MFA bypass at enrol-totp closed. File header convention added to CLAUDE.md; 883 files stubbed, auth/supabase core filled. Schema for `010_platform_features.sql §14` (Part A + B) not yet applied to live DB — pending before next auth-touching deploy. Branch: `feat/build-62-auth-security`. Previously: Part A shipped (TOTP 2-device enrolment flow, /login/mfa MFA challenge page, step-up auth with StepUpModal + challenge tokens, device fingerprinting, new-device login notifications, auth_events audit log, session management UI for all portal roles, security.txt). Previously: **ADDENDUM_61B shipped** (multi-role navigation, portal role gate, role selector + switcher, /403 page, pleks_active_role cookie mechanics). Tier model overhaul fully cleaned up: 6-tier constants (Owner/Steward/Growth/Portfolio/Firm/Bespoke), lease-only caps, PayFast forms updated, BatchPaymentEntry payment method enum fixed, trust_transactions now persists payment_method, §13 migration applied to live DB. BUILD_62 now unblocked. Previously (2026-04-26 PM) — **DebiCheck-as-Pleks-feature demolition complete (Sweep A).** Pleks no longer claims to run DebiCheck. Agencies retain their existing bank-side debit-order mandates (between the tenant and the agent's bank); Pleks reads bank statement matches only. 7 commits on `refactor/build-61-route-alignment` (b808684 → cedad56): marketing copy + stub deletion (Sweep C), schema demolition (`debicheck_mandates` and `debicheck_collections` tables dropped; `payment_method` enum narrowed to `eft/cash/card/bank_recon_matched`), lease detail UI strip, reports breakdown removal + orphan `debitOrderReport.ts` deleted, billing-UI tier-gate strip, demo+seed data normalisation. Live dev DB drift cleaned via SQL Editor. **Brand-position copy retained** at `app/(public)/migrate/page.tsx:85` (“DebiCheck and NAEDO mandates are between your tenant’s bank and yours — Pleks doesn’t touch the rail”) — mentioning DebiCheck only to disclaim running it. BUILD_10 (DebiCheck / Peach Payments) marked 📦 superseded; migration row descriptions for `004_leases_financials.sql` and `008_enhancements2.sql` cleaned; ADDENDUM_07A (finance nav) and ADDENDUM_33A (flexible signing) descriptions updated to drop DebiCheck mentions. Bugs surfaced during the sweep added to Known open work. **Earlier today (AM): Pricing model overhaul** (Owner Pro deprecated; new tiers Owner free · Steward R 699 · Growth R 1,199 · Portfolio R 2,599 · Firm R 4,499 · Bespoke >150 leases) reflected in homepage `app/(public)/page.tsx`. ADDENDUM_57F (per-lease R99 premium upsell) marked 📦 superseded; shipped schema `leases.premium_enabled` + `subscription_charges` left in place as orphan, no UI surface, disposition deferred. BUILD_59 §6.2/§7.3 tier matrices updated (Owner Pro column dropped, replaced with Steward / Growth, Portfolio / Firm; bespoke note added); shipped `canSeeBroker` `owner_pro_lease_count` gating flagged as stale code. ADDENDUM_60A schema redirected from a new migration to amend-forward into `012_property_extensions.sql` per §11 rule; catalogue seed amends `006_seed.sql`. BUILD_62 schema redirected from migrations 013/014 to amend-forward into `010_platform_features.sql` (Part A + Part B sections); release flow updated to use `_forward/build_62_auth.sql` cutover script. BUILD_61 (Route Alignment) confirmed fully shipped on branch `refactor/build-61-route-alignment`. **Migration consolidation reaffirmed:** 12 files only (001–012); all future schema work amends existing files per the routing rules in §11, never creates new ones. Previously (2026-04-20): Added Phase 9 (Compliance & Legal Surfaces): BUILD_64 (Sovereign Trust Account), BUILD_65 (POPIA Customer-Facing Surface). Added ADDENDUM_00E–00H (error monitoring, user feedback, uptime monitoring, cost/usage dashboards). PROCESSING_PURPOSES.md (brief/legal/) updated to v4. Handover doc _HANDOVER_BUILD_65_66.md added to reference files. Post-ADDENDUM_00D spec reconciliation audit: BUILD_63 now declares BUILD_61 + BUILD_62 as hard dependencies (`/tenant/*` paths require BUILD_61; `auth_events` substrate requires BUILD_62); BUILD_63 §9.2 + BUILD_62 §8.3 reconcile on dual-write pattern for `tenant_portal_login` (auth_events for security telemetry + audit_log for Tribunal evidence, linked by session_id); ADDENDUM_61B adopts same dual-write for `role_switched` events; BUILD_62 §7.4 expanded with release-flow sequencing (semantic-release + Vercel auto-deploy, conventional-commit PR discipline); BUILD_61 implementation steps re-scoped as 14-PR sequence with conventional-commit titles per step. ADDENDUM_00D_CI_CD spec'd: first-class GitHub Actions CI, semantic-release (tag + CHANGELOG + GitHub Release, no npm publish), Dependabot with grouped weekly PRs, conventional-commits enforcement via PR-title lint, Trivy CVE scanning, security-audit CI subset (localhost-free categories 1/2/5/7). BUILD_62 (Authentication & Account Security) spec'd: claims reserved BUILD_62 slot for native Supabase hardening (Part A) + passkey/WebAuthn layer (Part B). BUILD_61 scope expanded to absorb subdomain + role namespace + route security; ADDENDUM_61B added. **DebiCheck demolition follow-ups (2026-04-26 PM):** (a) `BatchPaymentEntry.tsx` `PAYMENT_METHODS` array offers `"Cheque"` and `"Other"` to users but neither is in the schema CHECK constraint (`eft/cash/card/bank_recon_matched`) — inserts will fail; pre-existing bug, not introduced by demolition; (b) `lib/reports/incomeCollection.ts` filters `payment_method === "manual"` which was never a valid enum value — dead branch; (c) `lib/reports/rentRoll.ts` and `lib/reports/welcomePack.ts` `payment_method` fields default to empty / `"EFT"` without consulting the most recent `payments.payment_method` for the lease — informationally weak, future enhancement to derive method from latest payment; (d) **stale tier data cleanup** — `lib/constants.ts`, `lib/tier/canActivateLease.ts`, `001_foundation.sql` `subscriptions.tier` CHECK, and `app/(public)/pricing/page.tsx` are all on the OLD 4-tier R599/R999/R2499 model and need to be updated to the post-2026-04 tier set (Owner free · Steward R699 · Growth R1199 · Portfolio R2599 · Firm R4499 · Bespoke); blocked on three product questions (annual pricing convention, per-tier user/seat caps, whether `bespoke` is a real `subscriptions.tier` enum value or sales-only with a `custom_pricing_cents` override on `firm`); (e) two stale worktrees `.claude/worktrees/agent-ab3d027e` and `.claude/worktrees/quirky-austin-4505b9` need `git worktree remove --force` cleanup; (f) **ADDENDUM_57G_SUBSCRIPTION_PAUSE_POLICY** 🔬 — paused-subscription state spec to author ("your data, always" doctrine: paused = ALL reads/exports/audit/scheduled-notifications stay ON, ONLY new business creation OFF; CHECK widens to include `paused`; new `shouldFireScheduledNotifications(sub)` helper; soft-footer template on emails fired during paused state; 12-month long-tail purge with 30-day final warning + full data export). DebiCheck rip simplifies this spec since there’s no Pleks-side mandate cron to consider. **Operating-rule lesson (added to ops doctrine):** when removing an exported type or function, always grep the full repo for its identifier before claiming the removal complete — the missed `debitOrderReport.ts` orphan was caught by the post-Sweep verification grep, not by the removal-time check.
> This file is the source of truth for build spec numbering, relationships, and status.
>
> Naming:
> - Builds: `BUILD_{NN}_{SHORT_NAME}.md`
> - Addendums: `ADDENDUM_{NN}{letter}_{SHORT_NAME}.md` — `{NN}` references the parent build

## Status legend

| Icon | Meaning |
|------|---------|
| ✅ | Built & shipped |
| 🔨 | Partial — built with named gaps |
| 📝 | Spec'd, not yet implemented |
| 🔬 | Not yet spec'd |
| 📦 | Superseded by a later build |

---

## Quick index

| # | Phase / area | Range | Status |
|---|--------------|-------|--------|
| 1 | Foundation & Core PMS | BUILD_00–25 | ✅ Done |
| 2 | UX & Performance | BUILD_26–41 | ✅ Done |
| 3 | Workflows, Portals & Polish | BUILD_42–58 | ✅ Done (minor gaps) |
| 4 | Property Operations & Refactors | BUILD_59–61 | ✅ Done (minor gaps) |
| 5 | Authentication & Account Security | BUILD_62 | ✅ Parts A + B shipped |
| 6 | Tenant Communication Lifecycle | BUILD_63 | 📝 Spec'd |
| 7 | Legal / CPA | ADDENDUM_04A | ✅ Done |
| 8 | Infrastructure fixes (cross-cutting) | ADDENDUM_00A–H | 🔨 00A–D done · 00E–H spec'd |
| 9 | Compliance & Legal Surfaces | BUILD_64–66 | 📝 Spec'd |
| 10 | Legal specs | `brief/legal/` | ✅ Approved |
| 11 | Migrations | `supabase/migrations/001–012` | ✅ Consolidated, amend-forward only |
| 12 | AI model routing | — | Reference |
| 13 | Reference files | — | Reference |

**Known open work:** BUILD_60 Addendum — 6 new scenarios (r6, r7, c5, c6, m3, m4) shipped with new clause/welcome-pack/inspection-profile keys; template authoring for these keys is Phase 21+ content work — lease wizard and welcome pack fall back to generic templates in the interim; BUILD_60 Phase 2 unit tests deferred — repo has no test harness yet, will be addressed when vitest is stood up (separate task, not blocking); BUILD_60 006_seed.sql demo data deferred (completeness widget should be tested against real seed in one pass); BUILD_60 tier-aware “Unknown” copy on universal questions (spec §19.3) deferred as cosmetic polish — needs `useTier()` wiring; BUILD_60 C2/C3 identical-layout toggle not shipped — R4-only for v1, per-unit editing covers the gap; **BUILD_61 fully shipped** (branch `refactor/build-61-route-alignment`) — route renames, role namespace renames, 308 redirects, ROUTE_MANIFEST, hostname.ts, manifest-driven proxy with subdomain split and agent-role enforcement, cookie domain correctly host-scoped; **ADDENDUM_61B fully shipped** (branch `feat/addendum-61b-multi-role-nav`) — role selector, in-session RoleSwitcher in Topbar, `pleks_active_role` / `pleks_available_roles` cookies, portal-role gate in proxy, `/select-role` + `/403` pages, `/api/switch-role` + `/api/auth/available-roles` endpoints; BUILD_62 now unblocked; ADDENDUM_60B spec (warranty tracking) deferred separately; ADDENDUM_61A spec (conditional-rendering audit); BUILD_63 Tenant Communication Lifecycle (spec'd, not yet built — now authored against `/tenant/*` URLs post-BUILD_61; WhatsApp-primary with SMS backup, tone variants via Meta-approved templates + React Email components, closes 20+ registered-but-unwired templates, adds audit-grade delivery tracking for Tribunal readiness; DebiCheck comms deferred post-PMF); **BUILD_62 Authentication & Account Security (spec'd, not yet built)** — claims the reserved BUILD_62 slot. Part A (native Supabase hardening): Tier 0 Auth config (HIBP leaked-password check, 10-char password policy, session tuning), mandatory TOTP enrolment on two devices for all agent accounts, AAL-based step-up auth on trust-account-adjacent actions (refund approvals, bank detail changes, team role changes, tenant data deletion, bulk export), `/settings/security/sessions` + `/settings/team/sessions` + `/tenant/account/security` + `/landlord/account/security` + `/supplier/account/security` UI, new-device login-notification emails via Resend, `security.txt` + `security@pleks.co.za` disclosure channel. Part B (passkey/WebAuthn layer): SimpleWebAuthn + custom session-minting bridge via `generateLink`, `user_passkeys` schema, registration and authentication ceremonies (discoverable + allowList), device management UI, agent recovery via mandatory second TOTP factor, capability-detection fallback for older devices. RP ID locked: `app.pleks.co.za` production, `localhost` dev; no intermediate staging. Introduces `auth_events` as dedicated authentication audit substrate — BUILD_63's `tenant_portal_login` will consume this table. Part A independently shippable if Part B slips. 30-day build parallel to WhatsApp + Searchworx. Schema amends `010_platform_features.sql` per amend-forward rule (Part A: auth_events + login_notifications_sent + device_fingerprints + step_up_challenges; Part B: user_passkeys + passkey_challenges). Preferences and richer profile page deferred to future BUILD_64.

---

# Detail

## 1. Foundation & Core PMS (BUILD_00–25) ✅

The original build phase: database foundation, multi-tenant auth, the full residential PMS surface (properties, units, tenants, leases, inspections, maintenance, financials, arrears, deposits, HOA, contractors), plus the applicant pipeline with Searchworx/FitScore, data import tooling, and the contacts CRM rewrite. Legal framework (RHA, CPA, POPIA, PPRA, STSMA) anchored throughout.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 00 | `BUILD_00_FOUNDATION.md` | ✅ | Database foundation, auth, RLS |
| 00P | `BUILD_00_PAYFAST_ARCHITECTURE.md` | ✅ | PayFast integration for application fees (`/api/payments/screening`) |
| 01 | `BUILD_01_AUTH_ORG.md` | ✅ | Authentication, organisations, onboarding |
| 01B | `BUILD_01B_ONBOARDING_COMPLIANCE.md` | ✅ | Compliance onboarding (`settings/compliance`) |
| 02 | `BUILD_02_PROPERTIES_UNITS.md` | ✅ | Properties and units schema |
| 03 | `BUILD_03_TENANTS.md` | ✅ | Tenant management |
| 04 | `BUILD_04_LEASES.md` | ✅ | Lease creation and management |
| 05 | `BUILD_05_INSPECTIONS.md` | ✅ | Inspection workflows |
| 06 | `BUILD_06_MAINTENANCE.md` | ✅ | Maintenance lifecycle, AI triage (Haiku), contractor flow |
| 06B | `BUILD_06B_SUPPLIER_INVOICES.md` | ✅ | Supplier invoice tracking (`payments/invoices`) |
| 07 | `BUILD_07_FINANCIALS_CORE.md` | ✅ | Core financial tables, trust ledger |
| 08 | `BUILD_08_OWNER_STATEMENTS.md` | ✅ | Owner statement generation (`/statements`) |
| 09 | `BUILD_09_BANK_RECON.md` | ✅ | Bank reconciliation (`payments/reconciliation`) |
| 10 | `BUILD_10_DEBICHECK.md` | 📦 | **Superseded 2026-04-26 — DebiCheck-as-Pleks-feature demolition (Sweep A).** Original build wired DebiCheck mandates + Peach Payments collection cron + `/payments/debicheck` UI. Pleks no longer runs DebiCheck — mandates are between the tenant and the agent's bank, not a Pleks integration. All shipped artefacts removed: `debicheck_mandates` + `debicheck_collections` tables dropped from `004_leases_financials.sql`; `payment_method` enum narrowed to `eft/cash/card/bank_recon_matched`; `lib/peach/`, `app/api/webhooks/peach/`, `app/api/cron/debicheck-collection/`, `app/(dashboard)/billing/debicheck/` directories deleted; `BillingTabBar` DebiCheck tab removed; `TIER_FEATURES_PORTFOLIO` `"debicheck"` entry removed; reports `debit_order_report` removed across types/dispatchers/CSV/PDF; lease detail FinanceTab `debicheckStatus` and ActivationDialog `debiCheckEnabled` removed; tenant + landlord welcome packs no longer surface DebiCheck status. Spec text retained as historical record. **Brand-position copy retained** at `app/(public)/migrate/page.tsx:85` for migration messaging only ("Pleks doesn’t touch the rail"). Future bank-rec-only positioning lives under `BUILD_09_BANK_RECON.md` going forward. |
| 11 | `BUILD_11_ARREARS.md` | ✅ | Arrears tracking and comms (`payments/arrears`) |
| 12 | `BUILD_12_LEASE_LIFECYCLE.md` | ✅ | Lease renewal, CPA notices, expiry |
| 13 | `BUILD_13_MUNICIPAL_BILLS.md` | ✅ | Municipal bill tracking (`payments/municipal`, `/utilities`) |
| 14 | `BUILD_14_SEARCHWORX_FITSCORE.md` | ✅ | Searchworx credit checks, FitScore, applicant comparison |
| 15 | `BUILD_15_REPORTING.md` | ✅ | 25-report module (`/reports`) with tabs — superseded-in-scope by BUILD_52 overhaul |
| 16 | `BUILD_16_APPLICATION_PIPELINE.md` | ✅ | Tenant application pipeline (`/applications`) |
| 17 | `BUILD_17_DEPOSIT_RECON.md` | ✅ | Deposit reconciliation (`finance/deposits`) |
| 18 | `BUILD_18_HOA_MODULE.md` | ✅ | HOA / Body Corporate: levy schedules, AGMs, reserve fund (`/hoa`) |
| 19 | `BUILD_19_CONTRACTOR_PORTAL.md` | ✅ | Contractor portal (`/contractors`; Portfolio/Firm only) |
| 20 | `BUILD_20_MIGRATION.md` | ✅ | Data migration tooling (`settings/import`) |
| 21 | `BUILD_21_IMPORT_REDESIGN.md` | ✅ | TPN import wizard (Step0–Step4 + StepSuccess) |
| 22 | `BUILD_22_GL_HISTORY_IMPORT.md` | ✅ | GL history import (GLDetected → GLLeaseMatch → GLReview → GLSuccess) |
| 23 | `BUILD_23_CONTACT_IMPORT_ALL_TYPES.md` | ✅ | Contact import via TPN wizard (all entity types) |
| 24 | `BUILD_24_LEASE_CHARGES.md` | ✅ | Lease additional charges (`lease_charges` table, FinanceTab) |
| 25 | `BUILD_25_CONTACTS_MODULE.md` | ✅ | Contacts CRM embedded in entity detail pages (`ContactDetailLayout`, `ContactSidebar`, `RelationshipCard`) |
| 25S | `BUILD_25_CONTACTS_SCHEMA.md` | ✅ | Contacts schema rewrite (`002_contacts.sql`) |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_00A_ENCRYPTION_AT_REST.md` | BUILD_00 | ✅ | Encryption for PII fields (`009_security.sql`) |
| `ADDENDUM_02A_BUILDINGS_LAYER.md` | BUILD_02 | ✅ | Buildings as intermediate layer |
| `ADDENDUM_02B_RESIDENTIAL_COMMERCIAL.md` | BUILD_02 | ✅ | Residential/commercial property types |
| `ADDENDUM_03A_FOREIGN_NATIONALS.md` | BUILD_03 | ✅ | Foreign national tenant handling |
| `ADDENDUM_06A_MAINTENANCE_COST_SPLIT.md` | BUILD_06, 45 | ✅ | Landlord / tenant / other cost split — `maintenance_cost_allocations` queried in `maintenance/[requestId]/page.tsx` and `api/maintenance/sign-off/route.ts` |
| `ADDENDUM_07A_FINANCE_NAV.md` | BUILD_07, 09 | ✅ | Finance nav — Billing page tab bar (Payments / Invoices / Reconciliation / Arrears / Municipal). Tab bar lives at `/billing` post-BUILD_61; DebiCheck tab removed 2026-04-26 (Sweep A demolition). |
| `ADDENDUM_16A_JOINT_APPLICATION.md` | BUILD_16 | ✅ | Joint application handling |
| `ADDENDUM_16B_MOTIVATION_FIELD.md` | BUILD_16 | ✅ | Application motivation field |
| `ADDENDUM_04A_CPA_APPLICABILITY.md` | BUILD_04 | ✅ | CPA applicability — tenant entity classification (`entity_type`, size bands on contacts), lease-level `is_franchise_agreement` + `cpa_applies_at_signing` snapshot, derivation helper, activation gate blocking indeterminate leases. Natural persons: auto-yes. Juristic non-franchise: turnover + asset test. Franchise: always yes. |
| `ADDENDUM_17A_DEPOSIT_INTEREST.md` | BUILD_17 | ✅ | Per-lease deposit interest — `lib/deposits/interestConfig.ts` with prime-linked / fixed / repo-linked / manual modes; `deposit_interest_config` table |
| `ADDENDUM_18A_HOA_LEVY_CALCULATION.md` | BUILD_18 | ✅ | HOA levy calculation logic |
| `ADDENDUM_19A_CONTRACTOR_PORTAL_TIERS.md` | BUILD_19 | ✅ | Contractor portal tier gating (Portfolio/Firm only) |
| `ADDENDUM_21A_TPN_GAPS.md` | BUILD_21 | ✅ | TPN import gap analysis — header row detection, entity type filtering, co-tenant split, entity state mapping, bank import helpers |
| `ADDENDUM_21B_TPN_EXPORT.md` | BUILD_21 | ✅ | All 6 fixes shipped: POPIA bank notice (Step2Mapping), "No lease data" message, bank column mapping UI with encrypted destinations, `normaliseBranchCode()`, entity state mapping, and bank insert wired in `importRunner.ts` (`insertTenantBankAccounts()` — masks + hashes account number, inserts into `tenant_bank_accounts`, tracked as `bankAccountsImported` in result). |

---

## 2. UX & Performance (BUILD_26–41) ✅

Systematic redesign pass: property / contact / dashboard / lease / settings pages; clause profile system at the unit level; lease template UX and flexible signing; org branding; performance waterfall elimination; property edit redesign; data-freshness refinements.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 26 | `BUILD_26_PROPERTY_DETAIL_REDESIGN.md` | ✅ | Property detail page: 3-card layout, unit rows |
| 26I | `BUILD_26I_PROPERTY_INLINE_ASSIGNMENT.md` | 📦 | Superseded by BUILD_27 (inline landlord/agent assignment absorbed into two-level agent model) |
| 27 | `BUILD_27_TWO_LEVEL_AGENT_MODEL.md` | ✅ | Property-level + unit-level agents |
| 28 | `BUILD_28_CONTACT_DETAIL_REDESIGN.md` | ✅ | CRM-style contact detail pages |
| 29 | `BUILD_29_DASHBOARD_REDESIGN.md` | ✅ | Personalised dashboard with attention queue |
| 30 | `BUILD_30_LEASE_PAGES_REDESIGN.md` | ✅ | Lease list + detail pages |
| 31 | `BUILD_31_UNIT_CLAUSE_PROFILES.md` | ✅ | Unit-level clause overrides + feature auto-mapping |
| 32 | `BUILD_32_LEASE_TEMPLATE_UX.md` | ✅ | Clause editor cancel/dirty flow (`ClauseEditConfirmModal`), toggle feedback, annexure info, full preview (`LeasePreview`, `/api/leases/preview-template`), branding section (`LeaseBrandingSection`) |
| 33 | `BUILD_33_LEASE_ACTIVATION.md` | ✅ | Prerequisites, signing paths, activation cascade |
| 34 | `BUILD_34_LEASE_DOC_FORMATTING.md` | ✅ | Hierarchical clause numbering + justified text — `parseClauseBody.ts`, `renderClauseDocx.ts`, `renderClauseHtml.ts`; integrated into `generateDocument.ts` and preview API |
| 35 | `BUILD_35_ORG_DETAILS.md` | ✅ | Tier-aware organisation/profile details |
| 36 | `BUILD_36_SETTINGS_OVERHAUL.md` | ✅ | Settings tabs (profile, branding, communication, compliance, configuration, hours, import, lease-templates, notifications, reports, team); mobile drill-down nav |
| 37 | `BUILD_37_PROPERTIES_REDESIGN.md` | ✅ | Tier-aware properties page; property detail tabs: Overview, Units, Insurance, Scheme, Operations, Documents |
| 38 | `BUILD_38_PERFORMANCE.md` | ✅ | Query waterfall elimination, `getSession()`, org cookie |
| 39 | `BUILD_39_PROPERTY_EDIT_REDESIGN.md` | ✅ | Two-column edit: `PropertyEditForm` + `PropertyEditSidebar` |
| 40 | `BUILD_40_PROPERTY_UNIT_INLINE.md` | 📦 | Superseded by ADDENDUM_57D (inline expand panel killed). Type-aware fields (`lib/units/typeAwareFields.ts`) and `AddUnitDialog` retained. Unit cards navigate to unit detail page. `PropertyUnitsSection.tsx` deleted (dead code). `UnitExpandPanel.tsx` retained — still active via `OwnerUnitPanel` → `SinglePropertyView`. |
| 41 | `BUILD_41_DATA_FRESHNESS.md` | ✅ | Phase 1 done — window focus revalidation, mutation invalidation, last-updated indicators |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_31A_UNIT_CLAUSE_UX.md` | BUILD_31 | ✅ | "Lease setup" naming, toggle_label, empty/auto states |
| `ADDENDUM_31B_CLAUSE_CONFLICTS.md` | BUILD_31 | ✅ | Clause conflict checker (deterministic + Sonnet) + HOA supremacy clause |
| `ADDENDUM_32A_LEASE_PREVIEW_PROTECTION.md` | BUILD_32 | ✅ | Page breaks, download tier-gating, watermarks |
| `ADDENDUM_33A_FLEXIBLE_SIGNING.md` | BUILD_33 | ✅ | Three signing paths (DocuSeal API, manual upload, in-person). *Note: original spec mentioned "DebiCheck optional" as a fourth signing-time concern — dropped 2026-04-26 with Sweep A demolition; lease activation no longer creates DebiCheck mandates.* |
| `ADDENDUM_36A_BRANDING_PREVIEW.md` | BUILD_36 | ✅ | Branding page, cover templates, document preview |
| `ADDENDUM_36B_DISPLAY_NAME.md` | BUILD_36 | ✅ | `getOrgDisplayName()` utility, settings redirect |
| `ADDENDUM_37A_OWNER_PROPERTY_VIEW.md` | BUILD_37 | ✅ | Owner hub: tenant/lease cards, contextual quick actions |
| `ADDENDUM_37B_OWNER_FIXES.md` | BUILD_37 | ✅ | TenantPicker, disabled quick actions, UUID fix, polish |
| `ADDENDUM_38A_PERCEIVED_PERFORMANCE.md` | BUILD_38 | ✅ | Skeletons, progress bar, sidebar optimistic state |
| `ADDENDUM_38B_PORTFOLIO_CACHE.md` | BUILD_38 | ✅ | React Query prefetch, `HydrationBoundary`, shared query definitions |
| `ADDENDUM_38C_DASHBOARD_PERF.md` | BUILD_38 | ✅ | Parallel helpers, merged waves, Suspense streaming |
| `ADDENDUM_39A_PROPERTY_EDIT_REDESIGN.md` | BUILD_39 | ✅ | Two-column layout (`1fr_300px`), tier-aware back link, `PropertyRulesEditor` as full-width section, sidebar with landlord/agent/units |

---

## 3. Workflows, Portals & Polish (BUILD_42–58) ✅

Everything shipped after the UX pass: core workflow forms (lease wizard, inspection form, property rules + AI), maintenance UX lifecycle, the two external-facing portals (landlord and tenant), operations calendar, applicant portal + comms foundation, bank feeds, finance hub, full reports overhaul, landlord/tenant welcome packs, demo mode, permissions model with ownership transfer, mobile-first UX (home screen, bottom bar, PWA, inspection/maintenance work views, lease/property detail redesigns, document generation & templates, Owner Pro per-lease billing), WhatsApp Business integration with consent and CS-window tracking.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 42 | `BUILD_42_LEASE_CREATION_WIZARD.md` | ✅ | 6-step wizard at `leases/new`: parties → dates → rental schedule → clauses → interest → review |
| 43 | `BUILD_43_INSPECTION_FORM.md` | ✅ | Inspection scheduling form (`inspections/new`) with property/unit/tenant picker |
| 44 | `BUILD_44_PROPERTY_RULES.md` | ✅ | Rules library (20 templates), AI reformat (Haiku), HOA upload (`HoaRulesUpload`), tier credits; `PropertyRulesEditor` wired in `PropertyEditForm` |
| 45 | `BUILD_45_MAINTENANCE_UX.md` | ✅ | Full maintenance lifecycle — `MaintenanceActions`, `RecordDelayPanel`, timeline build, AI triage, severity classification, critical incident flow, contractor updates |
| 46 | `BUILD_46_LANDLORD_PORTAL.md` | ✅ | `(landlord)` route group (`/landlord/*`): dashboard, properties, maintenance, statements, profile. Magic-link auth via `getLandlordSession()` |
| 47 | `BUILD_47_OPERATIONS_CALENDAR.md` | ✅ | Unified ops calendar (`/calendar`) — FullCalendar with dayGrid, timeGrid, list, interaction plugins; `CalendarClient` |
| 48 | `BUILD_48_APPLICATION_PORTAL.md` | ✅ | Applicant portal — `(applicant)/apply/[slug]/` with details, documents, review, status; invite flow with consent, payment, status pages |
| 49 | `BUILD_49_TENANT_PORTAL.md` | ✅ | Tenant portal — `(tenant)` route group (`/tenant/*`): token auth (`/tenant/access?token=`), dashboard, lease, payments, maintenance, account. `getTenantSession()` auth layer |
| 50 | `BUILD_50_BANK_FEEDS.md` | 📦 | OFX, CSV, QIF parsers in `lib/recon/`; bank detection, matching engine built. Yodlee/live feed integration deferred — will be revisited when there is a live paying customer requiring it. |
| 51 | `BUILD_51_FINANCIAL_ACCOUNTING_VIEWS.md` | ✅ | Trust ledger (`finance/trust-ledger`), deposits (`finance/deposits`), owner statements (`/statements`); `lib/finance/financeHub.ts` |
| 52 | `BUILD_52_REPORTS_OVERHAUL.md` | ✅ | 26 report tabs, CSV + PDF export via `/api/reports/export`; `ReportShell` wrapper. Branded PDF confirmed — `reportBranding.ts` fetches `logo_url`, `brand_accent_color`, `brand_font`, `brand_cover_template` from org; 4 letterhead layouts (classic/modern/bold/minimal) in `generatePDF.ts` with logo + accent throughout. |
| 53 | `BUILD_53_WELCOME_PACK.md` | ✅ | AI landlord welcome pack — `lib/reports/welcomePack.ts`, `generateWelcomePackHTML.ts`, `welcomePackRecommendations.ts`; `WelcomePackTab` in reports; `WelcomePackBanner` |
| 54 | `BUILD_54_TENANT_WELCOME_PACK.md` | ✅ | Tenant welcome pack — `lib/reports/tenantWelcomePack.ts`, `tenantWelcomePackHTML.ts` |
| 55 | `BUILD_55_DEMO_OVERHAUL.md` | ✅ | Demo mode — `(demo)` route group with 12 pages (dashboard, properties, landlords, tenants, leases, maintenance, inspections, applications, payments, finance, suppliers); `lib/demo/DemoContext.tsx` + `demoData.ts` |
| 56 | `BUILD_56_PERMISSIONS.md` | ✅ | `is_admin` on `user_orgs`, `isAdmin` in gateway, `usePermissions()` hook, UI gates on Landlords/Tenants/Contractors list + team page. Server actions gated: `archiveProperty`, `deleteProperty`, `deletePropertyDocument`, `deleteDocumentTemplate`. Team member/invite API routes gated. Ownership transfer: owner-only card on `/settings/team` → `POST /api/team/transfer-ownership` swaps roles, Resend emails, `audit_log` entry. |
| 57 | `BUILD_57_MOBILE_UX.md` | ✅ | Parts A–H shipped. A: `MobileHomeScreen`. B: `MobileBottomBar` + `MobileMoreSheet` + `MobileQuickAdd`. C: `MobileInspectionView` + `MobileMaintenanceView` — photo capture/comparison + signature capture confirmed (`SignOffFlow.tsx` — full canvas dual-signature agent + tenant, composited JPEG, wired in `MobileInspectionView`). D: `MobileTenantView` + `MobilePropertyView`. E: `DesktopOnlyCard`. F: `isMobile` checks. G: bottom bar + safe-area. H: `sw.ts`, `manifest.json`, `syncEngine`, `SyncIndicator`, `/api/offline/sync-manifest`. *Note: ADDENDUM_57F (Owner Pro per-lease billing) shipped under this build but is now 📦 superseded by the 2026-04 pricing overhaul — see §3 addendum entry.* |
| 58 | `BUILD_58_WHATSAPP_INTEGRATION.md` | ✅ | WhatsApp via Africa's Talking — `/api/webhooks/whatsapp/africastalking/route.ts` (HMAC verification, inbound/delivery/template_approval events); `lib/messaging/whatsapp/provider.ts`, `send.ts`, `sms-fallback.ts`; `whatsapp_cs_windows` queried in `getActiveCsWindow()`; STOP keyword consent withdrawal; `tenant_messaging_consent` + `messaging_usage` tables. Meta WABA registration is an external step separate from code build. |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_42A_LEASE_PATH_FORK.md` | BUILD_42 | ✅ | Template vs upload fork before wizard — simplified 4-step path for own lease |
| `ADDENDUM_44A_CREDIT_TERMS.md` | BUILD_44 | ✅ | Owner=0 credits, credit terms disclosure, platform disclaimer |
| `ADDENDUM_44B_LEASE_ONBOARDING.md` | BUILD_44 | ✅ | Tier-aware lease template explainer with examples |
| `ADDENDUM_48A_COMMS_FOUNDATION.md` | BUILD_48 | ✅ | Shared Resend + Africa's Talking infrastructure — `lib/comms/send-email.ts`, `template-registry.ts`, `preferences.ts`, templates/ |
| `ADDENDUM_51A_FINANCE_HUB.md` | BUILD_51 | ✅ | Finance hub at `/finance` with `getFinanceHubData()`; not a redirect |
| `ADDENDUM_52A_REPORT_AUDIT.md` | BUILD_52 | ✅ | All 4 critical fixes: (1) arrears aging invoice-level buckets in `arrearsAging.ts`; (2) contractor performance `maintenance_delay_events` queried in `contractorPerformance.ts`; (3) POPIA audit name resolved from `contacts` in `popiaConsentAudit.ts`; (4) SARS mapping `mapToSARSLabel()` + `sarsCategories.ts` in `expenseReport.ts`. |
| `ADDENDUM_52B_DEEP_REPORT_AUDIT.md` | BUILD_52 | ✅ | SVG chart helpers (`lib/reports/svgCharts.ts`: `barChart`, `lineChart`, `pieChart`), portfolio flags array (`PortfolioFlag[]` — arrears >30d, vacant >30d, lease expiring 30d), rent roll enriched with `escalation_percent`, `escalation_review_date`, `tenant_email`, `tenant_phone`, PDF outputs updated (income bar chart + flags table in portfolio; contact + escalation columns in rent roll). Period comparison: `PeriodComparison` interface, `computePreviousPeriod()` in `periods.ts`, `includePeriodComparison` flag on `ReportFilters`, previous-period queries in `buildPortfolioSummary()`, `renderDelta()` arrows on Expected Income / Collected / Collection Rate metric cards in PDF. |
| `ADDENDUM_57A_INSPECTION_PROFILES.md` | BUILD_57 | ✅ | Unit types + inspection profiles — `UNIT_TYPES` (13 types) in `UnitForm.tsx`; `unit_type` field on unit form; `InspectionProfileCard` at `properties/[id]/units/[unitId]/` with `setupProfileFromTemplate` action; `unit_inspection_profiles` + `unit_inspection_profile_rooms` tables queried. 13 types confirmed correct. |
| `ADDENDUM_57B_UNIT_SETUP.md` | BUILD_57 | ✅ | Unit setup redesign — `UnitForm.tsx` has 3-tab structure (`details` / `features` / `rental`). Tab 1: unit type, floor, size, rooms. Tab 2: features & furnishings, inventory. Tab 3: rent + clause profile. Wired into unit detail page. |
| `ADDENDUM_57C_LEASE_DETAIL.md` | BUILD_57 | ✅ | Lease detail page redesign — six-tab experience: `LeaseTabs` + `OverviewTab`, `LeaseDetailsTab`, `ContactsTab`, `FinanceTab`, `DocumentsTab`, `OperationsTab` at `leases/[leaseId]/`. Deposit interest resolved. 6 tabs match spec. |
| `ADDENDUM_57D_PROPERTY_DETAIL.md` | BUILD_57 | ✅ | Property detail page redesign — `PropertyTabs` with 5 base tabs (Overview, Buildings & units, Insurance & risk, Operations, Documents) + optional Scheme & compliance tab. Tab components: `OverviewTab`, `UnitsTab`, `InsuranceTab`, `SchemeTab`, `OperationsTab`, `PropertyDocumentsTab`. Exceeds the 4-tab spec. |
| `ADDENDUM_57E_DOCUMENT_GENERATION.md` | BUILD_57 | ✅ | (1) **User signatures** — `settings/profile/signature/` (canvas draw + file upload), stored in `user_signatures` table; public magic-link capture at `(public)/sign-signature/[token]/` via `SignaturePadCapture`, token issued from `signature_sign_tokens`. (2) **Unified Templates** — `settings/communication/templates/` with `TemplatesClient`; 27 system templates seeded in `011_documents_messaging.sql` §8; org-level duplicate-and-override pattern; tone variants (friendly/professional/firm) per template. (3) **Document editor** — `documents/new/` with TipTap rich editor, merge field insertion, PDF export, Resend email dispatch; `document_generation_jobs` tracks generation state. (4) **Config page** — `settings/configuration/` (Organisation group in sidebar). `ConfigurationForm` + `saveOrgConfiguration()` server action; settings: tone (tenant/owner), managed-by label, SMS fallback toggle + delay; written to `organisations.settings` JSONB under `preferences_version: 1`. |
| `ADDENDUM_57F_OWNER_PRO_BILLING.md` | BUILD_57 | 📦 | **Superseded by new pricing model (2026-04-26).** Owner Pro tier and per-lease R99 premium upsell removed; Owner free is now strictly 1 lease, premium features require Steward (R 699/mo). Shipped schema (`leases.premium_enabled`, `subscription_charges` in `010_platform_features.sql` §10) remains in place as orphan — no UI surface, no billing pipeline writes to it. Disposition deferred. Spec text retained as historical record. |

---

## 4. Property Operations & Refactors (BUILD_59–61) 🔨

The current work front. BUILD_59 (property insurance/broker/managing-scheme architecture) and BUILD_60 (scenario-driven smart property setup wizard, all 22 phases) are fully shipped. BUILD_60 covers the full wizard, completeness widget, property info requests (owner/broker/self tracks), React Email templates for all 8 topics, bulk classifier, tier gate at lease activation, and mobile-responsive shell. **BUILD_61 is spec'd with expanded scope**: the original route-alignment refactor now also absorbs (a) the introduction of `app.pleks.co.za` as the single product subdomain with apex as marketing, (b) role namespace renames `/portal/*` → `/tenant/*` and `/contractor/*` → `/supplier/*`, (c) a canonical route security manifest driving middleware enforcement, and (d) central `/login` gateway. ADDENDUM_61B (multi-role navigation) sits on top of BUILD_61.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 59 | `BUILD_59_PROPERTY_INSURANCE_SCHEME.md` | ✅ | All 13 phases. Schema in `012_property_extensions.sql` §4–§11. AI triage extended. `CriticalIncidentDialog` + `CriticalIncidentWrapper`. `recordInsuranceDecision` → parallel notify (broker/owner/scheme) → audit trail. 3 React Email templates. Multi-building opt-in via `EnableMultiBuildingDialog`. Phase 13: broker card gated (`canSeeBroker` was `owner_pro_lease_count > 0` for owner tier, always true for Steward+); free Owner sees upgrade prompt. Scheme tab edit link hidden for owner tier (read-only). Monthly levy KvRow + dedicated Levies section card gated to Firm tier only. *Note: `owner_pro_lease_count` gating is stale code post-2026-04 pricing overhaul — on next touch, replace with `tier !== 'owner_free'`. Spec headers updated; tier matrices in §6.2/§7.3 redrawn for the new tier set.* |
| 60 | `BUILD_60_SMART_PROPERTY_SETUP.md` | ✅ | **All 22 phases shipped.** Scenario picker (17 SA scenarios r1–r7, c1–c6, m1–m4) with ownership mode, educational bullets, universal questions (scheme/WiFi/cell/backup power), scenario follow-up, operating hours, landlord, units, insurance, documents steps. `buildProfile()` + `buildSkeletonUnits()` pure derivation (`lib/properties/`). Completeness widget with 30-day lifetime + 7-day dismiss cooldown, per-item action buttons. Property info requests for owner/broker/self tracks — create, remind (owner T+3/T+7, broker T+5, self T+30 email), public submit form with per-topic writebacks, daily cron with optimistic-concurrency guard. React Email templates for all 8 topics × initial + reminder + completion notify + self-track nudge. Bulk classifier (`/properties/classify`) + reclassify dialog. Tier gate moved to lease activation (`canActivateLease`). Scenario label + operating hours surfaced on property OverviewTab. Mobile-responsive wizard shell. Open: ADDENDUM_60A spec'd (schema amends `012_property_extensions.sql` per amend-forward rule). |
| 61 | `BUILD_61_ROUTE_ALIGNMENT.md` | ✅ | **Expanded scope — fully shipped on branch `refactor/build-61-route-alignment`.** (A) ✅ Route-naming renames: `/payments` → `/billing`, `/contractors` → `/suppliers`, `/settings/finance` → `/settings/deposits`, `/settings/billing` → `/settings/subscription`, `/settings/communication/templates` → `/settings/documents/templates`, `/settings/profile` repurposed as user-profile stub with `/settings/details` for org details. Matching `/api/*` renames. 16 permanent 308 redirects in `next.config.ts`. (B) ✅ Role namespace renames: `(portal)` → `(tenant)` with `/portal/*` → `/tenant/*`; `(landlord-portal)` → `(landlord)` (URL unchanged); `(contractor)` → `(supplier)` with `/contractor/*` → `/supplier/*`. Schema names retained. (C) ✅ `lib/routing/manifest.ts` (ROUTE_MANIFEST + AGENT_ROLES), `lib/routing/hostname.ts` (resolveHostContext), `lib/auth/cookie-config.ts` (AUTH_COOKIE_OPTS). (D) ✅ `proxy.ts` rewritten — manifest-driven routing, longest-prefix match, agent role enforcement from `pleks_org` cookie, skipOrgCheck from manifest. (E) ✅ Subdomain split wired in `proxy.ts`: `pleks.co.za` apex serves APEX_PREFIXES + `/` only, all other paths 308→`app.pleks.co.za`; cookies host-scoped via AUTH_COOKIE_OPTS (no domain attribute — correct as-is). |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_60A_INSURANCE_CHECKLIST.md` | BUILD_60, 59 | ✅ | **All 14 phases shipped** (Phase 15 portfolio rollup deferred to v1.5). Schema in `012_property_extensions.sql` + 13-item seed in `006_seed.sql`. `initializeChecklist` + `reEvaluatePolicyHeader` + `reEvaluateApplicability` library. `InsuranceChecklist.tsx` right column with inline tick / N/A / notes + tier gating (`canTick`). `RenewalBanner.tsx` with bulk-verify + per-user dismiss. `sendBrokerBrief` email (React Email template, logged to `incident_notifications`). Owner magic-link re-uses BUILD_60 `property_info_requests` — `ChecklistInfoForm.tsx` detects `scenario_context.checklist_items` and renders per-item Yes/No/Not sure radios. `createInsuranceChecklistOwnerRequest` server action + "Ask owner" item-selector UI in checklist footer. Renewal cron at `app/api/cron/insurance-renewals/route.ts` (daily, resets confirmed → unknown on renewal date, single T+7 reminder via `insurance/renewal-reminder` React Email template, idempotency via `property_insurance_renewal_reminders`). Completeness widget uses `checklistConfirmed / checklistTotal × 15` partial credit. Critical-incident broker email now lists confirmed and unknown items by label (`confirmedItems[]` / `unknownItems[]`). `saveInsurancePolicy` calls `reEvaluatePolicyHeader` (PR #27). `checklistMode` threaded through `sendInfoRequestEmail` → `InsuranceInfoRequestEmail`. Backfill script at `scripts/backfill-insurance-checklists.ts`. Open: Phase 15 portfolio rollup (Firm tier, v1.5). |
| `ADDENDUM_61A_CONDITIONAL_RENDERING_AUDIT.md` | BUILD_61 | 🔬 | Small audit spec following the database-unified principle ("same schema, different presentation"). After BUILD_61 ships, verify every Settings page renders sensibly for landlord-type orgs: does `/settings/details` hide agency-only fields (EAAB/FFC/trust account) for landlord orgs; does Branding still make sense for a one-landlord org; does the org-vs-personal framing on `/settings/profile` read correctly for both org types. Scope is audit + conditional-render tweaks, not rebuild. Does not change schema. |
| `ADDENDUM_61B_MULTI_ROLE_NAVIGATION.md` | BUILD_61 | ✅ | **Shipped 2026-04-28** on branch `feat/addendum-61b-multi-role-nav`. `lib/auth/roles.ts`: `RoleMembership` types, `resolveUserRoles()` queries `user_orgs` (agent), `user_orgs_tenants` (tenant), `landlords.auth_user_id` (landlord) in parallel; `ROLE_DEFAULT_ROUTES` per role type; `defaultRoleForMemberships()` heuristic (prefers single agent role). `proxy.ts` extended with `checkPortalRoleGate()`: reads `pleks_active_role` cookie on `/tenant/*`, `/landlord/*`, `/supplier/*` routes; if missing resolves from DB; auto-sets cookie for single-role users; redirects multi-role to `/select-role`, mismatched role to `/403`. `POST /api/switch-role`: validates target role server-side, sets `pleks_active_role` (7d) + `pleks_available_roles` (5m) cookies, writes `audit_log` row of type `role_switched`, graceful no-op on `auth_events` until BUILD_62 ships the table. `GET /api/auth/available-roles`: lightweight endpoint for client-side hydration. `app/(auth)/select-role`: server component resolves roles, auto-routes single-role users, renders `RoleSelectorClient` card grid for multi-role users. `app/(auth)/403`: reads cookies, shows workspace link + "Switch workspace" CTA when other roles available. `RoleSwitcher` dropdown in `Topbar` — fetches available roles on mount, hidden for single-role users, posts to `/switch-role` on pick. Login page now resolves agent+tenant+landlord memberships in parallel post-auth; redirects to `/select-role` when multiple found. ROUTE_MANIFEST updated with `/select-role`, `/switch-role`, `/403`. Note: `user_orgs_landlords` and `user_orgs_contractors` bridge tables don't exist in DB yet — landlord resolved via `landlords.auth_user_id`, supplier deferred. `auth_events` dual-write no-ops until BUILD_62. BUILD_62 now unblocked. |

---

## 5. Authentication & Account Security (BUILD_62) ✅

Closes the single-factor-auth gap across all roles, delivers the first credible MFA story in SA property management, and establishes the auth-events substrate that BUILD_63 consumes. Competitors (TPN RentBook, WeConnectU, PropWorx) advertise zero MFA. Regulatory environment tightened in 2025 — Information Regulator eServices breach-reporting portal is live; Pam Golding breach in March 2025 illustrated category risk. BUILD_62 ships as two parts, independently releasable: Part A (native Supabase hardening) closes the POPIA and trust-account gaps on free Supabase features alone; Part B (passkey/WebAuthn layer) is the UX upgrade and category differentiator. Designed to ship in 30 days parallel to WhatsApp and Searchworx integration work, on the critical path for first production agency customer.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 62 | `BUILD_62_AUTHENTICATION_SECURITY.md` | ✅ | **Parts A + B — Shipped 2026-04-28** on branch `feat/build-62-auth-security`. **Part A — Native hardening.** Supabase Auth config (HIBP, 10-char password policy, 1h access token + 7d agent / 30d user session TTL). Schema appended to `010_platform_features.sql` per amend-forward rule: `auth_events` (append-only, 7-year retention, 24-event-type CHECK enum), `device_fingerprints` (soft-delete only), `login_notifications_sent` (30-day dedup), `step_up_challenges` (5-min ephemeral, single-use), `is_mfa_fresh(int)` helper, `purge_old_auth_events()` cron target. BUILD_63 `tenant_portal_login` events consumed here rather than creating a parallel table. Mandatory two-device TOTP enrolment for all agent accounts (owner/property_manager/agent/accountant/maintenance_manager) — middleware blocks `/dashboard` until both factors enrolled; recovery via second device since Supabase has no native recovery codes. AAL-based step-up on 11 sensitive actions: trust_account_write, deposit_refund_approval, bank_detail_change, team_role_change, subscription_change, tenant_data_deletion, ownership_transfer, security_settings_change, passkey_unenroll, totp_unenroll, bulk_export. Session-management UI at `/settings/security/sessions` (self), `/settings/team/sessions` (org admin, requires step-up), `/tenant/account/security`, `/landlord/account/security`, `/supplier/account/security`. Login-notification emails via Resend on new-device events with city/country/device/method/revoke link; suppressed for fresh-account initial TOTP enrolment device. `security.txt` at `/.well-known/security.txt` + `security@pleks.co.za` responsible-disclosure alias + `/security` marketing page. Optional TOTP offered but never forced for tenant/landlord/supplier roles. **Part B — Passkey layer.** SimpleWebAuthn (`@simplewebauthn/server` + `/browser`) for WebAuthn on top of Supabase Auth (WebAuthn is not a native Supabase MFA factor as of April 2026). Schema appended to `010_platform_features.sql` (Part B section): `user_passkeys` (credential_id unique, public_key, counter, transports, device_type for singleDevice/multiDevice, AAGUID, rp_id, origin, soft-delete via revoked_at), `passkey_challenges` (ephemeral, 5-min TTL, service-only access). `pg_cron` cleanup of expired challenges every 15 min. Registration ceremony at `/settings/security` with capability detection (`PublicKeyCredential.isConditionalMediationAvailable`) — enrol CTA hidden on incapable devices; discoverable (resident) keys default, allowList fallback. Authentication ceremony at `/login` supports autofill discoverable mode (one-tap biometric login) and email-then-passkey allowList mode. Session-minting bridge: `supabase.auth.admin.generateLink({type:'magiclink'})` server-side → consume `hashed_token` → `setSession` client-side (D-AUTH-07 reversible to Auth Hooks in Phase 2). Passkey verification satisfies AAL2 in our in-house helpers (Supabase's `getAuthenticatorAssuranceLevel` doesn't know about custom passkeys — documented asymmetry). Step-up via passkey when enrolled (primary) or TOTP fallback. Counter enforcement for `singleDevice` credentials, skipped for `multiDevice` (iCloud/Google-synced). Device management UI with rename + step-up-gated revoke. Agent recovery: mandatory second TOTP factor from Part A is the recovery path; admin-mediated reset via `supabase.auth.admin` for lost-everything cases. RP ID + origin locked per D-AUTH-02/03: `app.pleks.co.za` production, `localhost` dev only. `*.vercel.app` passkey routes throw (preview deploys refuse passkey operations — Public Suffix List issue prevents safe use). `predeploy` hook verifies env-var consistency. Testing matrix: 4 OS × 3 browsers, minimum viable coverage bolded (macOS Chrome/Safari, iOS Safari, Windows Chrome, Android Chrome). **14 design decisions logged (D-AUTH-01 through D-AUTH-14).** Production cutover via `supabase/migrations/_forward/build_62_auth.sql` helper script (per amend-forward release pattern). Depends on BUILD_01 auth foundation, BUILD_61 URL namespace, ADDENDUM_61B active-role cookie. Unblocks no builds but is release-gate for first production agency customer. BUILD_63 consumes `auth_events.event_type='tenant_portal_login'` rather than creating its own audit table. **Policy change post-spec (2026-04-28):** D-AUTH-01 revised — one TOTP factor mandatory (not two), backup secret shown prominently after first factor verified, second device is opt-in. Removes friction without removing recovery path; password-manager sync of the TOTP secret is the "second factor". **Security fixes shipped same session:** R-1 (open-redirect chain via `?redirect=` on login and `/auth/callback`) — all four consumption points wrapped in `safeRedirect()`; R-2 (base64url JWT decode in middleware) — `replaceAll("-","+").replaceAll("_","/")` + padding restore before `atob()`; MFA bypass at `/settings/security/enrol-totp` closed — mount effect checks verified factor count + AAL, redirects AAL1-with-factor users through `/login/mfa` before re-entering enrolment. **File header convention established** — `scripts/inject-file-headers.mjs` injected stubs across 883 files; highest-priority auth/supabase files filled; rule added to CLAUDE.md (fill on touch, update on change, never commit FILL stubs). **Open:** schema from `010_platform_features.sql` §14 (Part A + Part B) not yet applied to live Supabase DB — apply before next auth-touching deploy. |

---

## 6. Tenant Communication Lifecycle (BUILD_63) 📝

Audit-grade tenant-facing communication system. Today only 4 automated comms fire (arrears SMS, CPA s14 renewal, portal invite/link manual triggers). BUILD_63 wires 20+ registered-but-unwired templates, flips channel priority from legacy SMS-first to **WhatsApp-primary with SMS backup** (inheriting BUILD_58's consent + CS-window + Meta-approved template infrastructure), introduces a tone-variant architecture so relational comms ship three voices (friendly/professional/firm) selected by org `tone_tenant`, adds audit-grade delivery tracking for Tribunal readiness via `communication_delivery_events` + mandatory-comm retry queue, and establishes channel-selection + frequency/bundling rules in a single `lib/messaging/router.ts` choke point. DebiCheck comms deferred post-PMF per operational constraints.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 63 | `BUILD_63_TENANT_COMMUNICATION_LIFECYCLE.md` | 📝 | Tenant comms lifecycle across 8 phases. **WhatsApp-primary with SMS backup** inheriting BUILD_58's consent + CS-window + Meta-approved template infrastructure; channel router at `lib/messaging/router.ts` as single choke point replacing direct `sendSMS()` calls. **Tone-variant architecture**: relational templates ship three variants (friendly/professional/firm) selected by org `tone_tenant` at send time; transactional single-voice; legal-mandatory fixed formal. Covers financial ops (invoice, payment receipt, monthly statement on per-org configurable day), arrears escalation completion (wires LOD + final notice with mandatory-audit trail), lease lifecycle (activated, amended, escalation notice, expiry, notice acknowledged, terminated), inspection lifecycle (scheduled, reminder, rescheduled, move-in report, dispute window), maintenance lifecycle (logged, assigned, scheduled, completed, emergency, delay), deposit lifecycle (received, deduction schedule, refund, interest statement), portal auto-invite + reminder. **Tenant portal integration**: new `/portal/communications` list + detail pages surfacing every comm addressed to the tenant, unread mandatory-notice banner on dashboard, audit-logged portal logins with auth method + hashed IP, RLS policy letting tenants read their own comms, tenant-side POPIA export, Tribunal export extended with portal-view events + portal-login timeline appendix. Retry cascade (1h/6h/24h + delivery-alert WhatsApp with deep-link to portal or public notice page + 72h final retry + agent surrender). Every mandatory comm gets a letterhead PDF render target (generalising existing LOD letter pattern). Schema amendments to `communication_log` (body_full, template_version_hash, tone_variant, trigger_event_*, retry chaining); new `communication_delivery_events` (webhook-fed from Resend + Africa's Talking, with `page_view` + `portal_view` event types), `mandatory_comm_retries`, and `whatsapp_template_variants` tables. New `/api/legal/comm-export` Tribunal-ready PDF endpoint. Bulk imports full-suppress event-driven comms. DebiCheck comms **deferred post-PMF** per operational constraints — future ADDENDUM_63A will cover them when the platform has proven client base. |

---

## 6b. Phase 9 — Compliance & Legal Surfaces 📝

Sovereign positioning in trust account management and POPIA compliance. Two builds that together make regulatory compliance a product feature rather than a liability.

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 64 | `BUILD_64_SOVEREIGN_TRUST_ACCOUNT.md` | 📝 | **Sovereign Trust Account Management.** Pleks-as-observer, not trustee — agency keeps their own Section 86 trust account; Pleks reconciles, reports, audits. Four deliverables: (1) architectural invariant (`trustee_role_allowed` constraint + enforcement trigger in `001_foundation.sql`) ensuring Pleks can never become trustee; (2) monthly reconciliation close workflow — period-close lock + immutable signed-off record (`trust_reconciliation_periods`, `trust_audit_exports`); (3) EAAB/PPRA-compliant audit export (PDF + CSV); (4) positioning surface (`/for-agents/trust-account` marketing page + landlord-portal read-only `/landlord/trust-summary`). Fixes `bank_recon_sessions` phantom reference in `trust-ledger/page.tsx:95`. Un-defers BUILD_50 Part A (OFX/CSV/QIF import); Part B (Yodlee) stays deferred. Schema amendments to `004_leases_financials.sql` + `001_foundation.sql`. New `lib/trust/` (close, audit-export, invariants). New ESLint rule forbidding payment-initiation API calls. |
| 65 | `BUILD_65_POPIA_CUSTOMER_SURFACE.md` | 📝 | **POPIA Customer-Facing Surface.** Seven POPIA rights (access, correction, deletion, objection, portability, restriction, automated-decision) plus eighth Pleks-commitment right (full erasure/"nuke"). Structured `data_subject_requests` workflow with 30-day SLA enforcement. Self-service data export (PDF + JSON + ZIP with BUILD_64 manifest-hash tamper-evidence). Consent log viewer with immutable versioned privacy policy at `/privacy/versions/[version]`. Platform-admin cross-agency Operator dashboard for requests routed to Pleks directly. Daily `popia-retention-purge` cron. Schema in `010_platform_features.sql` (`data_subject_requests`, `popia_exports`, `privacy_policy_versions`, `retention_policies_snapshot`). New `lib/popia/` + `lib/exports/bundle.ts`. `popia-exports` Storage bucket. React Email templates: `popia.request_received`, `popia.request_approved`, `popia.request_rejected`, `popia.nuke_confirmation`, `popia.export_ready`, `popia.policy_update`. PROCESSING_PURPOSES.md (`brief/legal/`) is this build's foundational deliverable. |
| 66 | `BUILD_66_CHARTER_HOMEPAGE.md` | 📝 | **Charter section + homepage hero refresh.** Public marketing site only — no product code, no schema, no API. Replaces uniform 8-card Charter grid with asymmetric stamped-document grid: §01 (Trust Money) featured at 2×2 in top-left + per-commitment artefact SVGs (8 bespoke ~50-line SVGs each literally rendering proof of its commitment — `R 0.00 ALWAYS` ledger, struck-through analytics list, 24h vs 72h clocks, etc.) + wax-seal stamps (rotated -8°, `ATTESTED · §0n`, 0.42 opacity → 0.85 on hover) + dashed inner frame (existing motif from rent-roll/FitScore) + 9th register card filling the dead corner linking to `/privacy/processing-purposes`. Hero rewritten to lead with property-management outcomes ("Rent collected. Landlords paid. Deposits returned on the day.") replacing audit/database-vault language. Pillar-1 of "Why Pleks" rewritten as `01 · RECORDS · KEPT` with practitioner-language bullets (deposit clock, arrears letters drafted for you, one file per tenant) replacing audit_log/AES-256/RLS/Supabase-region jargon. FitScore artefact tab weight numbers (`w.40 / w.30 / w.20 / w.10`) removed for consistency with weights-not-published policy. All three copy changes + grid rebuild ship in one PR (D-CHARTER-09 atomic deploy). New `components/marketing/charter/` with `CharterSection.tsx`, `CharterCard.tsx`, `CharterRegisterCard.tsx`, `SealMark.tsx`, plus 9 artefact components. CSS module file uses only `var(--*)` tokens — zero new tokens, zero new hex values. Server-rendered, no `'use client'`, no JS, hover behaviour CSS-only (D-CHARTER-08). Fallback for register link: `existsSync` check on `/privacy/processing-purposes/page.tsx` at build time — if BUILD_65 hasn't shipped yet, link goes to `#charter` and stamp shows `Publishing May 2026`. Soft dependency on BUILD_64 (§01 doctrine) and BUILD_65 (register page). Estimated ~15 file touches, no schema, no migrations. |

---

## 7. Legal / CPA (ADDENDUM_04A) ✅

Tenant entity classification for CPA applicability determination at lease activation. Anchored on BUILD_04 (leases) since the derivation and enforcement live at lease lifecycle.

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_04A_CPA_APPLICABILITY.md` | BUILD_04 | ✅ | Tenant entity classification (juristic_type, turnover/asset size bands on `contacts`), franchise flag + CPA determination snapshot on `leases`, pure derivation helper `lib/leases/cpaApplicability.ts`, three-state `cpa_applies_at_signing` (yes/no/indeterminate) with indeterminate blocking activation, audit trail via `cpa_determination_category` + `cpa_determination_notes` + full tenant snapshot in `audit_log`. Removes scenario-level `cpa_applicable` from `buildProfile.ts` (authority lives on lease, not property). Provides authoritative CPA state for future s14 auto-renewal notice work (out of scope here — hook only). Schema changes in `002_contacts.sql` and `004_leases_financials.sql`. |

---

## 8. Infrastructure fixes (cross-cutting) 🔨

Platform-level fixes that apply across every phase. Kept separate so they're not lost inside a single BUILD.

| Spec | Status | Description |
|------|--------|-------------|
| `ADDENDUM_00A_TIER_COOKIE_FIX.md` | ✅ | Tier cookie staleness fix — `maxAge: 300` in `proxy.ts`, `refetchInterval: 5min` in `useTier()`, `/api/auth/refresh-tier` endpoint |
| `ADDENDUM_00B_OPERATING_HOURS.md` | ✅ | Office hours + emergency contact on organisations — `settings/hours` page + `HoursForm` |
| `ADDENDUM_00C_SETTINGS_SIDEBAR.md` | ✅ | `SettingsSidebar` replaces main nav when `pathname.startsWith("/settings")`; mobile drill-down via `MobileSettingsNav` |
| `ADDENDUM_00D_CI_CD.md` | ✅ | **First-class CI/CD and version-control automation — shipped.** (see full description in prior sessions) Three GitHub Actions workflows: `ci.yml` (lint+typecheck / security:ci subset / Trivy CVE / pr-title — NO build job; Vercel's preview deploy is the authoritative build signal), `release.yml` (main-only, gated on CI, runs semantic-release), `pr-title.yml` (re-validates title on edit). Semantic-release: commit-analyzer + release-notes-generator + github only — no changelog/git plugins, no pushback to `main`; GitHub Releases page is the changelog. First tag will be `v1.0.0`. Dependabot weekly npm (grouped by ecosystem) + monthly github-actions; subject-case rule dropped for Dependabot compat. `.nvmrc` Node 20; `engines.node >=20.9.0`; `security:ci` script (cats 1, 2, 5, 7; exits 0 if CI secrets absent). `.trivyignore` suppresses xlsx CVEs (CVE-2023-30533, CVE-2024-22363) with architectural justification + 2027-04-19 review date. Branch protection ruleset on `main`: squash-only, required checks = Lint & Typecheck / Security / Trivy / PR title; Repository-admin bypass for hotfixes. `production` environment created. Standing CC conventional-commit instruction in `CLAUDE.md`. 20 design decisions (D-CI-01–D-CI-20). Tier 2: test-matrix + coverage when vitest lands. Tier 3: CODEOWNERS + required approvals when team grows. |

| `ADDENDUM_00E_ERROR_MONITORING.md` | 📝 | Sentry error monitoring with POPIA-safe PII scrubbing. Client + server + edge runtime capture; org_id + user_id context (no identifying info); release correlation; Slack alerting on new error type or rate spike. Session replay deferred. Touches `sentry.*.config.ts`, `instrumentation.ts`, `lib/observability/scrubbing.ts`, `next.config.ts`, `/api/health` stub. Must land before BUILD_61 runtime refactor. |
| `ADDENDUM_00F_USER_FEEDBACK.md` | 📝 | In-app structured feedback capture (bugs / improvements / feature requests / praise). `feedback_submissions` + `feedback_replies` tables in `010_platform_features.sql`. Floating `FeedbackButton` on all role layouts; `/admin/feedback` (platform-admin) + `/settings/feedback` (org-admin). Reply-via-email through existing `lib/comms/send-email.ts`. No third-party service. |
| `ADDENDUM_00G_UPTIME_MONITORING.md` | 📝 | Better Stack uptime monitoring pinging `/api/health` every minute from 3 regions. Full `/api/health` implementation (shallow fast-path + authenticated deep probe for DB / Resend / Storage / cron freshness). Public status page at `app/(public)/status/page.tsx`. Slack `#pleks-ops` alert within 60s of sustained failure. No schema changes. Depends on ADDENDUM_00E `/api/health` stub. |
| `ADDENDUM_00H_COST_USAGE_DASHBOARDS.md` | 📝 | Cost & usage observability for pre-PMF unit economics. `ai_usage` + `platform_cost_snapshots` tables in `010_platform_features.sql`. `lib/ai/client.ts` wrapper unifying all 4 existing Anthropic call sites with per-org token + cost logging. Daily cron (`cost-snapshots`) at 08:30 SAST. `/admin/platform-health` per-org cost/revenue/margin view. Depends on BUILD_58 (`messaging_usage`), ADDENDUM_57E email choke point, BUILD_60 (`cron_runs`). |

Note: there are two `ADDENDUM_00A_*` files by design — `ADDENDUM_00A_ENCRYPTION_AT_REST.md` (listed under Phase 1, part of BUILD_00 security) and `ADDENDUM_00A_TIER_COOKIE_FIX.md` (above, infrastructure layer). Same prefix, different scope.

---

## 10. Legal specs (`brief/legal/`)

Attorney-reviewed clause and disclaimer text that the platform relies on.

| File | Related build | Status | Description |
|------|--------------|--------|-------------|
| `DRAFT_OPTIONAL_CLAUSES_FOR_REVIEW.md` | BUILD_31 | 📦 | Initial 4 clause drafts — superseded |
| `DRAFT_v2_OPTIONAL_CLAUSES_FOR_REVIEW.md` | BUILD_31 | 📦 | Legal review round 2 — superseded |
| `FINAL_v3_OPTIONAL_CLAUSES.md` | BUILD_31 | ✅ | Final clause body text — approved |
| `FINAL_SIGNOFF_AMENDMENTS.md` | BUILD_31 | ✅ | 3 amendments + seed instruction — approved |
| `FINAL_CO_LESSEE_LIABILITY.md` | BUILD_30 | ✅ | Joint & several liability clause — attorney reviewed |
| `FINAL_PLATFORM_DISCLAIMER.md` | BUILD_44 | ✅ | Lease template acceptance gate — attorney reviewed |

---

## 11. Migrations

> File names are in `supabase/migrations/`. Structure is consolidated and domain-scoped — new features amend an existing file rather than creating a new one. See `CLAUDE.md` "HOW TO WORK WITH MIGRATIONS" for the amend-forward rule.

### Active migrations

| File | Domain | Source builds / contents |
|------|--------|--------------------------|
| `001_foundation.sql` | Foundation | BUILD_00–07 — auth, orgs, RLS, audit, consent, bank accounts, waitlist |
| `002_contacts.sql` | Contacts | BUILD_25/25S — contacts master + thin tenant/landlord tables + `communication_log` base |
| `003_properties.sql` | Properties | BUILD_02, 02A, 02B — properties, buildings, units, inspections |
| `004_leases_financials.sql` | Leases & finance | BUILD_04, 07, 08 — leases, charges, trust, payments, deposits, arrears. **DebiCheck mandates/collections demolished 2026-04-26** (Sweep A) — Pleks does not run DebiCheck; agencies retain bank-side mandates and Pleks reads bank statement matches only. `payment_method` CHECK narrowed to `eft/cash/card/bank_recon_matched`. |
| `005_operations.sql` | Operations | BUILD_05, 06, 06B, 11, 12, 13 — maintenance, contractors, applications, municipal, HOA, reports, imports. BUILD_60: `property_info_requests` + `property_info_request_events`. |
| `006_seed.sql` | Seed data | BUILD_00 — reference data (prime rates, clause library, rule templates) |
| `007_enhancements.sql` | Cross-cutting | BUILD_02–07 addendums, BUILD_14–24, 27, 30, 31, 33, 35, 36, 37, 38A-C, 41, 44, 46 — unit enhancements, clause profiles, org details, branding, HOA/body corporate, rules, performance, realtime, portal access |
| `008_enhancements2.sql` | Cross-cutting 2 | BUILD_09, 16, 17, 19 — bank recon, applications, deposits, contractor portal. *(BUILD_10 DebiCheck additions demolished 2026-04-26 — Sweep A.)* |
| `009_security.sql` | Security | ADDENDUM_00A (encryption at rest) — encryption for PII, RLS hardening, WITH CHECK everywhere |
| `010_platform_features.sql` | Platform | BUILD_49 (tenant portal), BUILD_50 (bank feeds), ADDENDUM_00B (operating hours), BUILD_24 agent profile / multi-role, team member fields, custom role library, BUILD_56 (`is_admin` + ownership transfers), ADDENDUM_57F (Owner Pro per-lease billing: `premium_enabled`, `subscription_charges` — 📦 superseded 2026-04, schema retained as orphan), lease notes, BUILD_60 (`cron_runs` health table), BUILD_62 Part A (`auth_events`, `device_fingerprints`, `login_notifications_sent`, `step_up_challenges`, `is_mfa_fresh`, `purge_old_auth_events`) + BUILD_62 Part B (`user_passkeys`, `passkey_challenges`). Section count likely now 14. |
| `011_documents_messaging.sql` | Documents & messaging | ADDENDUM_57E (templates, signatures, document editor: `user_signatures`, `signature_sign_tokens`, `document_templates`, `user_template_favourites`, `org_whatsapp_template_preferences`, `document_generation_jobs`, `lease_documents`, 27 system template seeds), BUILD_58 (WhatsApp: `whatsapp_messages`, `tenant_messaging_consent`, `whatsapp_cs_windows`, `messaging_usage`, `communication_log` delivery-tracking extensions), storage buckets (signatures, lease-templates, property-documents) + path-scoped RLS. 13 sections. |
| `012_property_extensions.sql` | Property extensions | ADDENDUM_57A (unit types + `unit_inspection_profiles`), ADDENDUM_57B (furnishings), BUILD_59 (insurance on `properties`, `property_brokers`, `managing_schemes`, `incident_notifications`, severity + insurance flags on `maintenance_requests`, `has_managing_scheme` trigger), inspection storage bucket, BUILD_60 (scenario_type, property_profile JSONB, managed_mode, onboarding tracking, universal questions WiFi/cell/backup power, operating hours, is_lettable + industrial unit columns, business_use_permitted), ADDENDUM_60A (insurance verification checklist: `insurance_checklist_catalogue`, `property_insurance_checklist_items`, `property_insurance_checklist_audit`, `property_insurance_renewal_reminders`). 12+ sections. |

### Domain routing for new BUILDs

When a BUILD needs schema changes, amend the appropriate domain file rather than creating a new migration. Route by what the change touches:

| Change touches… | Amend | Notes |
|-----------------|-------|-------|
| property / unit / inspection / insurance / managing scheme / building | `012_property_extensions.sql` | Property-side vocabulary |
| leases / rent / deposits / arrears / trust ledger / lease charges | `004_leases_financials.sql` | Lease + financial lifecycle |
| maintenance / contractors / HOA / applications / municipal bills / reports / imports | `005_operations.sql` | Day-to-day operational workflows |
| contacts / tenants / landlords / `communication_log` core fields | `002_contacts.sql` | Contacts CRM + base comms log |
| portal / subscription billing / auth / team / admin / ownership / bank feeds / tenant portal / landlord portal / cron health | `010_platform_features.sql` | Platform-level plumbing |
| documents / templates / signatures / WhatsApp / email / SMS / storage buckets + RLS | `011_documents_messaging.sql` | Anything document-, template-, or messaging-shaped |
| reference / seed data (prime rates, clause library, rule templates, system templates) | `006_seed.sql` | Idempotent `INSERT … ON CONFLICT DO NOTHING` seeds only |
| encryption / RLS hardening / `WITH CHECK` policies | `009_security.sql` | Security hardening — cross-table policy work |
| foundational tables only (`organisations`, `user_orgs`, `audit_log`, `consent_log`, waitlist) | `001_foundation.sql` | Rare. Only if adding or evolving truly foundational auth/tenancy tables. |

**Do NOT amend** `007_enhancements.sql` or `008_enhancements2.sql`. These are historical cross-cutting files preserved for replay fidelity. New work goes into the domain-scoped files (010–012) or the other domain files above.

---

## 12. AI cost model

| AI use | Model | Cost gate | Rationale |
|--------|-------|-----------|-----------|
| Maintenance triage | Haiku | Free, all tiers | Core platform — makes routing work |
| Bank statement classification | Haiku | Free, all tiers | Core platform — makes reconciliation work |
| Document type detection | Haiku | Free, all tiers | Core platform — makes import work |
| Import column mapping | Haiku | Free, all tiers | Core platform — makes import work |
| FitScore summary | Sonnet | Free, all tiers | Core platform — makes applications work |
| Wear & tear assessment | Sonnet | Free, all tiers | Core inspection — makes deposit deductions defensible |
| Inspection voice transcription | Sonnet | Free, all tiers | Core inspection — fieldworker efficiency |
| Arrears communications | Sonnet | Free, all tiers | Core collections — legally appropriate wording |
| **Property rule reformat** | **Haiku** | **Paid credits** | User content enhancement — convenience, not core |
| **Custom clause drafting** | **Sonnet** | **Paid credits (future)** | User content enhancement |
| Deposit dispute letter | Opus | Per-use fee (future) | High-value legal document generation |
| Tribunal submissions | Opus | Per-use fee (future) | Complex legal document generation |

---

## 13. Reference files

Supporting docs in `brief/build/` that aren't specs themselves.

| File | Description |
|------|-------------|
| `BUILD_DEPENDENCY_MAP.md` | Build dependency graph |
| `CLAUDE_CODE_INSTRUCTIONS.md` | Standing Claude Code instructions |
| `SEARCHWORX_PRICING_REFERENCE.md` | Searchworx per-check pricing |
| `_SUPERSEDED_ADDENDUM_37A_OWNER_VIEW.md` | Superseded owner view draft — kept for historical reference |
| `_HANDOVER_BUILD_65_66.md` | Handover doc from the session that produced ADDENDUM_00E–00H + BUILD_64–65. Strategic decisions, architectural patterns, open questions for BUILD_66. |
