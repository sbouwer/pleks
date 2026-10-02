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
  suretyQuestion,
  suretyQuestionNoun,
  isJuristicApplicant,
  isJuristicApplication,
  orgMarkerFrom,
  paidScreeningSubjects,
  suretyPartyLabel,
  suretyPartyLabelPlural,
  SURETY_PARTY_OR_FILTER,
} from "@/lib/applications/juristicParties"
import { applicationBundle } from "@/lib/screening/searchworxBundle"

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

describe("the juristic quote covers the entity AND its sureties in one transaction", () => {
  // The fee itself is the formula's (lib/screening/__tests__/pricing.test.ts, bundle-economics.test.ts); what
  // belongs here is the SHAPE billing prices, which paidScreeningSubjects below must mirror line for line.
  it("prices the company line plus one SA bundle per surety", () => {
    for (const n of [1, 2, 3]) {
      const b = applicationBundle({ juristic: true, persons: n })
      expect(b.entityProducts.length).toBeGreaterThan(0)
      expect(b.persons).toBe(n)
    }
  })

  it("prices a company applying ALONE as the entity line only — a surety is optional (BUILD_72 R0)", () => {
    expect(applicationBundle({ juristic: true, persons: 0 })).toMatchObject({ persons: 0 })
    expect(applicationBundle({ juristic: true, persons: 0 }).entityProducts.length).toBeGreaterThan(0)
  })

  it("prices an individual application per person, with no entity line", () => {
    expect(applicationBundle({ juristic: false, persons: 1 }).entityProducts).toEqual([])
    expect(applicationBundle({ juristic: false, persons: 2 }).persons).toBe(2)
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

describe("paidScreeningSubjects — the lines one application payment marks paid (the ITN, BUILD_72 P1-R8a)", () => {
  const company = { entity_type: "organisation", applicant_type: "company", company_info: { companyType: "pty_ltd" } }
  const residential = { entity_type: "individual", applicant_type: "individual", company_info: null }

  it("writes the lead's own line for a residential application — an 'applicant', never a 'company' (R8b-1)", () => {
    expect(paidScreeningSubjects(residential, "app-1", [])).toEqual([{ subject_type: "applicant", subject_id: "app-1" }])
  })

  it("writes one co_applicant line per live residential co row, a guarantor included — no longer juristic-only", () => {
    expect(paidScreeningSubjects(residential, "app-1", ["co-1", "guarantor-co-row"])).toEqual([
      { subject_type: "applicant", subject_id: "app-1" },
      { subject_type: "co_applicant", subject_id: "co-1" },
      { subject_type: "co_applicant", subject_id: "guarantor-co-row" },
    ])
  })

  it("a dormant company application (entity_type unwritten) is a natural-person lead, so it is an 'applicant' line", () => {
    expect(paidScreeningSubjects({ ...company, entity_type: "individual" }, "app-1", ["d1"])).toEqual([
      { subject_type: "applicant", subject_id: "app-1" },
      { subject_type: "co_applicant", subject_id: "d1" },
    ])
  })

  it("writes the entity line alone for a company with no surety — a surety is optional (R0)", () => {
    expect(paidScreeningSubjects(company, "app-1", [])).toEqual([{ subject_type: "company", subject_id: "app-1" }])
  })

  it("writes exactly the lines billing priced: 1 + N, juristic and residential alike", () => {
    for (const ids of [[], ["d1"], ["d1", "d2", "d3"]]) {
      const juristic = paidScreeningSubjects(company, "app-1", ids)
      const pricedJuristic = applicationBundle({ juristic: true, persons: ids.length })
      expect(juristic).toHaveLength((pricedJuristic.entityProducts.length > 0 ? 1 : 0) + pricedJuristic.persons)

      const resi = paidScreeningSubjects(residential, "app-1", ids)
      expect(resi).toHaveLength(applicationBundle({ juristic: false, persons: 1 + ids.length }).persons)
      for (const lines of [juristic, resi]) {
        expect(lines.filter((l) => l.subject_type === "co_applicant").map((l) => l.subject_id)).toEqual(ids)
      }
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

const entity = (companyType: string) => ({ entity_type: "organisation", applicant_type: null, company_info: { companyType } })
const RESIDENTIAL = { entity_type: "individual", applicant_type: null, company_info: null }
const party = (role: string, declared_director: boolean | null, is_surety_director = false) => ({ role, is_surety_director, declared_director })

describe("inviteHold — only a company's director has reviewed copy (P1-R3/R7a, F7 ruling)", () => {
  it("holds a company surety answered 'not a director' and one never asked", () => {
    for (const t of ["pty_ltd", "npc"]) {
      expect(inviteHold({ party: party("guarantor", false), application: entity(t) }), t).toBe("awaiting_template")
      expect(inviteHold({ party: party("guarantor", null), application: entity(t) }), t).toBe("awaiting_template")
    }
  })
  it("does not hold a company director by either fact", () => {
    expect(inviteHold({ party: party("guarantor", true), application: entity("pty_ltd") })).toBeNull()
    expect(inviteHold({ party: party("guarantor", null, true), application: entity("npc") })).toBeNull()
  })
  it("HOLDS a trustee's and a CC member's 'yes' — director_invited says 'a director' (F7)", () => {
    expect(inviteHold({ party: party("guarantor", true), application: entity("trust") })).toBe("awaiting_template")
    expect(inviteHold({ party: party("guarantor", true), application: entity("cc") })).toBe("awaiting_template")
    expect(inviteHold({ party: party("guarantor", null, true), application: entity("trust") })).toBe("awaiting_template")
  })
  it("never holds a residential guarantor or a co-applicant", () => {
    expect(inviteHold({ party: party("guarantor", null), application: RESIDENTIAL })).toBeNull()
    expect(inviteHold({ party: party("co_applicant", null), application: entity("pty_ltd") })).toBeNull()
  })
})

describe("inviteRoute — the one copy decision every sender reads (walker F1/F2, F7)", () => {
  it("sends director copy only to a company's director surety", () => {
    expect(inviteRoute({ party: party("guarantor", true), application: entity("pty_ltd") })).toBe("director")
    expect(inviteRoute({ party: party("guarantor", null, true), application: entity("npc") })).toBe("director")
  })
  it("holds every other juristic surety, a trustee's or member's 'yes' included", () => {
    expect(inviteRoute({ party: party("guarantor", false), application: entity("pty_ltd") })).toBe("held")
    expect(inviteRoute({ party: party("guarantor", true), application: entity("trust") })).toBe("held")
    expect(inviteRoute({ party: party("guarantor", true), application: entity("cc") })).toBe("held")
  })
  it("sends joint-rental copy to a residential guarantor, even one answered 'yes', and to a co-applicant", () => {
    expect(inviteRoute({ party: party("guarantor", true), application: RESIDENTIAL })).toBe("co_applicant")
    expect(inviteRoute({ party: party("co_applicant", null), application: RESIDENTIAL })).toBe("co_applicant")
    expect(inviteRoute({ party: party("co_applicant", null), application: entity("trust") })).toBe("co_applicant")
  })
})

describe("suretyQuestion — the noun follows the entity (F7)", () => {
  it("asks a company about a director, a trust about a trustee, a CC about a member", () => {
    expect(suretyQuestionNoun("pty_ltd")).toBe("director")
    expect(suretyQuestionNoun("npc")).toBe("director")
    expect(suretyQuestionNoun("trust")).toBe("trustee")
    expect(suretyQuestionNoun("cc")).toBe("member")
    expect(suretyQuestionNoun("partnership")).toBeNull()
    expect(suretyQuestion("trust")).toBe("Are they a trustee of the trust?")
    expect(suretyQuestion("cc")).toBe("Are they a member of the close corporation?")
  })
})
