/**
 * Educational bullets shown on the scenario picker info accordion.
 * Separated from scenarios.ts so non-developers can tune copy without
 * touching the data model.
 *
 * BUILD_60 Phase 21. Content reviewed for SA-specific accuracy (RHA,
 * CPA, NCA, STSMA, CSOS, RHT, CIDB, VAT, HAZMAT references).
 */

import type { ScenarioType } from "./scenarios"

export const SCENARIO_EDUCATION: Record<Exclude<ScenarioType, "other">, string[]> = {

  r1: [
    "You're both landlord and neighbour — the RHA applies to the flatlet lease.",
    "The main house and flatlet are separate units but one property in our system.",
    "Contents insurance for the flatlet is the tenant's responsibility; building cover is yours.",
    "Business use in the flatlet changes your insurance obligations — worth confirming with your broker.",
    "CPA applies because this is a residential lease (unless duration > 24 months and tenant opts out).",
  ],

  r2: [
    "The RHA governs the lease — your tenant has full statutory protections.",
    "A routine entry inspection before keys change hands protects your deposit claim later.",
    "Municipal utilities (water, electricity) are typically in your name — claim as a lease charge.",
    "CPA applies for leases under 24 months where the tenant is a consumer.",
    "If there's a pool or borehole, make sure maintenance obligations are explicit in the lease.",
  ],

  r3: [
    "The body corporate insures the building structure (common property + units).",
    "You still need contents, liability, and often rental income cover for your section.",
    "The BC's managing agent is your first call for common-area issues — not the tenant's.",
    "CSOS handles disputes between you, tenants, and the BC — faster than going to court.",
    "Levy invoices sit alongside your lease documents here — no more hunting two systems.",
  ],

  r4: [
    "Each unit gets its own lease, deposit, and inspection record here.",
    "Insurance covers the whole building — apportion replacement value per unit in the Buildings tab.",
    "If all units have the same layout, use the 'Fill all same' shortcut to save time.",
    "CSOS has no jurisdiction here (no sectional title scheme) — disputes go to the RHT.",
    "Vacancy reports across all units are available in the reporting module.",
  ],

  r5: [
    "Each building and unit is tracked separately — occupancy per building is visible at a glance.",
    "Estate infrastructure (guards, CCTV, pool, gym) can be documented against the estate record.",
    "HOA or BC levies are tracked per-unit alongside lease charges.",
    "Building compliance (electrical, plumbing, fire) is managed per building in the Compliance tab.",
    "Bulk lease renewals and vacancy reports are available across the whole estate.",
  ],

  c1: [
    "The CPA does not apply to commercial leases — NCA and common law govern instead.",
    "Rental escalation clauses (CPI-linked or fixed %) are standard and enforceable.",
    "CIDB registration and fire compliance are your landlord obligations regardless of tenant use.",
    "VAT on commercial rental is compulsory if the landlord is VAT-registered.",
    "A professional snagging list before occupation is strongly recommended for commercial fitouts.",
  ],

  c2: [
    "Each tenant gets a separate lease, invoicing cycle, and deposit record.",
    "Common area maintenance (CAM) costs can be allocated pro-rata by lettable area.",
    "If the building is VAT-registered as a whole, each lease invoice must carry VAT.",
    "Anchor tenants and standard tenants may have different lease structures — both supported.",
    "Vacancy rate across the building is visible in the reporting module.",
  ],

  c3: [
    "Three-phase power and load capacity are the most common specification gaps — capture them now.",
    "Roller door count and height determine what vehicles can access each unit.",
    "HAZMAT approval is required by the municipality for certain storage categories.",
    "Fire suppression compliance is a landlord obligation for industrial tenants.",
    "Industrial escalations are often CPI-linked with a floor — confirm with your attorney.",
  ],

  c4: [
    "Each building and unit within the park is tracked separately.",
    "Park-level amenities (guard house, CCTV, fibre) are documented against the estate record.",
    "CAM charges can be split across tenants pro-rata by occupied area.",
    "Anchor tenant and standard tenant lease structures are both supported.",
    "Portfolio reporting across the whole park is available in the reports module.",
  ],

  m1: [
    "Retail and residential units each get separate lease templates — CPA on residential, not on retail.",
    "Separate entrances for retail vs residential are strongly recommended for insurance and compliance.",
    "VAT applies to the retail leases if you're VAT-registered; residential leases are VAT-exempt.",
    "Building insurance covers the whole structure — break out replacement value per floor in the Buildings tab.",
    "Noise and access disputes between retail and residential tenants are common — address them in the lease rules.",
  ],

  m2: [
    "Each building type (office, retail, residential) gets its own lease template and clause profile.",
    "CPA applies only to residential units — commercial and office leases are governed by contract law.",
    "Shared infrastructure (fibre, generator, parking) is documented at the development level.",
    "Portfolio reporting can filter by building type so you see commercial vs residential performance separately.",
    "Development-scale insurance typically requires a specialist commercial broker — flag this in the setup.",
  ],

  r6: [
    "Each room is its own leased unit — the common areas (kitchen, bathrooms) belong to the property.",
    "Academic-year lease cycles (10 months) are supported; Pleks adjusts charge schedules automatically.",
    "NSFAS-accredited properties get NSFAS-compatible invoice formats and payment-tracking defaults.",
    "CPA applies to student leases — a tenant can cancel with 20 business days' notice if circumstances change.",
    "Key and access deposits are common in student housing — track them separately from the rental deposit.",
  ],

  r7: [
    "Each dwelling (main house, cottage, rondavel) gets its own unit record, inspection checklist, and lease.",
    "ESTA may protect long-term occupiers on land over 1 hectare — take legal advice before issuing notice.",
    "Farm specialist insurance is mandatory for agricultural land; standard buildings cover is usually insufficient.",
    "Borehole, septic tank, and off-grid power are tracked as property attributes and flagged in the lease.",
    "Staff quarters with is_lettable=false are tracked for compliance but are not leased through Pleks.",
  ],

  c5: [
    "Single-tenant retail: one unit, one lease — straightforward commercial lease governed by contract law.",
    "VAT applies to the lease if you're VAT-registered (commercial property rentals are taxable supplies).",
    "Signage rights, shopfront modifications, and permitted trading hours should be explicit in the lease.",
    "Extractor vents and fit-out obligations are landlord vs tenant flashpoints — document them upfront.",
    "Liquor licence compliance sits with the tenant, but a change of use affects your insurance — flag it.",
  ],

  c6: [
    "Month-to-month leases are the norm for self-storage — Pleks charges roll automatically each billing cycle.",
    "Each storage unit is its own lettable unit — locking, access, and inspection are tracked per unit.",
    "Prohibited goods clauses (chemicals, flammables, food) are legally important — enable the strict version.",
    "Vehicle storage changes your insurance risk profile; confirm this is covered under your commercial policy.",
    "24/7 access via code or biometric is standard — document the access model in lease terms.",
  ],

  m3: [
    "Office and residential units each get separate lease templates — CPA on residential, not on commercial.",
    "VAT applies to office leases if you're VAT-registered; residential units are VAT-exempt.",
    "Separate entrances strongly recommended to avoid noise, security, and insurance complications.",
    "Parking allocation (shared vs split) is one of the most common disputes in mixed-use buildings.",
    "Commercial property insurance with a residential rider is required — confirm cover with your broker.",
  ],

  m4: [
    "Guest rooms (short-stay) are tracked for compliance but are not leased through Pleks.",
    "Long-stay units (monthly+) get full leases — staff quarters, managers, extended-stay tenants.",
    "TGCSA grading affects insurance expectations and marketing copy — keep it current.",
    "Liquor and food handling licences are tracked in the Specifics tab and flagged at renewal.",
    "CPA applies to long-stay residential units; hospitality-specific regulations cover short-stay guests.",
  ],
}

/** Returns the bullets for a scenario, or an empty array for "other". */
export function getScenarioEducation(code: ScenarioType): string[] {
  if (code === "other") return []
  return SCENARIO_EDUCATION[code]
}
