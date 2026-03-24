# Pleks — Architecture Reference
> South African Property Management Platform
> Platform name: Pleks (pleks.co.za) — confirmed D-027
> This is a quick-reference summary. Full spec: propflow/PLEKS_ARCHITECTURE.md

---

## Quick Reference: All Confirmed Decisions

| # | Decision | Detail |
|---|---|---|
| D-001 | Stack | Next.js 14, Supabase, Tailwind, shadcn/ui, Peach Payments, PayFast, Resend, Africa's Talking, DocuSeal (self-hosted), Anthropic API |
| D-002 | Multi-tenancy | Organisation = top-level tenant. org_id on every table. RLS enforces isolation. |
| D-003 | Application fee | R199 to applicant via PayFast. Covers Searchworx + AI costs. Net margin to platform. |
| D-004 | Searchworx billing | Per-check. Cost absorbed by application fee. Landlord/agent sees screening as free. |
| D-005 | Searchworx Phase 1 | Manual trigger + PDF upload. Identical UX to Phase 2 API. No rewrite on go-live. |
| D-006 | FitScore visibility | All applicants shown regardless of score. Legal protection against discrimination claims. |
| D-007 | Inspections = flagship | Primary differentiator. Treat as flagship, not standard module. |
| D-008 | AI routing | Haiku: bulk. Sonnet: legal-quality. Opus: high-stakes rare (Firm only). |
| D-009 | Prompt caching | Lease prompt, wear & tear table, FitScore rubric, bank statement guide. Always cached. |
| D-010 | Trust account separation | Separated in schema from day 1. Non-negotiable. Cannot be retrofitted. |
| D-011 | Inspection photos | Original GPS + timestamp in Supabase Storage. Compressed copies optional, never sole copy. |
| D-012 | Deposit timelines | Residential: 7/14/21-day statutory timers. Commercial: per lease agreement. Both start automatically from lease_end_date when residential. |
| D-013 | DebiCheck lifecycle | Mandate created at lease signing. Auto-amended on escalation. Peach Payments. |
| D-014 | Bank recon matching | Exact ref → fuzzy amount+date → Claude Haiku → manual. Order enforced. |
| D-015 | PWA over native | PWA with offline, push, camera, GPS. Native app Phase 4 if PWA insufficient. |
| D-016 | Scope exclusions | Not building: listing portal, full accounting, Airbnb/short-term, construction PM. |
| D-017 | Pricing structure | 4 flat tiers. Billing = active lettable units. Owner/Steward/Portfolio/Firm. No onboarding fees. |
| D-018 | vs WeconnectU | WCU = R10,000+/mo. Pleks Firm = R2,499/mo. Portfolio saves ~R1,000/mo vs WCU at 30 units. |
| D-019 | Owner tier strategy | 1 unit, free, viral acquisition. |
| D-020 | HOA gating | HOA/body corporate/sectional title = Firm only. |
| D-021 | Unit overage | R35/unit/month above limit. No hard block. Auto-prompt at 43+ units on Portfolio. |
| D-022 | Pricing rationale | Not giving it away. R599/R999/R2,499 reflects real value vs R10,000+ competition. |
| D-023 | Tier names | Owner / Steward / Portfolio / Firm. |
| D-024 | GTM: restrict downwards | Build once. DB all columns. Tier = subscriptions row. Zero code change on upgrade. |
| D-025 | Deposit onboarding — REVISED | Trust account + lease type determine feature access. Residential without trust account: BLOCKED on legal-grade deposit documents (Pleks liability). Commercial without trust account: BLOCKED (PPRA obligation still applies to practitioners). Owner tier residential: notice + consent_log only (personal landlord, not PPRA-regulated). See deposit matrix below and LEGAL_NOTE_PLATFORM_LIABILITY.md |
| D-026 | Onboarding: receivables | Total monthly rental income required at setup. Also ask: what type of property? (residential / commercial / mixed) — drives compliance regime defaults. |
| D-027 | Product name | Pleks. pleks.co.za. SA slang for places/properties. |
| D-028 | DocuSeal | Self-hosted Docker VPS ~R150/mo. Signed PDFs in Supabase Storage under RLS. |
| D-029 | Municipal bills | Manual PDF upload + Claude Sonnet extraction only. No scraping. Ever. |
| D-030 | PayFast scope | PayFast handles application fees (R199) and platform subscriptions only. NOT rent collection. Card fees (2.9% + R2) are uneconomical on SA rent amounts. |
| D-031 | Rent collection model | DebiCheck via Peach Payments (primary, Steward+). EFT (universal fallback). Mandate setup embedded in lease signing flow. Card: Phase 4+ only. |
| D-032 | Residential vs commercial compliance | RHA 50/1999 applies to residential dwellings ONLY. Commercial leases governed by common law + contract — RHA deposit rules, timelines, inspections, and Tribunal jurisdiction do NOT apply. CPA s14 does NOT apply to B2B transactions between juristics. CPA general protections do NOT apply where tenant is juristic ≥ R2M. PPRA trust account DOES apply to registered practitioners managing any client funds (residential or commercial). Commercial deposit interest is contractual — can be retained by landlord unless lease specifies otherwise. System differentiates by lease_type field per lease. Lease templates, deposit workflows, inspection requirements, and CPA auto-renewal all branch on lease_type. See LEGAL_NOTE_PLATFORM_LIABILITY.md Part B. |

---

## Compliance Regime by Lease Type (D-032)

| Feature / Obligation | Residential B2C | Commercial B2B |
|---|---|---|
| Governing legislation | RHA 50/1999 | Common law + contract |
| Deposit in interest-bearing account | ✅ Statutory | Best practice / contractual |
| Interest belongs to tenant | ✅ Statutory | ❌ Contractual — configurable in lease |
| PPRA trust account (for practitioners) | ✅ Required | ✅ Required (all client funds) |
| Deposit return timeline | 7/14/21 days (statutory) | Per lease agreement |
| Joint inspection | ✅ Statutory | Best practice / contractual |
| 7-day dispute window | ✅ Statutory | ❌ Not applicable |
| Rental Housing Tribunal docs | ✅ | ❌ Magistrates/High Court |
| CPA s14 auto-renewal notice | ✅ (natural persons + small juristics) | ❌ B2B between juristics |
| Wear & tear rules | ✅ Statutory | Common law + contract |
| Deposit reconciliation format | RHA-compliant | Contractual standard |

---

## Deposit Feature Gate (D-025 + D-032)

### Residential leases

| Feature | Owner (private landlord) | Steward+ with trust account | Steward+ NO trust account |
|---|---|---|---|
| Record deposit amount | ✅ | ✅ | ✅ |
| Record deposit received | ✅ | ✅ | ✅ |
| Deposit receipt PDF | ✅ | ✅ | ❌ BLOCKED |
| Interest calculation | ✅ | ✅ | ❌ BLOCKED |
| 7/14/21-day timers (statutory) | ✅ auto | ✅ auto | ⚠️ warns only |
| Deduction schedule | ✅ | ✅ | ❌ BLOCKED |
| Tribunal-ready deposit report | ✅ | ✅ | ❌ BLOCKED |
| Compliance prompt logged | No | No | ✅ Every interaction |

### Commercial leases

| Feature | Any tier with trust account | Any tier NO trust account |
|---|---|---|
| Record deposit amount | ✅ | ✅ |
| Record deposit received | ✅ | ✅ |
| Deposit receipt PDF | ✅ | ❌ BLOCKED (PPRA obligation) |
| Interest config (landlord or tenant) | ✅ Configurable per lease | ❌ BLOCKED |
| Lease-specified return timeline | ✅ Configurable | ⚠️ warns only |
| Deduction schedule | ✅ | ❌ BLOCKED |
| Tribunal-ready report | ❌ N/A — not applicable | ❌ N/A |
| Standard deposit reconciliation | ✅ (non-RHA format) | ❌ BLOCKED |

Note: Owner tier + commercial lease is an edge case (e.g. landlord renting out a lock-up
shop). Apply same logic — no PPRA obligation for non-practitioners, deposit recording
available, legal-grade documents require trust account confirmation.

---

## Tier Structure

| Tier | Monthly | Annual | Units | Users | HOA |
|---|---|---|---|---|---|
| Owner | Free | Free | 1 | 1 | No |
| Steward | R599 | R5,750 | 10 | 2 | No |
| Portfolio | R999 | R9,590 | 30 | 5 | No |
| Firm | R2,499 | R23,990 | Unlimited | Unlimited | Yes |

Billing metric: active lettable units (not properties — properties unlimited at all tiers).
Overage: R35/unit/month above limit. No hard block — data never locked out.

---

## Rent Payment Methods

| Method | Provider | Cost | Tier | Notes |
|---|---|---|---|---|
| DebiCheck | Peach Payments | ~R3–R8/collection | Steward+ | Primary. Mandate set at lease signing. |
| EFT | Manual/bank recon | R0 | All tiers | Universal fallback. Unique ref per tenant. |
| Card (future) | PayFast | 2.9% + R2 | Phase 4+ | Fee passed to tenant as surcharge only. |

---

## AI Routing

- **Haiku 4.5:** bulk/structured (classification, triage, SMS copy, completeness checks)
- **Sonnet 4.6:** legal-quality output (FitScore, wear & tear, lease drafting, arrears, municipal extraction)
- **Opus 4.6:** rare high-stakes (Firm only — Tribunal, Section 4, dispute letters)
- **Prompt cache always:** lease system prompt, wear & tear table, FitScore rubric, bank statement guide

---

## DB Implementation Order

organisations → users → subscriptions → properties → units → leases → financials → inspections → maintenance

Key field: `leases.lease_type` = 'residential' | 'commercial' — drives compliance regime throughout

---

## Phase Roadmap

**Phase 1 (Months 1–3):** Auth/org/onboarding, properties/units, tenants, leases/DocuSeal, inspections PWA, maintenance, invoicing, owner statements
**Phase 2 (Months 3–5):** Bank recon, DebiCheck, arrears automation, lease lifecycle automation, municipal bills, Searchworx Phase 1, FitScore AI, reporting
**Phase 3 (Months 5–7):** Searchworx API, application pipeline, Lightstone AVM, deposit reconciliation engine, HOA module, contractor portal
**Phase 4 (Months 7–10):** Multi-org, portfolio analytics, API, white-label, native app

---

## Open Items

| # | Status | Detail |
|---|---|---|
| O-007 | 🟡 Non-blocking | Searchworx API timeline — pending request. Phase 1 launches without it. |

All other decisions resolved. Claude Code can start.
