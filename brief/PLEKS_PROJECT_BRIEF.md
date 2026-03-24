# Pleks — Project Brief
> South African Property Management Platform
> Platform name: Pleks (pleks.co.za) — confirmed D-027
> Version: 1.0 — Architecture Phase
> Built by the same developer as Yoros and Life-Therapy platforms

---

## What This Project Is

Pleks is a South African property management platform built to compete directly with TPN RentBook and WeconnectU/Red Rabbit. The goal is to be meaningfully smarter, faster, and cheaper — a ground-up rethink of how property management software should work in the South African context.

The founder has extensive real-world SA property management experience. All architectural decisions are domain-informed. Claude Code must not simplify decisions that exist for legal or compliance reasons.

Architecture: `PLEKS_ARCHITECTURE.md`
Build segments: `build/` folder

---

## The Problem Being Solved

- **Inspections** are never done properly — reports don't compare correctly, miss legal nuances (wear & tear vs damage, 7-day dispute window, joint exit requirement), no Tribunal-ready documentation
- **Applications** are fragmented — credit checks, document collection, and landlord review across 3+ systems
- **Bank reconciliation** is manual — matching EFT payments to tenants is tedious and error-prone
- **Lease lifecycle** is unmanaged — escalations, expiry notices, CPA-compliant auto-renewals tracked on spreadsheets
- **Deposit disputes** are common — no system creates a legally defensible end-to-end audit trail

---

## Subscription Tiers

| Tier | Monthly | Annual | Units | Users | HOA |
|---|---|---|---|---|---|
| Owner | Free | Free | 1 | 1 | No |
| Steward | R599 | R5,750 | 10 | 2 | No |
| Portfolio | R999 | R9,590 | 30 | 5 | No |
| Firm | R2,499 | R23,990 | Unlimited | Unlimited | Yes |

Billing metric: active lettable units (not properties — properties unlimited at all tiers).
Overage: R35/unit/month above limit. No hard block.
Feature gating: build everything once, DB has all columns, tier controls access via middleware.

---

## Tech Stack (Locked)

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** Supabase (Postgres + RLS + Auth + Storage + Realtime + Edge Functions)
- **Payments:** Peach Payments (DebiCheck + EFT) + PayFast (application fees + subscriptions)
- **Email:** Resend + React Email
- **SMS:** Africa's Talking / Clickatell fallback
- **Signing:** DocuSeal (self-hosted, Docker, ~R150/mo VPS)
- **AI:** Anthropic API — Haiku 4.5 / Sonnet 4.6 / Opus 4.6 (routed by task)
- **Data:** Searchworx.co.za (credit bureau, Lightstone AVM, Deeds Office)
- **Hosting:** Vercel + Supabase Cloud

---

## SA Legal Framework (Apply to Every Decision)

- **Rental Housing Act 50 of 1999** — deposit rules, inspection requirements, tenant rights
- **Consumer Protection Act 68 of 2008** — auto-renewal notice (s14: 20 business days)
- **POPIA** — explicit consent before credit checks, encrypted storage, 12-month retention, full audit trail
- **Estate Agency Affairs Act + EAAB** — trust account separation non-negotiable
- **Rental Housing Tribunal** — all inspection + deposit workflows must produce Tribunal-ready docs
- **Wear & tear vs damage** — cannot deduct normal wear from deposit; every item justified separately
- **Deposit return: 14 days** (no damage) / **21 days** (damage claimed) — itemised schedule required
- **DebiCheck/NAEDO** — SA-specific mandate requirements

Never give generic international answers. If something works differently in SA, say so explicitly.

---

## Non-Negotiables for Claude Code

- `org_id` on every database table (RLS enforcement)
- `audit_log` table — every state change logged immutably (no UPDATE/DELETE ever)
- `consent_log` table — every POPIA consent + trust account acknowledgement
- Trust account and business account separated in schema from day 1
- Inspection photos store original GPS + timestamp — never compressed copies only
- FitScore shows ALL applicants regardless of score — legal protection
- Searchworx Phase 1 manual trigger = identical UX to Phase 2 API — no rewrite on go-live
- Feature gating: locked features show upgrade CTA — never hidden from UI

---

## AI Task Routing

- **Haiku 4.5:** bulk/structured tasks — classification, triage, SMS copy, completeness checks
- **Sonnet 4.6:** legal-quality output — FitScore summary, wear & tear assessment, lease drafting, arrears comms, municipal bill extraction
- **Opus 4.6:** high-stakes rare docs (Firm tier only) — Tribunal submissions, Section 4 notices, dispute letters
- **Prompt cache always:** lease system prompt, wear & tear table, FitScore rubric, bank statement guide

---

## Key Integrations

**Searchworx (searchworx.co.za)**
- Founder has existing account. Per-check billing.
- Credit bureau checks, Lightstone AVM, Deeds Office lookups
- Phase 1: manual trigger + PDF upload (identical UX to Phase 2)
- Phase 2: API (access being requested — sandbox required before build)
- POPIA: consent_token from consent_log required with every check

**PayFast**
- Single Pleks merchant account — all fees to Pleks directly
- Application fees: R199 one-time per applicant (standard redirect + ITN webhook)
- Platform subscriptions: R599/R999/R2,499/month via PayFast Subscriptions (tokenized recurring)
- No sub-merchant / split payment needed at Phase 1-3
- See: `build/BUILD_00_PAYFAST_ARCHITECTURE.md`

**Peach Payments**
- DebiCheck mandate created at lease signing
- Mandate amended automatically on rent escalation
- Monthly collection run via edge function

**DocuSeal (self-hosted)**
- Docker on Hetzner SA VPS (~R150/mo)
- Signed PDFs stored in Supabase Storage under RLS
- Zero per-signature cost. Full data sovereignty.

---

## Scope Exclusions

- Not a property listing portal (integrate with Private Property/Property24, don't compete)
- Not a full accounting system (property financials only; export to Xero/Sage)
- Not a short-term/Airbnb platform (long-term leases only)
- Not a construction project management tool

---

## Naming

Platform: **Pleks** — SA slang for places/properties (plek = Afrikaans for place).
Domain: pleks.co.za / pleks.app
Repo: pleks

---

## Decision Log Reference

Full decision log in `PLEKS_ARCHITECTURE.md` Section 13.
29 decisions confirmed (D-001 through D-029).
All HIGH priority open decisions resolved. Claude Code can start.
Only remaining open item: O-007 Searchworx API timeline (non-blocking for Phase 1).
