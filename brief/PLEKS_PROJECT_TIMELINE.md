# Pleks — Project Timeline & Remaining Work
> Updated: March 2026
> Basis: BUILD_00–BUILD_15 completed in ~6 hours (Claude Code with full spec)
> Legal status: COMPLETE — founder has 11 years domain experience + R40k+ in
> prior legal costs (body corporate rules, lease templates, full RHA/POPIA/CPA
> process). No external attorney review required before launch.

---

## Completed

| Phase | Scope | Status |
|---|---|---|
| Architecture & Spec | All 19 build segments + 8 addenda (868KB) | ✅ Done |
| Legal framework | RHA, CPA, POPIA, PPRA, STSMA — founder-owned expertise | ✅ Done |
| BUILD_00–11 | Foundation, auth, properties, tenants, leases, inspections, maintenance, financials, bank recon, DebiCheck, arrears | ✅ Done |
| Buildings layer amendments | Multi-building erf, heritage support | ✅ Done |
| BUILD_12–13 | Lease lifecycle, municipal bills | ✅ Done |
| BUILD_14 | Two-stage screening, FitScore, Searchworx, joint/foreign | ✅ Done |
| BUILD_15 | Reporting suite (dashboard widgets TBC) | ✅ Done |
| Encryption module | AES-256-GCM at rest, retrofit script | ✅ Done |

---

## Remaining Build Segments (~3 hrs)

| Segment | Scope | Est. |
|---|---|---|
| BUILD_15 finish | Fees Due widget, Trust balance, Unpaid Owners badge on dashboard | 20 min |
| BUILD_16 | Application pipeline — public listing portal, agent inbox, approval flow | 45 min |
| BUILD_17 | Deposit recon — RHA timers, Tribunal PDF, deduction schedule | 45 min |
| BUILD_18 | HOA module — levy engine (5 methods), AGM, reserve fund, CSOS | 45 min |
| BUILD_19 | Contractor portal — quote workflow, portal login, invoice submission | 30 min |

---

## Phase 2 — Testing (~1 day)

Cannot be fully delegated to Claude Code.
Someone needs to walk every flow with real data on real devices.

### 2.1 Critical User Journeys (~3 hrs)

**Applicant flow (do this on a real Android phone on mobile data):**
- Open listing URL → submit details → upload docs from camera
- Verify Sonnet bank statement extraction fires (~30s)
- Verify pre-screen status indicator: strong / borderline / insufficient
- Receive shortlist invite → consent → pay R399 (PayFast sandbox)
- Verify Searchworx webhook / mock fires → FitScore calculated
- Verify agent alert received

**Agent flow:**
- Create property → listing → share URL
- Pre-screen applicants → shortlist → invite to Stage 2
- Review full FitScore → approve → lease terms modal
- DocuSeal lease signing
- Move-in inspection on phone (PWA, offline capable)
- Record rent payment → bank recon match
- Log maintenance → assign contractor
- Generate owner statement

**Cron jobs — manually trigger each:**
- Rent invoice generation
- Lease expiry check + CPA notices
- Arrears sequence advancement
- DebiCheck collection run
- Municipal bill allocation

### 2.2 PayFast Sandbox (~30 min)
- R399 single application fee
- R749 joint application fee
- All 4 subscription tiers
- ITN webhook validation
- Refund flow

### 2.3 RLS Audit (~30 min)
Create two separate test orgs. Confirm Org A cannot see Org B's:
- Properties, units, tenants, leases
- Applications and FitScore data
- Trust transactions
- Inspection photos (signed URLs expire correctly)

### 2.4 Edge Cases (~1 hr)
- Foreign national — thin file from Searchworx (no SA credit history)
- Joint application where co-applicant doesn't respond within 7 days
- Deposit return after 21-day RHA window passes
- DebiCheck mandate rejection
- Municipal bill in unrecognised format (Sonnet fallback)
- Heritage building maintenance — pre-approval workflow
- HOA levy PQ not summing to exactly 100% (validation warning)
- Lease expiry on a Sunday (CPA notice timing)

---

## Phase 3 — UX Polish (~1 day)

### 3.1 Mobile-First Audit (~2 hrs)
Priority screens — test at 375px on real device:
- Applicant portal: every step sub-3s on 3G
- Inspection photo upload: camera capture works
- Maintenance request: photo upload from phone
- Document upload: all file types, camera option
- Dashboard: readable on small screen
- All touch targets: minimum 44px

### 3.2 Loading & Empty States (~1 hr)
Every data-fetching page needs a skeleton loader.
Every list that can be empty needs a useful empty state with CTA.
Key loading states:
- "Processing your bank statement..." (Sonnet, 5–15s)
- "Running credit check..." (Searchworx, 10–30s)
- "Redirecting to payment..." (PayFast)
- "Generating document..." (DocuSeal)

### 3.3 Error Handling (~1 hr)
- Searchworx timeout → "Credit check delayed — agent notified" (not blank screen)
- Bank statement unreadable → "Could not extract income — please re-upload clear PDF"
- File too large (>10MB) → inline error before upload attempt
- Invalid SA ID → inline Luhn validation before form submit
- PayFast ITN validation failure → log + alert, don't silently fail
- DebiCheck rejection → arrears case auto-opened with reason

### 3.4 Design Consistency (~1 hr)
- Amber #E8A838 brand colour consistent throughout
- Instrument Serif for headings, DM Sans for body — verify all pages
- Dark mode readable everywhere (CSS variables — spot check 10 screens)
- Logo: logo.svg (dark/navy backgrounds), logo-dark.svg (light backgrounds)
- Table and card layouts consistent across all list pages
- Toast notifications on all key actions (save, send, error)
- Nav badges: applications needing review, overdue maintenance, arrears alerts

---

## Phase 4 — Marketing Website (~1 day)

Current state: placeholder homepage (logo + tagline + 2 buttons), basic pricing page.

### Pages to build:

**Homepage (`/`)**
Primary audience: agents currently on TPN RentBook looking for a better option.

Hero:
  Headline: "SA Property Management That Actually Works"
  Sub: "Free applicant screening. Automated collections. Legal-grade compliance.
       Built by someone who's done it for 11 years."
  CTA: [Start free — 1 unit] [Book a demo]

Three core differentiators (visual):
  1. Applicants pay for their own screening — you don't
  2. DebiCheck built-in — no separate integration
  3. Tribunal-ready documentation — always

Feature highlights (screenshot-driven once app is built):
  - FitScore vs raw credit report
  - Inspection PWA (works offline on site)
  - One-click owner statements
  - AI arrears letters (Haiku/Sonnet/Opus by severity)

**Pricing (`/pricing`)**
Already exists — needs:
  - Visual upgrade to match brand
  - Feature comparison table (what each tier gets)
  - FAQ: unit limits, overage pricing, what "trust account" means
  - Annual discount shown (2 months free)

**For Agents (`/for-agents`)**
TPN replacement positioning:
  - "Everything TPN RentBook does, plus what it should have done"
  - Free Stage 1 screening (applicants pay at Stage 2 — you never pay for a check)
  - FitScore (not just a credit score — income ratio, TPN history, employment)
  - DebiCheck mandate management built-in
  - SARS-ready financials (owner statements + annual summary)
  - Multi-building erf support (heritage + new build)

**For Landlords (`/for-landlords`)**
  - Real-time owner portal
  - See every rand: rent received, expenses deducted, net to you
  - SARS annual summary
  - RHA deposit compliance built-in
  - Maintenance visibility without chasing the agent

**Features (`/features`)**
  Full feature list with tier indicators.
  Anchor links for deep-linking from other pages.

**Legal pages (required before launch):**
  `/privacy` — POPIA privacy notice (the applicant consent flow references this)
  `/terms` — Terms of service
  `/credit-check-policy` — Searchworx consent policy (linked from applicant portal)

### Marketing site approach:
Same Next.js app under `app/(public)/`.
No separate marketing site. Simpler deploys.

---

## Phase 5 — Pre-Launch Infrastructure (~2 hrs)

### Domain & Hosting
- [ ] Register pleks.co.za (if not done)
- [ ] DNS pointing to Vercel
- [ ] SSL active (Vercel auto-provisions)
- [ ] pleks.co.za email routing (at minimum info@ and noreply@)

### Production Environment
- [ ] Supabase pleks-prod project created
- [ ] All 19 migrations applied to prod
- [ ] Production ENCRYPTION_KEY generated and stored:
  - Vercel environment variables (Production only)
  - Password manager (never git)
- [ ] All prod env vars set in Vercel:
  SEARCHWORX_API_KEY, PAYFAST_MERCHANT_ID/KEY/PASSPHRASE,
  RESEND_API_KEY, AT_API_KEY/USERNAME, ANTHROPIC_API_KEY,
  DOCUSEAL_URL/API_KEY, CRON_SECRET, ENCRYPTION_KEY
- [ ] Resend domain verified (send from noreply@pleks.co.za)
- [ ] Africa's Talking sender ID "PLEKS" registered (2–5 day process)
- [ ] Supabase storage buckets: all 10 created in prod
- [ ] Supabase daily backup enabled

### Security final checks
- [ ] RLS verified on all tables (two-org test)
- [ ] All cron routes check CRON_SECRET header
- [ ] No plaintext PII in console.log (grep check)
- [ ] scripts/encrypt-existing-pii.ts run on prod
- [ ] Rate limiting on public routes (applicant portal, webhook endpoints)

### Monitoring
- [ ] Vercel Analytics enabled
- [ ] Error monitoring (Sentry free tier)
- [ ] Supabase database usage alerts
- [ ] Uptime monitor (UptimeRobot free tier — monitor /api/health)

---

## Realistic Timeline

```
Current state:          BUILD_00–15 done, encryption done
                        Legal framework: done (11 years + R40k prior work)

Week 1 (this week):
  BUILD_16–19           ~3 hrs Claude Code
  BUILD_15 widget finish ~20 min
  Encryption script run  ~30 min

Week 2:
  Full flow testing      1 day (manual on real devices)
  Bug fixes              ~2 hrs Claude Code
  Edge case testing      ~2 hrs

Week 3:
  UX polish              1 day (Claude Code + manual review)
  Marketing website      1 day (Claude Code)

Week 4:
  Pre-launch infra       ~2 hrs
  Africa's Talking       submit sender ID early (5-day lead time)
  Soft launch            2–3 known agents on prod
  Monitor + fix          ongoing

Week 5–6:
  Full public launch     open signup on pricing page
  First billing cycle    verify PayFast subscription flow
─────────────────────────────────────────────────
Go-live target:         4 weeks from today
Soft launch target:     2 weeks from today
```

---

## Soft Launch Strategy

Don't wait for perfection. Launch with 2–3 agents you know:

**What they can do at soft launch (BUILD_00–15):**
- Full property/unit/tenant/lease management
- Inspections with photos
- Maintenance work orders
- Bank reconciliation
- Owner statements
- Arrears automation
- Municipal bill allocation
- Credit screening (Stage 1 + Stage 2 with Searchworx)

**What comes after (BUILD_16–19):**
- Public listing portal (applicants apply via URL)
- Formal deposit reconciliation
- HOA/body corporate management
- Contractor portal (quote workflow)

Soft launch agents test BUILD_00–15 in production.
BUILD_16–19 deploys on top without breaking anything.
This is the right phased approach — real feedback before final builds.
