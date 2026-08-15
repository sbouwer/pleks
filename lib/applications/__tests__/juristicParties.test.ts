/**
 * lib/applications/__tests__/juristicParties.test.ts — the accompanying-party rule and the juristic fee
 *
 * Notes:  Covers the 2026-08-15 ruling: a juristic applicant (pty_ltd / cc / npc / trust) must be
 *         accompanied by at least one surety party, and the entity + its sureties are paid for in ONE
 *         transaction. Before this, a Pty application could be created and paid with zero directors,
 *         producing a company screening line with no human credit profile behind it to assess.
 *
 *         The vocabulary assertions are not cosmetic: a trust has TRUSTEES, and calling a trustee a
 *         "director" in an applicant-facing gate message is wrong in a document a Tribunal may read.
 */
import { describe, it, expect } from "vitest"
import {
  MIN_SURETY_PARTIES,
  requiresSuretyParty,
  suretyPartyLabel,
  suretyPartyLabelPlural,
  validateJuristicParties,
} from "@/lib/applications/juristicParties"
import { screeningFeeCents, screeningFeeLineCount, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

const JURISTIC = ["pty_ltd", "cc", "npc", "trust"] as const
const UNINCORPORATED = ["sole_proprietor", "partnership", "other"] as const

describe("which applications need an accompanying surety party", () => {
  it("requires one for every juristic type", () => {
    for (const t of JURISTIC) {
      expect(requiresSuretyParty("organisation", t), t).toBe(true)
    }
  })

  it("requires none for unincorporated organisations — the humans ARE the applicant", () => {
    for (const t of UNINCORPORATED) {
      expect(requiresSuretyParty("organisation", t), t).toBe(false)
    }
  })

  it("requires none for an individual applicant", () => {
    expect(requiresSuretyParty("individual", null)).toBe(false)
    expect(requiresSuretyParty("individual", "pty_ltd")).toBe(false) // entity_type wins
  })

  it("accepts EITHER org marker — entity_type 'organisation' or applicant_type 'company'", () => {
    // Callers hold different signals; a gate that only understood one could be bypassed by the other.
    for (const t of JURISTIC) {
      expect(requiresSuretyParty("organisation", t), `entity_type/${t}`).toBe(true)
      expect(requiresSuretyParty("company", t), `applicant_type/${t}`).toBe(true)
    }
    expect(validateJuristicParties({ entityType: "company", companyType: "trust", suretyCount: 0 }).ok).toBe(false)
  })
})

describe("the surety party is named correctly for the entity", () => {
  it("calls a trust's party a trustee, not a director", () => {
    expect(suretyPartyLabel("trust")).toBe("trustee")
    expect(suretyPartyLabelPlural("trust")).toBe("trustees")
  })

  it("calls a company's party a director", () => {
    for (const t of ["pty_ltd", "cc", "npc"]) expect(suretyPartyLabel(t), t).toBe("director")
  })

  it("falls back to a neutral word for anything else", () => {
    expect(suretyPartyLabel("partnership")).toBe("representative")
    expect(suretyPartyLabel(undefined)).toBe("representative")
  })
})

describe("validateJuristicParties gates payment", () => {
  it("refuses a juristic application with no surety party", () => {
    for (const t of JURISTIC) {
      const r = validateJuristicParties({ entityType: "organisation", companyType: t, suretyCount: 0 })
      expect(r.ok, t).toBe(false)
      expect(r.error, t).toBeTruthy()
    }
  })

  it("uses the right word in the refusal message", () => {
    const trust = validateJuristicParties({ entityType: "organisation", companyType: "trust", suretyCount: 0 })
    expect(trust.error).toContain("trustee")
    expect(trust.error).not.toContain("director")

    const pty = validateJuristicParties({ entityType: "organisation", companyType: "pty_ltd", suretyCount: 0 })
    expect(pty.error).toContain("director")
  })

  it("accepts a juristic application at the minimum", () => {
    for (const t of JURISTIC) {
      expect(validateJuristicParties({ entityType: "organisation", companyType: t, suretyCount: MIN_SURETY_PARTIES }).ok, t).toBe(true)
    }
  })

  it("never blocks an individual or unincorporated applicant", () => {
    expect(validateJuristicParties({ entityType: "individual", companyType: null, suretyCount: 0 }).ok).toBe(true)
    expect(validateJuristicParties({ entityType: "organisation", companyType: "partnership", suretyCount: 0 }).ok).toBe(true)
  })
})

describe("the juristic fee covers the entity AND its sureties in one transaction", () => {
  it("charges the company line plus one line per surety", () => {
    const one = screeningFeeCents({ isJuristic: true, suretyCount: 1, hasCoApplicant: false })
    const two = screeningFeeCents({ isJuristic: true, suretyCount: 2, hasCoApplicant: false })
    expect(one).toBe(APPLICATION_FEE_CENTS * 2)   // company + 1 director
    expect(two).toBe(APPLICATION_FEE_CENTS * 3)   // company + 2 directors
    // Rate card D-RATE-06 worked example: company + 1 director = R500, + 2 = R750.
    expect(one).toBe(50000)
    expect(two).toBe(75000)
  })

  it("counts one payable line per screened subject", () => {
    expect(screeningFeeLineCount({ isJuristic: true, suretyCount: 1, hasCoApplicant: false })).toBe(2)
    expect(screeningFeeLineCount({ isJuristic: true, suretyCount: 3, hasCoApplicant: false })).toBe(4)
    expect(screeningFeeLineCount({ isJuristic: false, suretyCount: 0, hasCoApplicant: false })).toBe(1)
    expect(screeningFeeLineCount({ isJuristic: false, suretyCount: 0, hasCoApplicant: true })).toBe(2)
  })

  it("leaves the individual path on its recorded prices", () => {
    expect(screeningFeeCents({ isJuristic: false, suretyCount: 0, hasCoApplicant: false })).toBe(APPLICATION_FEE_CENTS)
    expect(screeningFeeCents({ isJuristic: false, suretyCount: 0, hasCoApplicant: true })).toBe(JOINT_APPLICATION_FEE_CENTS)
  })

  it("ignores suretyCount for an individual application", () => {
    expect(screeningFeeCents({ isJuristic: false, suretyCount: 5, hasCoApplicant: false })).toBe(APPLICATION_FEE_CENTS)
  })
})
