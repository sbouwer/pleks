# SEARCHWORX_RATE_CARD.md

> **Authoritative pricing reference for Pleks's tenant screening bundles.**
> Prices are ex-VAT per Searchworx pricelist dated 12 May 2026.
> Searchworx invoices Pleks ex-VAT + 15% VAT. Pleks is **not currently VAT-registered** (newco, sub-R600k annual turnover). True cost to Pleks = ex-VAT price × 1.15.
> Annual review trigger: Searchworx pricelist changes (typically Q1 each year) + Pleks VAT registration status changes.
> Supersedes `brief/build/_OTHER/SEARCHWORX_PRICING_REFERENCE.md` (Mar 2026 pricelist + R399 single-bundle model).

---

## 1. The two flavours — what we sell

Pleks offers two screening bundles. Agencies select per listing via `listings.screening_bundle`. The applicant pays one fee that covers the entire bundle.

### 1.1 Standard bundle — R250 application fee

**What's in it:**

| Endpoint | Cost ex-VAT | Purpose |
|---|---|---|
| TransUnion Consumer Profile PP | R59.95 | Credit profile with payment behaviour (month-by-month payment history across all accounts) — the single most predictive credit signal |
| TransUnion Consumer Trace | R18.55 | Identity verification, address history, contact + employment cross-reference |
| VCCB Income Estimator | R6.35 | Bureau-sourced income estimate from banking data — independent cross-check of declared income |
| Default Listing Consumer Combined | R95.85 | TPN rental payment history + adverse listings — the SA rental industry's gold-standard tenancy signal |
| **Bundle cost ex-VAT** | **R180.70** | |
| **Bundle cost incl-VAT (Pleks's actual cost)** | **R207.81** | |
| **Pleks margin at R250 fee** | **R42.19 (17%)** | |

**Recommended use case:** All standard residential and commercial rental applications. This is the default for most agency listings.

**Why it works:** Combines credit behaviour (TU PP) + identity verification (Trace) + independent income (VCCB) + rental-specific behaviour (TPN). Equivalent data depth to a TPN-native screening product (R350-R400 retail) at a lower fee point, with AI synthesis and POPIA-clean audit trail on top.

### 1.2 Estate bundle — R650 application fee

**What's in it:**

All of Standard, plus:

| Endpoint | Cost ex-VAT | Purpose |
|---|---|---|
| Huru Criminal Record Check (Standard) | R330.00 | SAPS-sourced criminal record check |
| **Bundle cost ex-VAT** | **R510.70** | |
| **Bundle cost incl-VAT (Pleks's actual cost)** | **R587.31** | |
| **Pleks margin at R650 fee** | **R62.69 (10%)** | |

**Recommended use case:** Security estates with admission committees, sectional title schemes requiring criminal verification, high-value rentals (R30k+/month), commercial premises requiring background-cleared occupants (jewellery stores, pharmacies, certain financial services).

**Why it has its own bundle:** Criminal check triggers POPIA s26 (special personal information) and requires explicit additional consent under s27(1)(a). The consent flow and report rendering differ from Standard — see `ADDENDUM_14E_CRIMINAL_CHECK_FLOW.md`. Cannot be slipped into Standard quietly; agencies and applicants must consciously opt in.

---

## 2. Commercial structure — modular pricing

Commercial applications (juristic applicant + surety directors) decompose into:

- **1 × Commercial Report** (company-level check)
- **N × Consumer Report** (one per director signing personal surety, where N is application-dependent)

### 2.1 Commercial Report — fixed R250

| Endpoint | Cost ex-VAT | Purpose |
|---|---|---|
| Compuscan Company Profile Standard | R110.00 | Company credit profile, business deeds, payment behaviour |
| CIPC Company Search | R15.65 | Company registration status verification |
| CIPC Director Search | R15.65 | Returns registered directors (auto-discovers undeclared directors) |
| **Subtotal ex-VAT** | **R141.30** | |
| **Subtotal incl-VAT** | **R162.50** | |
| **Pleks margin at R250 fee** | **R87.50 (35%)** | |

Higher margin than residential Standard because commercial bundle volume is lower and per-application cost recovery needs less subsidy.

### 2.2 Per-surety-director — Standard or Estate flavour

Directors signing personal surety run through the same Standard (R250) or Estate (R650) bundle as residential consumer applicants. The flavour is determined by the listing's `screening_bundle`.

**Total commercial application cost = R250 + (N × per-director fee)** where N = number of surety directors.

| Configuration | Standard | Estate |
|---|---|---|
| Company + 1 director | R250 + R250 = R500 | R250 + R650 = R900 |
| Company + 2 directors | R250 + R500 = R750 | R250 + R1,300 = R1,550 |
| Company + 3 directors | R250 + R750 = R1,000 | R250 + R1,950 = R2,200 |
| Company + 5 directors | R250 + R1,250 = R1,500 | R250 + R3,250 = R3,500 |

Commercial-Estate is unusual but legitimate for security-sensitive commercial leases.

---

## 3. VAT treatment

### 3.1 Current state (Pleks not VAT-registered)

- Searchworx invoices Pleks: ex-VAT price + 15% VAT
- Pleks **cannot reclaim** input VAT (below R50k/month voluntary threshold)
- True cost to Pleks = ex-VAT price × 1.15
- Pleks charges applicant: flat fee (no VAT line added)
- Pleks revenue = displayed fee (full amount)
- Margin = displayed fee − (ex-VAT cost × 1.15)

### 3.2 Post VAT-registration (year 2 or 3)

When Pleks crosses the voluntary threshold (R50k/month = R600k/year) or mandatory (R1M/year):

| Approach | Effect on applicant fee | Pleks margin impact |
|---|---|---|
| Prices held at current displayed values, VAT absorbed | R250 incl-VAT stays R250 | Margin drops slightly (Pleks revenue ex-VAT = R217.39) |
| Prices raised to maintain ex-VAT revenue | R250 ex-VAT + R37.50 VAT = R287.50 incl-VAT | Margin expands materially (input VAT reclaimable) |

**Recommended approach on registration:** raise displayed prices by VAT amount, keep ex-VAT revenue constant. Standard SA SaaS practice (matches what every other SA SaaS does — Xero, Sage, Wave, etc.). Applicants see clearly what's VAT.

### 3.3 Post-registration projected margins

| Bundle | Displayed fee post-reg. (incl-VAT) | Ex-VAT revenue | Ex-VAT cost (input VAT reclaimed) | Margin |
|---|---|---|---|---|
| Standard | R287.50 | R250.00 | R180.70 | R69.30 (28%) |
| Estate | R747.50 | R650.00 | R510.70 | R139.30 (21%) |

Registration is a margin tailwind. Worth planning for in roadmap.

---

## 4. Annual review

The Searchworx pricelist updates annually (typically January or February). When prices change:

1. **Update this rate card** with new ex-VAT figures
2. **Re-compute bundle totals + Pleks margins**
3. **Update `lib/screening/searchworxBundleConfig.ts`** seed data
4. **Update `application_fee_cents` default on listings** if cost changes warrant fee adjustment (minor changes <5% absorbed by Pleks; major changes >10% trigger fee revision)
5. **Update consumer-facing copy** explaining the bundle
6. **Emit a release note** documenting the change

The rate card is the single source of truth. Code reads from it via the bundle config; UI copy references it.

---

## 5. Why these two bundles, not more

Considered and rejected for MVP:

| Bundle option | Rejected because |
|---|---|
| **Lite (R150)** — TU PP + Trace + VCCB Income only, no TPN | Drops the most predictive SA-specific signal. False-rejects budget-tier as substandard product. If a real need surfaces (short-term rentals not covered by RHA, sub-R5k/month rooms), revisit. |
| **Premium (R900+)** — Standard + Income Estimator + ID Photo + Adverse News + PEP | Layers more checks at diminishing return for tenancy screening. Estate bundle's criminal check is the meaningful upgrade for security-sensitive cases; the others are FICA-EDD-grade for landlord onboarding, not tenant screening. |
| **Per-applicant à la carte** — agent picks individual checks | UX nightmare. Decision fatigue. Pleks's job is to recommend a bundle, not delegate the screening design to every agent. |

Three or four bundles makes selection harder without proportional benefit. Two is the sweet spot for agent decision-making and applicant clarity.

---

## 6. Excluded endpoints — and why

Searchworx offers ~217 endpoints. Most are excluded from MVP bundles for one of three reasons:

### 6.1 Never built (POPIA / discrimination risk)

| Endpoint | Cost ex-VAT | Why excluded |
|---|---|---|
| iFacts Social Media Reports (Basic / Standard / Full) | R288 / R320 / R457 | High POPIA discrimination risk — surfaces religion, politics, sexual orientation, race signals. Conflicts with FitScore's deliberate exclusion of protected categories (Purpose B5). Never built. |
| List Commercial Default | R95.85 | Agent-actioned, NCR-regulated. Posting default listings on tenants requires specific NCA-compliant procedures. Not a Pleks responsibility. |

### 6.2 Deferred to Tier 2 (FICA EDD, not tenancy)

| Endpoint | Cost ex-VAT | Why deferred |
|---|---|---|
| Adverse News (CSI / NGA Standard / NGA) | R26.65–R30 | Reputation/media screening — relevant for FICA Enhanced Due Diligence on high-risk landlords, not tenancy. |
| PEP and Sanctions Check (CSI / NGA) | R26.65 / R30 | Same — landlord FICA EDD, not tenant screening. |
| CSI KYC / KYC With ID Photo | R60 / R75 | Landlord onboarding FICA bundle (BUILD_24 future scope). |
| CIPC Director Search (per director) | R15.65 | Already in commercial bundle. Per-director consumer extension is the standard residential bundle. |

### 6.3 Out of scope (not relevant to property)

| Endpoint | Cost ex-VAT | Why excluded |
|---|---|---|
| iFacts Drivers License Check | R115 | Employment screening, not rental. |
| iFacts Matric / FAIS / Qualification Verification | R178–R302 | Professional vetting. |
| MIE checks (Drivers, Qualification, Vehicle) | R95–R670 | Same — employment. |
| SAPS Firearm Competency / Licence | R325–R500 | Not relevant. |
| Vehicle Ownership / TransUnion Auto | R169.85 | Not relevant. |
| Searchworx SMS | R0.95–R1.20 | Pleks uses Africa's Talking (cheaper, already integrated). |
| Searchworx Letter of Demand | R75 (email) / R110 (post) | Pleks generates own LOD via Opus 4.6 (sub-cent cost). |

### 6.4 Reserved for future expansion (not MVP)

| Endpoint | Cost ex-VAT | Future use |
|---|---|---|
| Lightstone Erf Valuation (Short) | R117 | Property onboarding — agent-triggered AVM, Steward+ tier feature |
| Lightstone Erf Valuation (Full) | R155 | Premium property valuation |
| Deeds Office Search | R22.80 | Landlord ownership verification — FICA flow |
| Database Property Search | R16.50 | Property record verification |
| Conversions (Erf↔Street) | R12.10 each | Property identifier normalisation |
| Property Ownership History | R17.60 | Historical title chain |
| HURU Criminal Record (Premium) | R380 | Alternative to Standard — defer until first agency requests, evaluate price/value |

---

## 7. Cross-references

- `BUILD_14_SEARCHWORX_FITSCORE.md` — implementation spec for the screening pipeline
- `ADDENDUM_14B_COMMERCIAL_APPLICATIONS.md` — multi-party portal mechanics for commercial
- `ADDENDUM_14D_BANK_STATEMENT_INTELLIGENCE.md` — bank statement classification + Ratio 2
- `ADDENDUM_14E_CRIMINAL_CHECK_FLOW.md` — Estate bundle POPIA s26 consent flow
- `brief/legal/PROCESSING_PURPOSES.md` Purpose B4 — credit screening
- `brief/legal/PROCESSING_PURPOSES.md` Purpose B5 — FitScore methodology
- `brief/legal/PROCESSING_PURPOSES.md` Purpose B9 — application fee structure
- `brief/legal/PROCESSING_PURPOSES.md` Purpose B22 — AI processing (bank statement extraction)
- `lib/screening/searchworxBundleConfig.ts` — TypeScript seed data (Phase 2 API config)

---

## 8. Decision log

| ID | Decision | Rationale |
|---|---|---|
| D-RATE-01 | Two bundles only (Standard + Estate) | Three or more bundles introduces analysis paralysis. Two covers 99% of SA rental screening needs. |
| D-RATE-02 | Default Listing Consumer Combined in Standard | The TPN payment history is the most predictive tenancy signal in SA. Skipping it makes Pleks's screening shallower than TPN-native products. |
| D-RATE-03 | Huru Criminal Standard (R330) in Estate only, not Standard | POPIA s26 special information requires explicit additional consent. Not all rentals require criminal check — making it opt-in via Estate bundle respects both POPIA and applicant friction. |
| D-RATE-04 | R250 / R650 fees with thin margins | Strategic volume play. Lower applicant fees → more applications → more tenant database growth → stronger Pleks-internal screening signal long-term. Total revenue is fee × volume. |
| D-RATE-05 | Margins improve on VAT registration | Tailwind built into the model. Year 1 thin, year 2+ healthier. |
| D-RATE-06 | Commercial = R250 company + N × per-director fee | Modular pricing that scales naturally. 1-director CC pays R500 (Standard) or R900 (Estate); 5-director Pty pays R1,500 or R3,500. Transparent. |
| D-RATE-07 | Agency picks bundle per listing | The agent knows the property and the landlord mandate. Pleks provides clear bundle cards; agent decides which fits. |
| D-RATE-08 | Lite tier (no TPN) deferred | Demand-driven. If a real budget-tier need surfaces, add Lite then. MVP doesn't include it. |

---

*End of `SEARCHWORX_RATE_CARD.md`.*
