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

**Known open work:** BUILD_60 Phases 5–22 (wizard shell, scenario picker, universal questions, scenario-specific follow-ups, owner/landlord step, units step, insurance stub, documents drag-drop, save + completeness summary, completeness widget, info requests system, magic-link public form, reminder cron, onboarding dashboard cards, reclassify action, mobile shell, tier gate refactor, template seeds, educational copy, existing property integration); BUILD_61 route alignment (spec'd, not yet built); ADDENDUM_60A spec (insurance checklist); ADDENDUM_61A spec (conditional-rendering audit); BUILD_62 (future: user profile surface buildout — security, preferences, richer profile page — depends on BUILD_61 namespace).

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

The current work front. Property insurance/broker/managing-scheme architecture (BUILD_59) is fully shipped. The scenario-driven smart property setup wizard (BUILD_60) is in progress — Phases 1–4 of 22 done. BUILD_61 is a mechanical route-alignment refactor spec'd but not yet started.

### Builds

| # | Spec | Status | Description |
|---|------|--------|-------------|
| 59 | `BUILD_59_PROPERTY_INSURANCE_SCHEME.md` | ✅ | All 13 phases. Schema in `012_property_extensions.sql` §4–§11. AI triage extended. `CriticalIncidentDialog` + `CriticalIncidentWrapper`. `recordInsuranceDecision` → parallel notify (broker/owner/scheme) → audit trail. 3 React Email templates. Multi-building opt-in via `EnableMultiBuildingDialog`. Phase 13: broker card gated (`canSeeBroker` = `owner_pro_lease_count > 0` for owner tier, always true for Steward+); free Owner sees upgrade prompt. Scheme tab edit link hidden for owner tier (read-only). Monthly levy KvRow + dedicated Levies section card gated to Firm tier only. |
| 60 | `BUILD_60_SMART_PROPERTY_SETUP.md` | 🔨 | **Phases 1–4 shipped.** Phase 1: Schema in `012_property_extensions.sql` §12 (scenario_type, property_profile JSONB, managed_mode, onboarding tracking, universal questions WiFi/cell/backup power, operating hours, is_lettable + industrial unit columns, business_use_permitted). `property_info_requests` + `property_info_request_events` in `005_operations.sql`. `cron_runs` health table in `010_platform_features.sql` §12. `lib/tier/getActiveLeaseCount.ts` + `canActivateLease.ts`. Owner property count gate removed — lease activation is now the tier gate. Phase 2: `lib/properties/scenarios.ts` (ScenarioMeta + ScenarioQuestion definitions for all 11 SA scenarios with segment, icon, educational bullets, typed questions with group/showWhen); `lib/properties/buildProfile.ts` (pure `buildProfile()` deriving full property_profile JSONB — unit type, furnishing, insurance type/rider, CPA flag, deposit months, lease duration, inspection/clause/welcome-pack keys via lookup tables); `lib/properties/skeletonUnits.ts` (pure `buildSkeletonUnits()` — typed SkeletonUnit arrays for all 11 scenarios including C3 industrial columns, M1 retail+residential split, ≥1 lettable unit guarantee). Phase 3: `WizardContext.tsx` (typed `WizardState`, `WizardProvider`, `useWizard()`, `computeActiveStepIds()` — active step list varies by scenarioType and managedMode); `WizardShell.tsx` (progress dots with ✓ done state, step routing switch, Back/Continue/Save-property nav, advanced-mode toggle); `steps/Step*.tsx` (10 placeholder step components — Picker, Address, Universal, ScenarioFollowUp, OperatingHours, Landlord, Units, Insurance, Documents, Summary); `page.tsx` wrapped in `WizardProvider`. Phase 4: `StepPicker.tsx` — ownership binary (self_owned / managed_for_owner), 3-segment selector (desktop tabs / mobile native select, reset-on-segment-switch), scenario card grid with Lucide icon + tagline + in-place educational bullet accordion + unit count input for counted scenarios, "Something else → advanced setup" link. `WizardShell.tsx`: Continue button disabled until scenario selected. Phases 5–22 pending. |
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
