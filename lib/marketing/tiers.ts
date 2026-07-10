/**
 * lib/marketing/tiers.ts — Subscription tier definitions
 *
 * Notes:  Canonical source for tier names, lease caps, and display pricing.
 *         Imported by facts.ts (pricing block) and app/(public)/page.tsx (TierGrid).
 *         TierGrid.tsx imports TierData from here — single type definition.
 *         Spec: ADDENDUM_00J D-MKT-02
 */

export type TierData = {
  name: string
  leaseCap: number | null
  leases: string
  price: string | null
  perLease: string
  desc: string
  featured?: true
}

export const TIERS: readonly TierData[] = [
  { name: "Steward",    leaseCap: 15,   leases: "Up to 15 active leases",   price: "699",   perLease: "That's roughly R47 per lease at cap", desc: "Solo practitioners just holding their own book." },
  { name: "Growth",     leaseCap: 30,   leases: "Up to 30 active leases",   price: "1,199", perLease: "That's roughly R40 per lease at cap", desc: "Building a book, two pairs of hands, one landlord at a time." },
  { name: "Portfolio",  leaseCap: 75,   leases: "Up to 75 active leases",   price: "2,599", perLease: "That's roughly R35 per lease at cap", desc: "A small agency running a real portfolio, with a trust account that reconciles nightly." },
  { name: "Firm",       leaseCap: 150,  leases: "Up to 150 active leases",  price: "4,499", perLease: "That's roughly R30 per lease at cap", desc: "Established firms with a principal and multiple agents." },
  { name: "Beyond 150", leaseCap: null, leases: "Custom · Bespoke",    price: null,    perLease: "One call · ZA hours",  desc: "More than 150 active leases? The pricing bends for you too — that's a conversation, not a form." },
]
