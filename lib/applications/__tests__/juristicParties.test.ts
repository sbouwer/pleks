/**
 * lib/applications/__tests__/juristicParties.test.ts — what a juristic application is, its sureties, its fee
 *
 * Notes:  A juristic applicant (pty_ltd / cc / npc / trust) is screened on its own and a surety is
 *         OPTIONAL (Stéan 2026-10-01, BUILD_72 R0); the entity + any sureties are paid for in ONE
 *         transaction. The "at least one surety is required" tests that lived here asserted a rule
 *         attributed to a 2026-08-15 ruling nobody can source — retired with it.
 *
 *         The vocabulary assertions are not cosmetic: a trust has TRUSTEES, and calling a trustee a
 *         "director" in an applicant-facing gate message is wrong in a document a Tribunal may read.
 */
import { describe, it, expect } from "vitest"
import {
  isSuretyParty,
  inviteHold,
  inviteRoute,
  isJuristicApplicant,
  isJuristicApplication,
  orgMarkerFrom,
  paidScreeningSubjects,
  suretyPartyLabel,
  suretyPartyLabelPlural,
  SURETY_PARTY_OR_FILTER,
} from "@/lib/applications/juristicParties"
import { screeningFeeCents, screeningFeeLineCount, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

const JURISTIC = ["pty_ltd", "cc", "npc", "trust"] as const
const UNINCORPORATED = ["sole_proprietor", "partnership", "other"] as const

describe("which applicants are juristic", () => {
  it("is true for every juristic type", () => {
    for (const t of JURISTIC) {
      expect(isJuristicApplicant("organisation", t), t).toBe(true)
    }
  })

  it("is false for unincorporated organisations — the humans ARE the applicant", () => {
    for (const t of UNINCORPORATED) {
      expect(isJuristicApplicant("organisation", t), t).toBe(false)
    }
  })

  it("is false for an individual applicant", () => {
    expect(isJuristicApplicant("individual", null)).toBe(false)
    expect(isJuristicApplicant("individual", "pty_ltd")).toBe(false) // entity_type wins
  })

  it("accepts EITHER org marker — entity_type 'organisation' or applicant_type 'company'", () => {
    for (const t of JURISTIC) {
      expect(isJuristicApplicant("organisation", t), `entity_type/${t}`).toBe(true)
      expect(isJuristicApplicant("company", t), `applicant_type/${t}`).toBe(true)
    }
  })
})

describe("isJuristicApplication — the one answer billing and the application ITN share", () => {
  // DORMANT BY DESIGN until BUILD_72 R3: it reads `entity_type ?? applicant_type`, and `entity_type`
  // defaults to 'individual' with no writer. If this test starts failing because someone "fixed" the
  // reading, juristic PRICING has switched on — that is R3's change, and it must ship with R3's
  // entity_type writer and fee re-derivation, not on its own.
  it("is FALSE for a company application today — the column default masks applicant_type", () => {
    expect(isJuristicApplication({ entity_type: "individual", applicant_type: "company", company_info: { companyType: "pty_ltd" } })).toBe(false)
  })

  it("is true once entity_type is written as an organisation", () => {
    expect(isJuristicApplication({ entity_type: "organisation", applicant_type: "company", company_info: { companyType: "pty_ltd" } })).toBe(true)
  })

  it("is false for an unincorporated organisation and for a missing company_info", () => {
    expect(isJuristicApplication({ entity_type: "organisation", company_info: { companyType: "partnership" } })).toBe(false)
    expect(isJuristicApplication({ entity_type: "organisation", company_info: null })).toBe(false)
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

  it("charges a company applying ALONE one line — a surety is optional (BUILD_72 R0)", () => {
    expect(screeningFeeCents({ isJuristic: true, suretyCount: 0, hasCoApplicant: false })).toBe(APPLICATION_FEE_CENTS)
    expect(screeningFeeLineCount({ isJuristic: true, suretyCount: 0, hasCoApplicant: false })).toBe(1)
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

describe("orgMarkerFrom collapses the two org markers without losing the juristic one", () => {
  // The defect this function exists for. `applications.entity_type` has a column DEFAULT of
  // 'individual', so `entity_type ?? applicant_type` never falls through and a company application
  // is read as an individual — priced as one, and never gated on having a surety.
  it("does NOT let the entity_type default mask applicant_type='company'", () => {
    expect(orgMarkerFrom("individual", "company")).toBe("company")
    expect(isJuristicApplicant(orgMarkerFrom("individual", "company"), "pty_ltd")).toBe(true)
    // The shape it replaces, asserted so the difference is visible rather than assumed. Written
    // through variables because `"individual" ?? "company"` is a compile-time-constant coalesce.
    const entityType: string | null = "individual"
    const applicantType: string | null = "company"
    expect(isJuristicApplicant(entityType ?? applicantType, "pty_ltd")).toBe(false)
  })

  it("takes entity_type when it is the juristic one", () => {
    expect(orgMarkerFrom("organisation", "individual")).toBe("organisation")
    expect(orgMarkerFrom("organisation", null)).toBe("organisation")
    expect(isJuristicApplicant(orgMarkerFrom("organisation", null), "trust")).toBe(true)
  })

  it("leaves a genuinely individual application individual", () => {
    expect(isJuristicApplicant(orgMarkerFrom("individual", "individual"), "pty_ltd")).toBe(false)
    expect(isJuristicApplicant(orgMarkerFrom("individual", "couple"), "pty_ltd")).toBe(false)
    expect(isJuristicApplicant(orgMarkerFrom(null, null), "pty_ltd")).toBe(false)
  })

  it("falls back to whichever marker is present when neither is juristic", () => {
    expect(orgMarkerFrom(null, "couple")).toBe("couple")
    expect(orgMarkerFrom("individual", null)).toBe("individual")
  })

  it("does not make an unincorporated applicant juristic", () => {
    // sole_prop / partnership ARE the human — companyType still decides, marker or no marker.
    expect(isJuristicApplicant(orgMarkerFrom("individual", "company"), "sole_proprietor")).toBe(false)
    expect(isJuristicApplicant(orgMarkerFrom("organisation", null), "partnership")).toBe(false)
  })
})

describe("paidScreeningSubjects — the lines one application payment marks paid (the ITN)", () => {
  const company = { entity_type: "organisation", applicant_type: "company", company_info: { companyType: "pty_ltd" } }
  const residential = { entity_type: "individual", applicant_type: "individual", company_info: null }

  it("writes NOTHING for a residential application, even with a guarantor — no company line, no fee split", () => {
    expect(paidScreeningSubjects(residential, "app-1", ["guarantor-co-row"])).toEqual([])
  })

  it("writes nothing for a company application while it is still dormant (entity_type unwritten)", () => {
    expect(paidScreeningSubjects({ ...company, entity_type: "individual" }, "app-1", ["d1"])).toEqual([])
  })

  it("writes the entity line alone for a company with no surety — a surety is optional (R0)", () => {
    expect(paidScreeningSubjects(company, "app-1", [])).toEqual([{ subject_type: "company", subject_id: "app-1" }])
  })

  it("writes exactly the lines billing priced: 1 + N", () => {
    for (const ids of [[], ["d1"], ["d1", "d2", "d3"]]) {
      const lines = paidScreeningSubjects(company, "app-1", ids)
      expect(lines).toHaveLength(screeningFeeLineCount({ isJuristic: true, suretyCount: ids.length, hasCoApplicant: false }))
      expect(lines.filter((l) => l.subject_type === "co_applicant").map((l) => l.subject_id)).toEqual(ids)
    }
  })
})

describe("isSuretyParty is the one predicate both writers satisfy", () => {
  it("accepts the director-declaration marker", () => {
    expect(isSuretyParty({ is_surety_director: true, role: "co_applicant" })).toBe(true)
  })

  it("accepts the apply-flow roster marker — the WIRED writer the fee gate used to miss", () => {
    expect(isSuretyParty({ role: "guarantor", is_surety_director: false })).toBe(true)
    expect(isSuretyParty({ role: "guarantor" })).toBe(true)
    expect(isSuretyParty({ role: "guarantor", is_surety_director: null })).toBe(true)
  })

  it("rejects an ordinary co-applicant", () => {
    expect(isSuretyParty({ role: "co_applicant", is_surety_director: false })).toBe(false)
    expect(isSuretyParty({ role: null, is_surety_director: null })).toBe(false)
    expect(isSuretyParty({})).toBe(false)
  })

  it("is not satisfied by a truthy-but-not-true marker", () => {
    // The column is boolean; a string "false" arriving from anywhere must not read as surety.
    expect(isSuretyParty({ is_surety_director: false, role: "guarantor_pending" })).toBe(false)
  })

  it("keeps the query filter naming the same two markers as the predicate", () => {
    // The divergence M-118 records was a COUNT and a predicate disagreeing, so the filter string is
    // asserted against the predicate's own inputs rather than against a copy of itself.
    for (const marker of ["is_surety_director.eq.true", "role.eq.guarantor"]) {
      expect(SURETY_PARTY_OR_FILTER.split(",")).toContain(marker)
    }
    expect(SURETY_PARTY_OR_FILTER.split(",")).toHaveLength(2)
    expect(isSuretyParty({ is_surety_director: true })).toBe(true)
    expect(isSuretyParty({ role: "guarantor" })).toBe(true)
  })
})

describe("inviteHold — a juristic surety who is not a director is held, nobody else (P1-R3/R7a)", () => {
  const surety = (declared_director: boolean | null, is_surety_director = false) => ({ role: "guarantor", is_surety_director, declared_director })
  it("holds a juristic surety answered 'not a director' and one never asked", () => {
    expect(inviteHold({ party: surety(false), isJuristic: true })).toBe("awaiting_template")
    expect(inviteHold({ party: surety(null), isJuristic: true })).toBe("awaiting_template")
  })
  it("does not hold a director by either fact", () => {
    expect(inviteHold({ party: surety(true), isJuristic: true })).toBeNull()
    expect(inviteHold({ party: surety(null, true), isJuristic: true })).toBeNull()
  })
  it("never holds a residential guarantor or a co-applicant", () => {
    expect(inviteHold({ party: surety(null), isJuristic: false })).toBeNull()
    expect(inviteHold({ party: { role: "co_applicant", is_surety_director: false, declared_director: null }, isJuristic: true })).toBeNull()
  })
})

describe("inviteRoute — the one copy decision every sender reads (walker F1/F2)", () => {
  const party = (role: string, declared_director: boolean | null, is_surety_director = false) => ({ role, is_surety_director, declared_director })
  it("sends director copy only to a juristic director surety", () => {
    expect(inviteRoute({ party: party("guarantor", true), isJuristic: true })).toBe("director")
    expect(inviteRoute({ party: party("guarantor", null, true), isJuristic: true })).toBe("director")
  })
  it("holds a juristic non-director surety", () => {
    expect(inviteRoute({ party: party("guarantor", false), isJuristic: true })).toBe("held")
    expect(inviteRoute({ party: party("guarantor", null), isJuristic: true })).toBe("held")
  })
  it("sends joint-rental copy to a residential guarantor, even one answered 'director', and to a co-applicant", () => {
    expect(inviteRoute({ party: party("guarantor", true), isJuristic: false })).toBe("co_applicant")
    expect(inviteRoute({ party: party("co_applicant", null), isJuristic: false })).toBe("co_applicant")
    expect(inviteRoute({ party: party("co_applicant", null), isJuristic: true })).toBe("co_applicant")
  })
})
