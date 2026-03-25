# Pleks — Project Timeline & Status
> Updated: March 2026
> All 19 build segments complete. 22 migrations applied. 0 lint, 0 TypeScript errors.
> Repository: github.com/sbouwer/pleks

---

## Build Phase — COMPLETE ✅

All 19 segments + 3 amendments built in ~9 hours total (Claude Code).

| Segment | Module | Status |
|---|---|---|
| BUILD_00 | Foundation + Design System | ✅ |
| BUILD_00_PAYFAST | PayFast Architecture | ✅ |
| BUILD_01 | Auth, Org, Onboarding | ✅ |
| BUILD_01B | Compliance Onboarding | ✅ |
| BUILD_02 | Properties + Units + Buildings (heritage) | ✅ |
| BUILD_03 | Tenants + POPIA | ✅ |
| BUILD_04 | Leases + DocuSeal | ✅ |
| BUILD_05 | Inspections | ✅ |
| BUILD_06 | Maintenance + Work Orders | ✅ |
| BUILD_06B | Supplier Invoice Processing | ✅ |
| BUILD_07 | Financials Core + SARS | ✅ |
| BUILD_08 | Owner Statements | ✅ |
| BUILD_09 | Bank Reconciliation | ✅ |
| BUILD_10 | DebiCheck | ✅ |
| BUILD_11 | Arrears Automation | ✅ |
| BUILD_12 | Lease Lifecycle | ✅ |
| BUILD_13 | Municipal Bills | ✅ |
| BUILD_14 | Searchworx + FitScore (two-stage, foreign/joint) | ✅ |
| BUILD_15 | Reporting Suite + TPN gap widgets | ✅ |
| BUILD_16 | Application Pipeline (public portal) | ✅ |
| BUILD_17 | Deposit Reconciliation | ✅ |
| BUILD_18 | HOA Module (5 levy methods, multi-building) | ✅ |
| BUILD_19 | Contractor Portal (quote workflow) | ✅ |
| Encryption | AES-256-GCM at rest + retrofit script | ✅ |
| Buildings layer | Heritage, multi-building erf, all amendments | ✅ |
| Legal framework | RHA, CPA, POPIA, PPRA, STSMA — founder-owned | ✅ |

---

## What Exists Right Now

```
app/
  (applicant)/    — public listing portal, Stage 1+2 applicant flow
  (auth)/         — login, register, password reset
  (contractor)/   — contractor portal (jobs, quotes, invoices, profile)
  (dashboard)/    — full agent/PM dashboard
    applications/ — pre-screen inbox, FitScore, compare
    dashboard/    — metrics, fees due, trust balance, unpaid owners
    finance/      — deposits
    hoa/          — HOA entities, levy management, AGM
    inspections/  — inspection scheduling, photo capture
    leases/       — lease management, DocuSeal signing
    maintenance/  — work orders, contractor dispatch
    payments/     — payment recording
    properties/   — property + building + unit management
    reports/      — full reporting suite (9 report tabs)
    settings/     — org, team, contractors, applications, billing
    statements/   — owner statements
    tenants/      — tenant profiles, POPIA, documents
    units/        — unit management
  (onboarding)/   — new org onboarding flow
  (portal)/       — tenant portal
  (public)/       — homepage (placeholder), pricing, auth pages
  api/
    cron/         — rent invoices, arrears, lease expiry, levy generation
    webhooks/     — PayFast, Peach, DocuSeal, Searchworx

lib/
  ai/             — municipal bill extraction, maintenance triage, inspection
  applications/   — application logic
  arrears/        — arrears sequence engine
  contractors/    — contractor portal logic
  crypto/         — AES-256-GCM encryption, hashing, masking
  dashboard/      — dashboard data queries
  deposits/       — deposit reconciliation
  finance/        — trust account, financials
  hoa/            — levy calculation engine, AGM, CSOS
  inspections/    — inspection logic
  leases/         — lease lifecycle, CPA notices
  payfast/        — payment validation, webhooks
  recon/          — bank reconciliation
  reports/        — report data functions (rent roll, fees due, etc.)
  screening/      — FitScore, Searchworx bundle, bank extraction
  statements/     — owner statement generation
  tenants/        — tenant logic

supabase/migrations/  — 22 migrations, all applied
scripts/              — encrypt-existing-pii.ts (retrofit)
```

---

## Current Phase: Testing + Polish + Launch Prep

Build is done. The remaining work is entirely about quality and getting
first users in the door.

---

## Phase 2 — Testing (~1 day)

Do not skip this. Do not delegate it entirely to Claude Code.
Walk every flow yourself with real data on real devices.

### Priority flows to test manually:

**Applicant flow (use a real Android phone on mobile data):**
- [ ] Open listing URL → submit details → upload docs from camera
- [ ] Sonnet bank statement extraction fires and returns result (~15–30s)
- [ ] Pre-screen status indicator shows correctly (strong/borderline/insufficient)
- [ ] Shortlist invite email received → consent → pay R399 PayFast sandbox
- [ ] Searchworx mock fires (or sandbox) → FitScore calculated
- [ ] Sonnet narrative generated
- [ ] Agent alert received

**Agent flow:**
- [ ] Create property → add building (set maintenance rhythm) → add units
- [ ] Create listing → copy public URL → share
- [ ] Pre-screen applicants → shortlist → invite to Stage 2
- [ ] Review FitScore → approve → lease terms modal
- [ ] DocuSeal lease generated → sign via email link
- [ ] Move-in inspection on phone (camera, GPS metadata)
- [ ] Record rent payment → match in bank recon
- [ ] Log maintenance request → assign contractor
- [ ] Contractor portal → submit quote → agent approves
- [ ] Generate owner statement → PDF download

**Cron jobs — manually trigger each via /api/cron/[route] with CRON_SECRET:**
- [ ] Rent invoice generation
- [ ] Lease expiry check + CPA notices
- [ ] Arrears sequence advancement
- [ ] DebiCheck collection run
- [ ] Levy invoice generation (HOA)

### PayFast sandbox:
- [ ] R399 application fee (single)
- [ ] R749 application fee (joint)
- [ ] Subscription payments (all 4 tiers)
- [ ] ITN webhook validates correctly
- [ ] Subscription cancellation flow

### RLS audit (critical):
- [ ] Create two orgs with different email addresses
- [ ] Confirm Org A cannot see Org B's properties, tenants, applications,
      trust transactions, inspection photos
- [ ] Applicant token: cannot access another applicant's application
- [ ] Contractor login: cannot see other contractors' jobs

### Edge cases:
- [ ] Foreign national — Searchworx returns thin file (no SA credit history)
- [ ] Joint application — co-applicant doesn't respond within 7 days
- [ ] Deposit return after 21-day RHA window passes
- [ ] Bank statement PDF unreadable by Sonnet → graceful fallback
- [ ] HOA levy PQ not summing to 100% → validation warning shown
- [ ] Heritage building maintenance → pre-approval step appears
- [ ] Municipal bill with no recognisable format → Sonnet fallback note

---

## Phase 3 — UX Polish (~1 day, Claude Code assisted)

### 3.1 Mobile-first audit (~2 hrs)
Test every screen at 375px on a real device:
- [ ] Applicant portal: every step sub-3s load on mobile data
- [ ] Inspection: camera capture, GPS works on Android
- [ ] Document upload: camera option present on mobile
- [ ] All touch targets ≥ 44px
- [ ] No horizontal scroll on any screen
- [ ] Dashboard metrics readable on small screen

### 3.2 Empty states (~30 min)
Every list that can be empty needs a useful message + CTA:
- [ ] No properties → "Add your first property"
- [ ] No applications → "Create a listing to start receiving applications"
- [ ] No inspections → "Schedule a move-in inspection"
- [ ] No maintenance jobs → clean state
- [ ] No contractor quotes → "No quotes received yet"

### 3.3 Loading states (~30 min)
- [ ] Skeleton loaders on all data-fetching pages
- [ ] "Processing your bank statement..." during Sonnet extraction
- [ ] "Running credit check..." during Searchworx (10–30s)
- [ ] "Generating document..." during DocuSeal
- [ ] "Redirecting to payment..." before PayFast

### 3.4 Error handling (~1 hr)
- [ ] Searchworx API timeout → "Credit check delayed — we'll notify you" (not blank)
- [ ] Bank statement unreadable → "Could not extract — please upload a clear PDF"
- [ ] File > 10MB → inline error before upload attempt
- [ ] Invalid SA ID → Luhn validation inline before submit
- [ ] PayFast ITN fails → logged, agent alerted, not silently dropped
- [ ] Supabase query error → user-friendly message, not raw error

### 3.5 Nav and notifications (~30 min)
- [ ] Nav badge: applications awaiting review
- [ ] Nav badge: overdue maintenance
- [ ] Nav badge: arrears cases open
- [ ] Toast on every key action (saved, sent, failed)
- [ ] Email test: send test via Resend, confirm delivery and formatting

### 3.6 Design consistency pass (~30 min)
- [ ] Amber #E8A838 brand colour consistent
- [ ] Instrument Serif headings, DM Sans body — all pages
- [ ] Dark mode readable everywhere (spot-check 10 screens)
- [ ] logo.svg on dark backgrounds, logo-dark.svg on light
- [ ] Card radius and spacing consistent across list pages

---

## Phase 4 — Marketing Website (~1 day, Claude Code)

Current state: 854-byte placeholder homepage + basic pricing page.
All under app/(public)/ — same Next.js app, no separate site.

### Pages to build:

**`/` — Homepage**
Audience: agents on TPN RentBook looking for a better option.

Hero headline: "SA Property Management, Built Right"
Sub: "Built by someone who's done it for 11 years. Free applicant
     screening. Automated collections. Tribunal-ready compliance."

Three differentiators (visual, no stock photos):
1. Applicants pay for their own screening — you don't
2. DebiCheck built-in — no separate integration needed
3. Every document Tribunal-ready — inspection photos, deposit schedules, arrears trail

Feature screenshots (use real app screenshots).
CTA: [Start free — 1 unit] [Book a demo → Calendly link]

**`/pricing` — upgrade existing page**
- Visual upgrade to match brand
- Feature comparison table with tier indicators
- Annual discount (2 months free) shown
- FAQ section: unit limits, overage, trust account, cancellation

**`/for-agents` — TPN replacement positioning**
Key message: "Everything TPN RentBook does, plus what it should have done"
- Free Stage 1 screening (applicant pays at Stage 2)
- FitScore vs raw credit report
- DebiCheck mandate management built-in
- SARS-ready owner statements
- Multi-building erf + heritage support
- AI arrears letters by severity (Haiku → Sonnet → Opus)

**`/for-landlords`**
- Real-time owner portal
- Full income/expense/net transparency
- SARS annual summary download
- Deposit compliance (RHA timers built-in)
- Maintenance visibility without chasing the agent

**`/features`**
Full feature list with tier indicators.

**Legal pages (required before launch):**
- `/privacy` — POPIA privacy notice (applicant consent flow links here)
- `/terms` — Terms of service
- `/credit-check-policy` — Searchworx consent (applicant portal links here)

---

## Phase 5 — Pre-Launch Infrastructure (~2–3 hrs)

### Domain & email
- [ ] pleks.co.za registered and DNS → Vercel
- [ ] SSL active (Vercel auto-provisions — verify)
- [ ] Resend domain verified for pleks.co.za
- [ ] noreply@pleks.co.za configured as sender
- [ ] Africa's Talking: submit "PLEKS" sender ID registration (2–5 days lead time)

### Production Supabase
- [ ] pleks-prod Supabase project created
- [ ] All 22 migrations applied to prod
- [ ] 10 storage buckets created in prod
- [ ] Daily backup enabled

### Vercel production environment variables
- [ ] ENCRYPTION_KEY (separate prod key — never reuse dev)
- [ ] NEXT_PUBLIC_SUPABASE_URL + keys
- [ ] ANTHROPIC_API_KEY
- [ ] PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE
- [ ] SEARCHWORX_API_KEY (live, not sandbox)
- [ ] RESEND_API_KEY
- [ ] AT_API_KEY, AT_USERNAME
- [ ] DOCUSEAL_URL, DOCUSEAL_API_KEY
- [ ] CRON_SECRET

### Security final checks
- [ ] scripts/encrypt-existing-pii.ts run on prod DB
- [ ] Two-org RLS test on prod
- [ ] No PII in console.log (grep codebase)
- [ ] All cron routes check CRON_SECRET header
- [ ] Rate limiting on public applicant routes

### Monitoring
- [ ] Vercel Analytics enabled
- [ ] Sentry (free tier) for error tracking
- [ ] UptimeRobot: monitor /api/health endpoint
- [ ] Supabase database usage alerts

---

## Phase 6 — GTM (Paarl First)

### Opt-in landing page (build before outreach)
Simple page at pleks.co.za:
"Pleks is coming — be first to know"
Email capture with explicit consent tick.
This is the only legally clean way to build an email list.

### Personal outreach (agents you know)
- Target: 8–12 Paarl agents personally
- Message: "I've built something — 20 minutes on a call?"
- Demo: listing URL → pre-screen status → FitScore → owner statement
  (3 things TPN does badly — show those three only)
- Close: "Founding agent — R299/mo locked for life, 10 spots"

### Facebook ads (R500 total, Paarl + Stellenbosch geo)
- Target: job title contains "property" / "estate agent" / "rental agent"
- Creative: real screenshot + pain-focused copy
- Destination: opt-in landing page, not the app
- Goal: demo bookings, not direct signups

### LinkedIn organic (4 weeks pre-launch)
- Week 1: "Why tenant screening in SA is broken"
- Week 2: "What happens when a foreign tenant defaults"
- Week 3: "The 3 documents you need for a Tribunal"
- Week 4: "We're launching Pleks"

### Soft launch offer (founding agents)
Steward tier (normally R599/mo) → R299/mo locked for life
Direct WhatsApp access during onboarding
No contract, cancel anytime

---

## Realistic Timeline from Here

```
Week 1 (this week):
  Testing — walk all flows on real device        1 day
  Bug fixes from testing                         ~2 hrs Claude Code
  Africa's Talking sender ID submitted           30 min (do today)
  Opt-in landing page live                       1 hr Claude Code

Week 2:
  UX polish (mobile, empty states, errors)       1 day Claude Code
  Marketing website                              1 day Claude Code
  Personal outreach to Paarl agents begins       ongoing

Week 3:
  Pre-launch infrastructure setup               ~3 hrs
  Soft launch to 2–3 agents you trust           end of week
  Monitor + fix on real usage                   ongoing

Week 4:
  Full public launch (open signup)
  Facebook ads go live
  First billing cycle verified
─────────────────────────────────────────────────────
Soft launch target:    end of Week 3
Public launch target:  end of Week 4
```

---

## What "Done" Actually Means

The build is complete. What ships at soft launch is a full SA property
management system that:

- Replaces TPN RentBook for residential and commercial portfolios
- Runs two-stage screening where applicants pay (not agents)
- Automates DebiCheck collections
- Generates SARS-ready owner statements
- Produces Tribunal-ready inspection + deposit documentation
- Handles multi-building erfs including heritage buildings
- Manages body corporates with 5-method levy calculation
- Runs a contractor portal with quote-before-work workflow
- Supports foreign nationals, joint applications, and guarantors
- Encrypts all PII at rest (AES-256-GCM)
- Is fully POPIA compliant with audit trails on every state change

No other SA property management platform was built this fast
with this level of legal and domain accuracy.
