# Pleks Build Specs — Master Index

> Last updated: 2026-04-17 — restructured into phase-based layout
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
| 4 | Property Operations & Refactors | BUILD_59–61 | 🔨 In progress |
| 5 | Infrastructure fixes (cross-cutting) | ADDENDUM_00A–C | ✅ Done |
| 6 | Legal specs | `brief/legal/` | ✅ Approved |
| 7 | Migrations | `supabase/migrations/001–012` | ✅ Consolidated |
| 8 | AI model routing | — | Reference |
| 9 | Reference files | — | Reference |

**Known open work:** BUILD_60 Phase 20 (email template seeds — 6 topics × 3 tone variants via React Email); BUILD_60 Phase 2 unit tests deferred — repo has no test harness yet; will be addressed when vitest is stood up (separate task, not blocking); BUILD_60 006_seed.sql demo data (3–5 scenario properties + skeleton units + info_request rows) deferred to Phase 12 (completeness widget) so seed can be tested against the widget in one pass; BUILD_60 tier-aware "Unknown" copy on universal questions (spec §19.3 — Portfolio/Firm tier should see "We'll flag this for the servicing agent to confirm on their first site visit" under Unknown answers) deferred as cosmetic polish — needs `useTier()` wiring, not the right moment mid-wizard build; BUILD_60 C2/C3 identical-layout toggle not shipped — spec §8.7 expected toggle on all three counted scenarios (R4/C2/C3), only R4 has it; commercial/industrial units currently captured once and applied to all, sufficient for v1 since per-unit editing is available on the Units tab after creation; BUILD_61 route alignment (spec'd, not yet built); ADDENDUM_60A spec (insurance checklist); ADDENDUM_61A spec (conditional-rendering audit); BUILD_62 (future: user profile surface buildout — security, preferences, richer profile page — depends on BUILD_61 namespace).

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
| 10 | `BUILD_10_DEBICHECK.md` | ✅ | DebiCheck / Peach Payments (`payments/debicheck`) |
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
| `ADDENDUM_07A_FINANCE_NAV.md` | BUILD_07, 09 | ✅ | Finance nav — Payments page tab bar (Payments / Invoices / Reconciliation / Arrears / Municipal / DebiCheck) |
| `ADDENDUM_16A_JOINT_APPLICATION.md` | BUILD_16 | ✅ | Joint application handling |
| `ADDENDUM_16B_MOTIVATION_FIELD.md` | BUILD_16 | ✅ | Application motivation field |
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
| 40 | `BUILD_40_PROPERTY_UNIT_INLINE.md` | 📦 | Superseded by ADDENDUM_57D (inline expand panel killed). Type-aware fields (`lib/units/typeAwareFields.ts`) and `AddUnitDialog` retained. Unit cards navigate to unit detail page. `UnitExpandPanel.tsx` + `PropertyUnitsSection.tsx` exist as dead code. |
| 41 | `BUILD_41_DATA_FRESHNESS.md` | ✅ | Phase 1 done — window focus revalidation, mutation invalidation, last-updated indicators |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_31A_UNIT_CLAUSE_UX.md` | BUILD_31 | ✅ | "Lease setup" naming, toggle_label, empty/auto states |
| `ADDENDUM_31B_CLAUSE_CONFLICTS.md` | BUILD_31 | ✅ | Clause conflict checker (deterministic + Sonnet) + HOA supremacy clause |
| `ADDENDUM_32A_LEASE_PREVIEW_PROTECTION.md` | BUILD_32 | ✅ | Page breaks, download tier-gating, watermarks |
| `ADDENDUM_33A_FLEXIBLE_SIGNING.md` | BUILD_33 | ✅ | Three signing paths, DebiCheck optional |
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
| 46 | `BUILD_46_LANDLORD_PORTAL.md` | ✅ | `(landlord-portal)` route group: dashboard, properties, maintenance, statements, profile. Magic-link auth via `getLandlordSession()` |
| 47 | `BUILD_47_OPERATIONS_CALENDAR.md` | ✅ | Unified ops calendar (`/calendar`) — FullCalendar with dayGrid, timeGrid, list, interaction plugins; `CalendarClient` |
| 48 | `BUILD_48_APPLICATION_PORTAL.md` | ✅ | Applicant portal — `(applicant)/apply/[slug]/` with details, documents, review, status; invite flow with consent, payment, status pages |
| 49 | `BUILD_49_TENANT_PORTAL.md` | ✅ | Tenant portal — `(portal)` route group: magic-link auth (`/portal/access?token=`), dashboard, lease, payments, maintenance, account. `getTenantSession()` auth layer |
| 50 | `BUILD_50_BANK_FEEDS.md` | 📦 | OFX, CSV, QIF parsers in `lib/recon/`; bank detection, matching engine built. Yodlee/live feed integration deferred — will be revisited when there is a live paying customer requiring it. |
| 51 | `BUILD_51_FINANCIAL_ACCOUNTING_VIEWS.md` | ✅ | Trust ledger (`finance/trust-ledger`), deposits (`finance/deposits`), owner statements (`/statements`); `lib/finance/financeHub.ts` |
| 52 | `BUILD_52_REPORTS_OVERHAUL.md` | ✅ | 26 report tabs, CSV + PDF export via `/api/reports/export`; `ReportShell` wrapper. Branded PDF confirmed — `reportBranding.ts` fetches `logo_url`, `brand_accent_color`, `brand_font`, `brand_cover_template` from org; 4 letterhead layouts (classic/modern/bold/minimal) in `generatePDF.ts` with logo + accent throughout. |
| 53 | `BUILD_53_WELCOME_PACK.md` | ✅ | AI landlord welcome pack — `lib/reports/welcomePack.ts`, `generateWelcomePackHTML.ts`, `welcomePackRecommendations.ts`; `WelcomePackTab` in reports; `WelcomePackBanner` |
| 54 | `BUILD_54_TENANT_WELCOME_PACK.md` | ✅ | Tenant welcome pack — `lib/reports/tenantWelcomePack.ts`, `tenantWelcomePackHTML.ts` |
| 55 | `BUILD_55_DEMO_OVERHAUL.md` | ✅ | Demo mode — `(demo)` route group with 12 pages (dashboard, properties, landlords, tenants, leases, maintenance, inspections, applications, payments, finance, suppliers); `lib/demo/DemoContext.tsx` + `demoData.ts` |
| 56 | `BUILD_56_PERMISSIONS.md` | ✅ | `is_admin` on `user_orgs`, `isAdmin` in gateway, `usePermissions()` hook, UI gates on Landlords/Tenants/Contractors list + team page. Server actions gated: `archiveProperty`, `deleteProperty`, `deletePropertyDocument`, `deleteDocumentTemplate`. Team member/invite API routes gated. Ownership transfer: owner-only card on `/settings/team` → `POST /api/team/transfer-ownership` swaps roles, Resend emails, `audit_log` entry. |
| 57 | `BUILD_57_MOBILE_UX.md` | ✅ | Parts A–H shipped. A: `MobileHomeScreen`. B: `MobileBottomBar` + `MobileMoreSheet` + `MobileQuickAdd`. C: `MobileInspectionView` + `MobileMaintenanceView` — photo capture/comparison + signature capture confirmed (`SignOffFlow.tsx` — full canvas dual-signature agent + tenant, composited JPEG, wired in `MobileInspectionView`). D: `MobileTenantView` + `MobilePropertyView`. E: `DesktopOnlyCard`. F: `isMobile` checks. G: bottom bar + safe-area. H: `sw.ts`, `manifest.json`, `syncEngine`, `SyncIndicator`, `/api/offline/sync-manifest`. |
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
| `ADDENDUM_57A_INSPECTION_PROFILES.md` | BUILD_57 | ✅ | Unit types + inspection profiles — `UNIT_TYPES` (13 types) in `UnitForm.tsx`; `unit_type` field on unit form; `InspectionProfileCard` at `properties/[id]/units/[unitId]/` with `setupProfileFromTemplate` action; `unit_inspection_profiles` + `unit_inspection_profile_rooms` tables queried. Note: spec says 15 types, shipped 13. |
| `ADDENDUM_57B_UNIT_SETUP.md` | BUILD_57 | ✅ | Unit setup redesign — `UnitForm.tsx` has 3-tab structure (`details` / `features` / `rental`). Tab 1: unit type, floor, size, rooms. Tab 2: features & furnishings, inventory. Tab 3: rent + clause profile. Wired into unit detail page. |
| `ADDENDUM_57C_LEASE_DETAIL.md` | BUILD_57 | ✅ | Lease detail page redesign — six-tab experience: `LeaseTabs` + `OverviewTab`, `LeaseDetailsTab`, `ContactsTab`, `FinanceTab`, `DocumentsTab`, `OperationsTab` at `leases/[leaseId]/`. Deposit interest resolved. 6 tabs match spec. |
| `ADDENDUM_57D_PROPERTY_DETAIL.md` | BUILD_57 | ✅ | Property detail page redesign — `PropertyTabs` with 5 base tabs (Overview, Buildings & units, Insurance & risk, Operations, Documents) + optional Scheme & compliance tab. Tab components: `OverviewTab`, `UnitsTab`, `InsuranceTab`, `SchemeTab`, `OperationsTab`, `PropertyDocumentsTab`. Exceeds the 4-tab spec. |
| `ADDENDUM_57E_DOCUMENT_GENERATION.md` | BUILD_57 | ✅ | (1) **User signatures** — `settings/profile/signature/` (canvas draw + file upload), stored in `user_signatures` table; public magic-link capture at `(public)/sign-signature/[token]/` via `SignaturePadCapture`, token issued from `signature_sign_tokens`. (2) **Unified Templates** — `settings/communication/templates/` with `TemplatesClient`; 27 system templates seeded in `011_documents_messaging.sql` §8; org-level duplicate-and-override pattern; tone variants (friendly/professional/firm) per template. (3) **Document editor** — `documents/new/` with TipTap rich editor, merge field insertion, PDF export, Resend email dispatch; `document_generation_jobs` tracks generation state. (4) **Config page** — `settings/configuration/` (Organisation group in sidebar). `ConfigurationForm` + `saveOrgConfiguration()` server action; settings: tone (tenant/owner), managed-by label, SMS fallback toggle + delay; written to `organisations.settings` JSONB under `preferences_version: 1`. |
| `ADDENDUM_57F_OWNER_PRO_BILLING.md` | BUILD_57 | ✅ | Owner Pro tier — `lib/billing/leaseFeatures.ts` with `canUseLeaseFeature()` + `PREMIUM_FEATURE_LABELS`, `premium_enabled` on leases, `subscription_charges` table (`010_platform_features.sql` §10). Frozen state logic implemented. |

---

## 4. Property Operations & Refactors (BUILD_59–61) 🔨

The current work front. Property insurance/broker/managing-scheme architecture (BUILD_59) is fully shipped. The scenario-driven smart property setup wizard (BUILD_60) is at Phases 1–22 of 22 done — the wizard saves real properties end-to-end, the completeness widget drives ongoing setup, admins can reclassify or bulk-classify imported properties, the tier gate now lives at lease activation, the Overview tab surfaces the scenario label + operating hours, and the wizard is fully mobile-responsive. Phase 20 (email template seeds — 6 topics × 3 tone variants) remains the only open item before BUILD_60 is fully closed. BUILD_61 is a mechanical route-alignment refactor spec'd but not yet started.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 59 | `BUILD_59_PROPERTY_INSURANCE_SCHEME.md` | ✅ | All 13 phases. Schema in `012_property_extensions.sql` §4–§11. AI triage extended. `CriticalIncidentDialog` + `CriticalIncidentWrapper`. `recordInsuranceDecision` → parallel notify (broker/owner/scheme) → audit trail. 3 React Email templates. Multi-building opt-in via `EnableMultiBuildingDialog`. Phase 13: broker card gated (`canSeeBroker` = `owner_pro_lease_count > 0` for owner tier, always true for Steward+); free Owner sees upgrade prompt. Scheme tab edit link hidden for owner tier (read-only). Monthly levy KvRow + dedicated Levies section card gated to Firm tier only. |
| 60 | `BUILD_60_SMART_PROPERTY_SETUP.md` | 🔨 | **Phases 1–17 + 19 + 21 + 22 shipped.** Phase 1: Schema in `012_property_extensions.sql` §12 (scenario_type, property_profile JSONB, managed_mode, onboarding tracking, universal questions WiFi/cell/backup power, operating hours, is_lettable + industrial unit columns, business_use_permitted). `property_info_requests` + `property_info_request_events` in `005_operations.sql`. `cron_runs` health table in `010_platform_features.sql` §12. `lib/tier/getActiveLeaseCount.ts` + `canActivateLease.ts`. Owner property count gate removed — lease activation is now the tier gate. Phase 2: `lib/properties/scenarios.ts` (ScenarioMeta + ScenarioQuestion definitions for all 11 SA scenarios with segment, icon, educational bullets, typed questions with group/showWhen); `lib/properties/buildProfile.ts` (pure `buildProfile()` deriving full property_profile JSONB — unit type, furnishing, insurance type/rider, CPA flag, deposit months, lease duration, inspection/clause/welcome-pack keys via lookup tables); `lib/properties/skeletonUnits.ts` (pure `buildSkeletonUnits()` — typed SkeletonUnit arrays for all 11 scenarios including C3 industrial columns, M1 retail+residential split, ≥1 lettable unit guarantee). Phase 3: `WizardContext.tsx` (typed `WizardState`, `WizardProvider`, `useWizard()`, `computeActiveStepIds()` — active step list varies by scenarioType and managedMode); `WizardShell.tsx` (progress dots with ✓ done state, step routing switch, Back/Continue/Save-property nav, advanced-mode toggle); `steps/Step*.tsx` (10 placeholder step components — Picker, Address, Universal, ScenarioFollowUp, OperatingHours, Landlord, Units, Insurance, Documents, Summary); `page.tsx` wrapped in `WizardProvider`. Phase 4: `StepPicker.tsx` — ownership binary (self_owned / managed_for_owner), 3-segment selector (desktop tabs / mobile native select, reset-on-segment-switch), scenario card grid with Lucide icon + tagline + in-place educational bullet accordion + unit count input for counted scenarios, "Something else → advanced setup" link. `WizardShell.tsx`: Continue button disabled until scenario selected. Phase 5: `StepUniversal.tsx` — four universal questions (managing scheme with pre-selection for R3/R5 + conditional scheme name input; WiFi; cell signal; backup power); local state syncs to `state.universals` on every change. Phase 6: `StepScenarioFollowUp.tsx` — data-driven rendering of all 6 question types (radio/select/number/text/toggle/multiselect) from scenarios.ts definitions; showWhen gates evaluated at render; questions grouped by unit_details/property_level/operational with section headers. `StepOperatingHours.tsx` — 5 preset options + after-hours access radio + conditional notice-period/notes fields. Phases 7+8: `StepLandlord.tsx` — 3-option picker (existing owner search via GET /api/landlords with inline filter, new owner inline mini-form covering individual/company/trust, later option); `StepUnits.tsx` — editable label list initialised from buildSkeletonUnits defaults (R1 flatlet_label, R3 section numbers, M1 Shop/Flat naming, etc.); add/remove for counted scenarios. Phase 9: `StepInsurance.tsx` — 3-option skip picker + 5-field form (insurer, policy number, renewal date, replacement value R→cents) + educational callout; TODO(60A) hook marks the handoff point for the checklist system. **CD audit (Phases 1–4):** GAP 1 fixed — `UNIQUE (property_id, topic, status) DEFERRABLE INITIALLY DEFERRED` added to `005_operations.sql`. GAP 2 (unit tests) deferred — no test harness in repo. Seed demo data deferred to Phase 12. **CD audit (Phases 5–9):** GAP 1 fixed — `unknown` added to `backup_power` CHECK constraint in `012_property_extensions.sql` §12(a); `UniversalAnswers.backupPower` type extended; StepUniversal null-coercion changed from `"none"` → `"unknown"`; "Unknown" option added to backup power RadioGroup. GAP 2 (tier-aware "Unknown" copy) deferred — needs `useTier()` wiring, low priority cosmetic. GAP 3 taken as Option B — Phase 9 TODO comment updated to "4 identification items"; broker deferred to BUILD_59 Insurance tab (pointer note added to insurance-now panel). Phase 6 one-screen rendering **confirmed intentional** — section headers work better than sub-screens for all residential scenarios; C3 (10 questions) is borderline but acceptable. Phase 7 "later" **deviation fixed** — `LaterPanel` added with 2-track picker: `owner_email` (captures email for future info_request) or `self` (widget nudges only); `LandlordDraft.later_track` field added to WizardContext. C2/C3 `identical_layout` noted as **v1 limitation** — heterogeneous commercial/industrial deferred; users can edit per-unit after save. Advanced-mode escape hatch **assigned to Phase 11** (save action handles both wizard and advanced paths). Phase 10: `StepDocuments.tsx` — drag-and-drop zone + click-to-browse, multi-file upload with 20MB limit and rejected-file UI feedback, filename heuristic for doc type, conditional expiry-date input for CoC types. `WizardContext.PendingDocument[]` holds File objects client-side; uploaded by save action. Phase 11: `lib/actions/createPropertyFromWizard.ts` — atomic property + building + skeleton units + landlord (existing/new/auto-created contact) + insurance fields + documents (uploaded to `property-documents` bucket) + info_requests (deferred to Phase 13 action) + audit log + initial onboarding pct. Refactored into helpers (`resolveLandlord`, `buildPropertyInsertRow`, `buildUnitRows`, `uploadOneDocument`/`uploadWizardDocuments`, `scheduleInfoRequests`, `validatePayload`) to stay under cognitive-complexity limit. `StepSummary.tsx` rewrite — review screen with checked/unchecked items + computed pct. `WizardShell` wired to call save action via `useTransition`, displays Saving… state, redirects to `/properties/{id}?tab=overview&first_visit=true` on success. Advanced-mode escape hatch now renders the original `<PropertyForm action={createProperty} />`. Phase 12: `lib/properties/computeCompleteness.ts` — pure `computePropertyCompleteness()` returns weighted pct + outstanding items array; `shouldRenderCompletenessWidget()` enforces 30-day lifetime + 7-day dismiss cooldown. `CompletenessWidget.tsx` (client) — progress bar, per-item action buttons (Send owner email / Send reminder / Add manually deep-link), Dismiss button. `CompletenessWidgetWrapper.tsx` (server) — fetches property + landlord + scheme contact + brokers + documents + units + open info_requests in parallel, builds snapshot, gates render. Wired into property detail Overview tab. `dismissCompletenessWidget` server action sets `onboarding_widget_dismissed_at`. Phase 13: `lib/actions/propertyInfoRequests.ts` — `createPropertyInfoRequest` (de-duped insert + `created`/`email_sent` event log + immediate Resend dispatch for owner/broker tracks), `createInfoRequestFromWidget` (UI wrapper with org auth), `sendInfoRequestReminder` (increments reminder_count + logs event), `dismissInfoRequest`. `lib/info-requests/sendInfoRequestEmail.ts` — minimal HTML body (full templates land in Phase 20) with magic-link `${APP_URL}/property-info/${token}`, POPIA notice, agency branding. 16 `info_request.*` template registry entries (8 topics × regular + reminder) added to `template-registry.ts`; `onboarding` category added to `TemplateCategory`. **Replay-safety fix:** `backup_power` CHECK constraint refresh in `012_property_extensions.sql` now uses DROP/ADD CONSTRAINT pattern (was a no-op `ADD COLUMN IF NOT EXISTS` on existing DBs — CD spotted before Phase 14 work began). Phase 14: `/app/(public)/property-info/[token]/page.tsx` — public server component that validates token, handles completed/dismissed/expired terminal states, logs `viewed` event on first visit, fetches property + agency context for the form header. `PropertyInfoForm.tsx` (client) — data-driven rendering of 8 topic field sets (insurance / landlord / scheme / banking / broker / compliance / documents / other), POPIA consent checkbox gate, thank-you state on submit. `actions.ts` — `submitPropertyInfo` server action with 5 writeback handlers (insurance writes to properties, landlord creates contact+landlord if none linked, scheme updates managing_schemes, banking updates landlords, generic topics log notes on completion event), whitelist-filtered values, marks request `completed` + logs event. Phase 15: `/app/api/cron/info-requests/route.ts` — daily cron wired into `/api/cron/daily`, expires stale requests past `expires_at`, sends reminders per track (owner T+3 first + T+7 second with 3-day cooldown, broker T+5 one-shot, self T+30 one-off nudge log), health-tracked via `cron_runs` (`startJob`/`finishJob` with rows_processed + metadata breakdown). Phase 17: `lib/actions/reclassifyProperty.ts` — admin-only server action that preserves prior universals + scenario_answers, re-runs `buildProfile` with the new scenario, updates `scenario_type` + `property_profile`, audit logs the from/to transition. `ReclassifyDialog.tsx` in the property detail header (owner-role gated in UI, server re-checks). Phase 16: `PropertySetupCards.tsx` on dashboard — renders `FirstPropertyCard` (totalProperties === 0) or `ImportedPropertiesReviewCard` (recent import within 7 days + any `scenario_type IS NULL` property) with unclassified count. `/properties/classify/page.tsx` bulk classifier — server-fetched unclassified properties, `ClassifyList.tsx` (client) with rule-based scenario suggestion per row (type-keyword heuristic, Haiku fallback deferred to post-launch), Confirm/Skip per-row, live progress counter. **CD audit (Phases 10–13):** GAP 1 fixed (atomicity, Option B) — `createPropertyFromWizard` now wraps property+building+units inserts in try/catch with `rollbackCreated()` helper that deletes in reverse FK order on any failure, including the contact+landlord pair when "new owner" path created them. Documents/info_requests/audit log remain best-effort post-commit (failures leave a usable property the user can repair from the relevant tab). Note: this is Option B (manual rollback); Option A (plpgsql RPC for atomic insert) is the long-term path once ADDENDUM_60A's checklist + warranties compound the multi-row write surface. GAP 2 fixed (security, Option A) — `createPropertyInfoRequest` now starts with `gateway()` auth check that rejects when caller is unauthenticated or `gw.orgId !== params.orgId` or `gw.userId !== params.requestedBy`. Closes the unauthenticated cross-org info-request injection vector. GAP 3 fixed — `unitHasFullDetails` in `CompletenessWidgetWrapper` now treats `industrial_*` unit types as non-residential (size_m2 check) instead of falling through to the residential bedrooms+bathrooms branch; C3 properties can now reach 100% completeness. Observation (a) actioned — dropped the hardcoded "Western Cape" province fallback in `buildPropertyInsertRow` (was actively misleading for properties in other SA provinces). **CD audit (Phases 14–17):** GAP 1 fixed — free-form topics (broker / compliance / documents / other) now persist submitted values into `property_info_request_events.payload.values`; strict-writeback topics (insurance / landlord / scheme / banking) continue to land only on their target tables. Prior to this fix, textarea input was silently dropped. GAP 3 fixed — `notifyRequester` helper in `submitPropertyInfo` fetches the requesting user's email via `auth.admin.getUserById` + `user_profiles`, sends a "Owner replied" email via `sendEmail` with a link back to the property; best-effort (failure logged but submit still succeeds). New template key `info_request.completion_notify` added to registry. GAP 2 (rate limiting on submit) **skipped** per CD preference — 32-byte token entropy + terminal-status single-use model provides sufficient defence; documented as intentional deviation. GAP 4 (self-track T+30 email nudge not actually sent) **acknowledged** — event logging already in place; email body deferred to Phase 20 template work. Deviation 1 fixed — owner track reminder cadence: cooldownDays changed from 3 to 4 so the second reminder fires at exactly T+7 (was T+6). Deviation 2 fixed — `sendReminderFor` now uses optimistic concurrency on `reminder_count` (`.eq("reminder_count", currentCount)`) so concurrent cron runs can't double-send a reminder for the same row. ReclassifyDialog confirmed wired into property detail header (owner-role gated). Phase 19 (tier gate refactor): `canActivateLease` now wired into `markAsSigned` in `lib/actions/leases.ts` — checks tier limit before `activateLeaseCascade`, returns human-friendly error ("You've reached your active lease limit. Owner tier allows 1 active lease. Upgrade to activate more."). Phase 1 had already removed the old `properties.count >= 1` Owner gate, so this completes the tier model correction. Phase 21 (educational copy): `lib/properties/scenarioEducation.ts` extracts the per-scenario bullets out of `scenarios.ts` so non-devs can tune copy without touching the data model. `educationalBullets` field removed from `ScenarioMeta`; `StepPicker` reads via `getScenarioEducation(code)`. Copy reviewed against SA legal references (RHA, CPA, NCA, STSMA, CSOS, RHT, CIDB, VAT, HAZMAT) — all accurate. Phase 22 (existing property integration): `OverviewTab` now surfaces `scenario_label` (derived from `SCENARIOS` map) + `operating_hours_preset` (human-labeled via `OPERATING_HOURS_LABELS`) as KvRows in the Property Details card. Page-level helper `resolveScenarioLabel` handles the "other" scenario plus null fallback. Completeness widget already integrated in Phase 12 (satisfies the scenario-aware data display acceptance criterion). Phase 18 (mobile shell): responsive card height fills viewport on mobile (`h-[calc(100svh-13rem)] md:h-[550px]`), scenario segment selector uses Radix Select on mobile, scenario cards stack to 1 column below sm breakpoint, "Something else" stays pinned in footer. BUILD_60 fully shipped — Phase 20 (email template seeds) is the sole remaining item. |
| 61 | `BUILD_61_ROUTE_ALIGNMENT.md` | 📝 | Mechanical refactor aligning routes to UI labels. UI renames: `/payments` → `/billing`, `/contractors` → `/suppliers`, `/settings/finance` → `/settings/deposits`, `/settings/billing` → `/settings/subscription`, `/settings/communication/templates` → `/settings/documents/templates`. Matching `/api/*` renames. **Profile/details split**: `/settings/profile` (org details) moves to `/settings/details` + stub page at `/settings/profile` becomes the user-profile landing (personal info, link to Signature, pointer to Details for agency users) — no redirect, URL is repurposed. `/settings/profile/signature` untouched. Same schema, different presentation — no migration. 13 permanent HTTP 308 redirects. Orphan settings audit (`/settings/applications`, `/settings/contractors`, `/settings/reports`). Updates `/managing-schemes` and `/utilities` redirect targets. **Does not touch**: webhooks, cron routes, portal route groups (`/contractor/*`, `/portal/*`, `/landlord/*`, `/apply/*`). No tier gate changes. User-profile buildout (security/preferences pages) deferred to BUILD_62. Estimated ~100–150 file touches. |

### Addendums

| Addendum | Parent | Status | Description |
|----------|--------|--------|-------------|
| `ADDENDUM_60A_INSURANCE_CHECKLIST.md` | BUILD_60 | 🔬 | ~30-item insurance checklist system per property with three-state items (confirmed/unknown/N/A), broker-brief PDF, annual review flow, warranty tracking (geyser/solar/appliances), integration with BUILD_59 critical incident notification. Platform-authored catalogue in v1, org customisation in v2. Separate conversation scheduled — BUILD_60 leaves hooks. |
| `ADDENDUM_61A_CONDITIONAL_RENDERING_AUDIT.md` | BUILD_61 | 🔬 | Small audit spec following the database-unified principle ("same schema, different presentation"). After BUILD_61 ships, verify every Settings page renders sensibly for landlord-type orgs: does `/settings/details` hide agency-only fields (EAAB/FFC/trust account) for landlord orgs; does Branding still make sense for a one-landlord org; does the org-vs-personal framing on `/settings/profile` read correctly for both org types. Scope is audit + conditional-render tweaks, not rebuild. Does not change schema. |

---

## 5. Infrastructure fixes (cross-cutting) ✅

Platform-level fixes that apply across every phase. Kept separate so they're not lost inside a single BUILD.

| Spec | Status | Description |
|------|--------|-------------|
| `ADDENDUM_00A_TIER_COOKIE_FIX.md` | ✅ | Tier cookie staleness fix — `maxAge: 300` in `proxy.ts`, `refetchInterval: 5min` in `useTier()`, `/api/auth/refresh-tier` endpoint |
| `ADDENDUM_00B_OPERATING_HOURS.md` | ✅ | Office hours + emergency contact on organisations — `settings/hours` page + `HoursForm` |
| `ADDENDUM_00C_SETTINGS_SIDEBAR.md` | ✅ | `SettingsSidebar` replaces main nav when `pathname.startsWith("/settings")`; mobile drill-down via `MobileSettingsNav` |

Note: there are two `ADDENDUM_00A_*` files by design — `ADDENDUM_00A_ENCRYPTION_AT_REST.md` (listed under Phase 1, part of BUILD_00 security) and `ADDENDUM_00A_TIER_COOKIE_FIX.md` (above, infrastructure layer). Same prefix, different scope.

---

## 6. Legal specs (`brief/legal/`)

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

## 7. Migrations

> File names are in `supabase/migrations/`. Structure is consolidated and domain-scoped — new features amend an existing file rather than creating a new one. See `CLAUDE.md` "HOW TO WORK WITH MIGRATIONS" for the amend-forward rule.

### Active migrations

| File | Domain | Source builds / contents |
|------|--------|--------------------------|
| `001_foundation.sql` | Foundation | BUILD_00–07 — auth, orgs, RLS, audit, consent, bank accounts, waitlist |
| `002_contacts.sql` | Contacts | BUILD_25/25S — contacts master + thin tenant/landlord tables + `communication_log` base |
| `003_properties.sql` | Properties | BUILD_02, 02A, 02B — properties, buildings, units, inspections |
| `004_leases_financials.sql` | Leases & finance | BUILD_04, 07, 08 — leases, charges, trust, payments, deposits, arrears, DebiCheck |
| `005_operations.sql` | Operations | BUILD_05, 06, 06B, 11, 12, 13 — maintenance, contractors, applications, municipal, HOA, reports, imports. BUILD_60: `property_info_requests` + `property_info_request_events`. |
| `006_seed.sql` | Seed data | BUILD_00 — reference data (prime rates, clause library, rule templates) |
| `007_enhancements.sql` | Cross-cutting | BUILD_02–07 addendums, BUILD_14–24, 27, 30, 31, 33, 35, 36, 37, 38A-C, 41, 44, 46 — unit enhancements, clause profiles, org details, branding, HOA/body corporate, rules, performance, realtime, portal access |
| `008_enhancements2.sql` | Cross-cutting 2 | BUILD_09, 10, 16, 17, 19 — bank recon, DebiCheck, applications, deposits, contractor portal |
| `009_security.sql` | Security | ADDENDUM_00A (encryption at rest) — encryption for PII, RLS hardening, WITH CHECK everywhere |
| `010_platform_features.sql` | Platform | BUILD_49 (tenant portal), BUILD_50 (bank feeds), ADDENDUM_00B (operating hours), BUILD_24 agent profile / multi-role, team member fields, custom role library, BUILD_56 (`is_admin` + ownership transfers), ADDENDUM_57F (Owner Pro per-lease billing: `premium_enabled`, `subscription_charges`), lease notes, BUILD_60 (`cron_runs` health table). 12 sections. |
| `011_documents_messaging.sql` | Documents & messaging | ADDENDUM_57E (templates, signatures, document editor: `user_signatures`, `signature_sign_tokens`, `document_templates`, `user_template_favourites`, `org_whatsapp_template_preferences`, `document_generation_jobs`, `lease_documents`, 27 system template seeds), BUILD_58 (WhatsApp: `whatsapp_messages`, `tenant_messaging_consent`, `whatsapp_cs_windows`, `messaging_usage`, `communication_log` delivery-tracking extensions), storage buckets (signatures, lease-templates, property-documents) + path-scoped RLS. 13 sections. |
| `012_property_extensions.sql` | Property extensions | ADDENDUM_57A (unit types + `unit_inspection_profiles`), ADDENDUM_57B (furnishings), BUILD_59 (insurance on `properties`, `property_brokers`, `managing_schemes`, `incident_notifications`, severity + insurance flags on `maintenance_requests`, `has_managing_scheme` trigger), inspection storage bucket, BUILD_60 (scenario_type, property_profile JSONB, managed_mode, onboarding tracking, universal questions WiFi/cell/backup power, operating hours, is_lettable + industrial unit columns, business_use_permitted). 12 sections. |

### Domain routing for new BUILDs

When a BUILD needs schema changes, amend the appropriate domain file rather than creating a new migration. Route by what the change touches:

| Change touches… | Amend | Notes |
|-----------------|-------|-------|
| property / unit / inspection / insurance / managing scheme / building | `012_property_extensions.sql` | Property-side vocabulary |
| leases / rent / deposits / arrears / trust ledger / DebiCheck / lease charges | `004_leases_financials.sql` | Lease + financial lifecycle |
| maintenance / contractors / HOA / applications / municipal bills / reports / imports | `005_operations.sql` | Day-to-day operational workflows |
| contacts / tenants / landlords / `communication_log` core fields | `002_contacts.sql` | Contacts CRM + base comms log |
| portal / subscription billing / auth / team / admin / ownership / bank feeds / tenant portal / landlord portal / cron health | `010_platform_features.sql` | Platform-level plumbing |
| documents / templates / signatures / WhatsApp / email / SMS / storage buckets + RLS | `011_documents_messaging.sql` | Anything document-, template-, or messaging-shaped |
| reference / seed data (prime rates, clause library, rule templates, system templates) | `006_seed.sql` | Idempotent `INSERT … ON CONFLICT DO NOTHING` seeds only |
| encryption / RLS hardening / `WITH CHECK` policies | `009_security.sql` | Security hardening — cross-table policy work |
| foundational tables only (`organisations`, `user_orgs`, `audit_log`, `consent_log`, waitlist) | `001_foundation.sql` | Rare. Only if adding or evolving truly foundational auth/tenancy tables. |

**Do NOT amend** `007_enhancements.sql` or `008_enhancements2.sql`. These are historical cross-cutting files preserved for replay fidelity. New work goes into the domain-scoped files (010–012) or the other domain files above.

---

## 8. AI cost model

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

## 9. Reference files

Supporting docs in `brief/build/` that aren't specs themselves.

| File | Description |
|------|-------------|
| `BUILD_DEPENDENCY_MAP.md` | Build dependency graph |
| `CLAUDE_CODE_INSTRUCTIONS.md` | Standing Claude Code instructions |
| `SEARCHWORX_PRICING_REFERENCE.md` | Searchworx per-check pricing |
| `_SUPERSEDED_ADDENDUM_37A_OWNER_VIEW.md` | Superseded owner view draft — kept for historical reference |
