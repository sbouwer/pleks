# LEGAL NOTE — Platform Liability, B2B vs B2C, and Deposit Legislation
> Pleks — South African Property Management Platform
> Prepared: Sessions 5–6
> Status: Reference document for architecture decisions
> Applies to: D-025 (trust account onboarding), D-032 (lease type gating), all deposit and lease features
> ⚠️ This is not legal advice. Obtain qualified SA legal opinion before launch.

---

## PART A — Platform Liability & Knowing Facilitation (Session 5)

### The Question

Does a consent notice + checkbox at onboarding protect Pleks from liability when a
client acknowledges they have no trust account, uses Pleks's deposit management
features anyway, and claims "the platform allowed them"?

**Short answer: No, not reliably — "platform liability is zero" was overconfident.**

### Why the ECT Act Safe Harbor Does Not Apply Here

The ECT Act 25 of 2002 safe harbor protects passive intermediaries with no knowledge
of unlawful activity. Pleks explicitly asks about trust account status — establishing
actual knowledge at onboarding. The safe harbor evaporates on actual knowledge.

### SA Accomplice Liability (Civil — the real risk)

Civil delictual liability requires a causal link between Pleks's conduct and the
tenant's loss. If Pleks generates deposit receipts, reconciliation reports, and
Tribunal-ready documents for a non-compliant practitioner, those documents are the
legal infrastructure of the deposit management. A Pleks-generated deposit receipt that
a tenant relied on as evidence their money was properly held is a strong causal link.

### The Disclaimer Problem

The Consumer Protection Act s51(1)(c) prohibits exemption clauses covering gross
negligence. Building full-featured deposit infrastructure for a user who disclosed
non-compliance, then pointing to a checkbox, could be gross negligence.

### What Reduces Exposure Materially

1. **Feature restriction (D-025 revised):** Block legal-grade deposit documents for
   Steward/Portfolio/Firm users without confirmed trust accounts. Allow recording that
   a deposit exists (neutral data), block the operational infrastructure.

2. **Persistent compliance prompts:** Log every deposit interaction by a non-compliant
   user to consent_log. Creates a continuous paper trail.

3. **Tier-appropriate gating:** Owner tier (private landlord, own property) has a
   different obligation — not PPRA-regulated. Notice + checkbox is defensible.

4. **ToS:** Express language that deposit features are for compliant practitioners only.

---

## PART B — B2B vs B2C Deposit Legislation (Session 6)

### The Core Principle Your Reasoning Confirms

The Rental Housing Act 50 of 1999 is consumer protection legislation.
It applies to **residential dwellings only**. It does not apply to commercial leases.
A business that manages only commercial B2B properties does not operate under the
RHA deposit framework at all. Treating them as if they do would be legally wrong
and commercially counterproductive.

### Rental Housing Act — Residential Dwellings ONLY

The RHA defines "dwelling" as houses, hostels, flats, apartments, rooms, shacks,
outbuildings — residential structures for housing purposes.

**Confirmed by statute and multiple sources:**
*"The RHA governs only leases of dwellings for housing purposes."*
*"The Act applies to all residential rental properties — excluding commercial property rentals."*

**RHA s5 deposit obligations apply ONLY to residential leases:**
- Deposit in interest-bearing account (not less than savings rate) — residential only
- Interest belongs to tenant — residential only
- 7/14/21-day deposit return timelines — residential only
- Joint inspection requirement — residential only
- 7-day tenant dispute window — residential only
- Rental Housing Tribunal jurisdiction — residential only

### Consumer Protection Act — B2B Exclusions

Three clean exclusions relevant to commercial/B2B:

1. **CPA s14 (auto-renewal, 20 business days notice):** Does NOT apply to transactions
   between two juristic persons — full stop, regardless of size or turnover.

2. **CPA general protections:** Do NOT apply where the tenant is a juristic person
   with asset value or annual turnover ≥ R2 million (Government Gazette No 34181,
   1 April 2011 — threshold confirmed at R2 million).

3. **B2B context:** Courts and practitioners lean toward B2B exclusion where both
   parties are in a commercial relationship, even if one party is a natural person
   acting in their capacity as a director/partner.

### Commercial Lease Deposit Rules

| Obligation | Source | Commercial B2B position |
|---|---|---|
| Deposit in interest-bearing account | RHA s5 | NOT statutory — contractual only |
| Interest belongs to tenant | RHA s5 | NOT statutory — contractual. Landlord CAN retain unless lease specifies otherwise |
| PPRA trust account | Property Practitioners Act | YES — required for registered practitioners holding ANY client funds, residential or commercial |
| Deposit return timeline | RHA s5 | NOT statutory — governed by lease agreement |
| Joint inspections | RHA s5 | NOT statutory — best practice / contractual |
| Tribunal-ready documentation | RHA/Tribunal jurisdiction | NOT applicable — commercial disputes → Magistrates/High Court |
| Wear & tear deduction rules | RHA | NOT statutory — common law + lease governs |
| CPA auto-renewal notice (s14) | CPA | NOT required for B2B between juristics |

**Rawson (property industry):** "In the commercial rental market, the landlord is required
to keep the deposit in a trust account, but there is no legal requirement to reimburse
the interest which was accrued on the deposit."

**Prestige Real Estate:** "For commercial leases, interest treatment depends on what is
stated in the lease agreement. While deposits are commonly held in interest-bearing
accounts, there is no automatic obligation for the interest to be paid to the tenant
unless expressly agreed."

### The PPRA Trust Account — Applies to All Client Funds

This is the one obligation that does NOT distinguish between residential and commercial:

A registered property practitioner under the Property Practitioners Act 22 of 2019
is required to hold ALL client funds (including commercial deposits) in a PPRA-
registered trust account. The PPRA trust account obligation is not limited to
residential property.

**However:** The interest treatment for funds held in that trust account is:
- **Residential deposits:** Interest belongs to tenant (RHA)
- **Commercial deposits:** Interest treatment is contractual — the practitioner/landlord
  may retain interest unless the lease specifies otherwise

### Practical Flow for the System

**Lease type determines which compliance regime applies:**

```
If lease_type = 'residential':
  → Full RHA compliance
  → Interest belongs to tenant (statutory)
  → 7/14/21-day deposit return (statutory)
  → Joint inspection requirement (statutory)
  → 7-day dispute window (statutory)
  → Tribunal-ready documentation
  → CPA auto-renewal notice (unless tenant is juristic ≥ R2M)

If lease_type = 'commercial':
  → RHA does NOT apply
  → Interest treatment: per lease terms (configurable)
  → Deposit return timeline: per lease terms
  → Inspection: per lease terms (Pleks recommends, does not mandate)
  → Dispute forum: Magistrates/High Court (no Tribunal format)
  → CPA s14: does NOT apply (B2B between juristics)
  → PPRA trust account: still required for registered practitioners
```

### Trust Account Onboarding — Updated for Lease Type

The trust account question should branch based on what the user manages:

**Option A — Residential only:**
- Full PPRA trust account required
- Interest accrual belongs to tenant
- All RHA deposit features activate with confirmed trust account

**Option B — Commercial only:**
- PPRA trust account required (for registered practitioners — PPRA obligation)
- Interest treatment is configured in lease template (landlord default, or returnable per agreement)
- Deposit receipts and reconciliation available without full RHA compliance
- No 7/14/21-day statutory timelines — platform uses lease-specified timelines
- No Tribunal-ready documents — standard deposit reconciliation documents instead

**Option C — Mixed (residential and commercial):**
- Apply residential rules to residential units
- Apply commercial rules to commercial units
- PPRA trust account required (covers both)
- System tracks per-unit/per-lease which regime applies

**The onboarding question "Do you have a trust account?" still applies to all:**
The trust account is required for PPRA-registered practitioners managing ANY client
funds. However, for a private landlord managing only their own commercial properties
(not a PPRA practitioner), the trust account obligation may not exist.

The onboarding should therefore also ask: "Are you a registered property practitioner
with the PPRA / do you manage properties on behalf of others?"

If YES → PPRA trust account required regardless of residential/commercial
If NO (private landlord, own properties only) → Trust account best practice but
  obligation depends on whether residential (RHA) or commercial (common law/contract)

### Pleks System Design Implication

1. **Unit type field** (already in schema: `residential | commercial | mixed`): drives
   which compliance regime applies
2. **Lease type field** on every lease: `residential | commercial`
3. **Deposit management features gate on lease type + trust account status:**
   - Residential + trust account: full RHA-compliant deposit management
   - Residential + no trust account: restricted (as per D-025)
   - Commercial + trust account: deposit management without RHA constraints
   - Commercial + no trust account: deposit recording only, no receipt PDFs
     (still restricted — PPRA obligation for practitioners still applies)
4. **Inspection requirements**: residential = statutory (7-day window, joint etc.);
   commercial = best practice prompts only, no compliance enforcement
5. **Deposit timelines**: residential = 7/14/21 statutory; commercial = lease-specified
6. **CPA auto-renewal notice**: only for residential B2C leases
7. **Tribunal-ready documents**: only for residential leases

### Decision Record

**D-032:** Lease type determines compliance regime. Residential leases governed by RHA
(deposit in interest-bearing account, interest to tenant, 7/14/21-day timelines,
joint inspections, Tribunal jurisdiction, CPA auto-renewal for B2C). Commercial
leases NOT governed by RHA — governed by contract. Commercial deposits: interest
treatment contractual (can be retained unless lease specifies otherwise). PPRA trust
account still required for registered practitioners managing any client funds. System
differentiates by lease_type field per lease. See PLEKS_ARCHITECTURE_REF.md D-032.

---

*This document is a reference for architectural decisions, not legal advice.*
*Obtain qualified legal opinion from a South African property law attorney before launch.*
*Last updated: Session 6*
