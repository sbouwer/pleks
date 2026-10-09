/**
 * lib/leases/__tests__/leaseSource.test.ts — the lease-source seam: profiles and the org-default vocabulary
 *
 * Notes:  The org column says 'external' where the lease column says 'uploaded'; the mapper is the only bridge.
 *         An unknown stored value falls back to the column default ('pleks') rather than throw on render.
 */
import { describe, it, expect } from "vitest"
import {
  LEASE_SOURCES,
  isOrgLeaseSourceDefault,
  leaseSourceFromOrgDefault,
  leaseSourceProfile,
  rendersLeaseDocument,
} from "../leaseSource"

describe("leaseSourceProfile", () => {
  it("pleks renders, uses the clause library and needs the disclaimer", () => {
    expect(leaseSourceProfile("pleks")).toMatchObject({ rendersDocument: true, usesClauseLibrary: true, requiresTemplateDisclaimer: true })
  })

  it("uploaded is the agency's own document: nothing rendered, no clauses, no disclaimer", () => {
    expect(leaseSourceProfile("uploaded")).toMatchObject({ rendersDocument: false, usesClauseLibrary: false, requiresTemplateDisclaimer: false })
  })

  it("every declared source has a profile naming itself", () => {
    for (const s of LEASE_SOURCES) expect(leaseSourceProfile(s).source).toBe(s)
  })

  it("for display, an unknown or null value falls back to the column default", () => {
    expect(leaseSourceProfile(null).source).toBe("pleks")
    expect(leaseSourceProfile("agency_template").source).toBe("pleks")
  })
})

describe("rendersLeaseDocument — the strict write-path predicate", () => {
  it("renders only a known source whose profile renders", () => {
    expect(rendersLeaseDocument("pleks")).toBe(true)
    expect(rendersLeaseDocument("uploaded")).toBe(false)
  })

  it("an unknown or missing value is refused, never resolved to the permissive default", () => {
    expect(rendersLeaseDocument("agency_template")).toBe(false)
    expect(rendersLeaseDocument(undefined)).toBe(false)
    expect(rendersLeaseDocument(null)).toBe(false)
  })
})

describe("org default ↔ lease source", () => {
  it("maps 'external' to 'uploaded' and null to decide-per-lease", () => {
    expect(leaseSourceFromOrgDefault("pleks")).toBe("pleks")
    expect(leaseSourceFromOrgDefault("external")).toBe("uploaded")
    expect(leaseSourceFromOrgDefault(null)).toBeNull()
    expect(leaseSourceFromOrgDefault("uploaded")).toBeNull()
  })

  it("accepts only the org column's own vocabulary", () => {
    expect(isOrgLeaseSourceDefault("external")).toBe(true)
    expect(isOrgLeaseSourceDefault("uploaded")).toBe(false)
    expect(isOrgLeaseSourceDefault(undefined)).toBe(false)
  })
})
