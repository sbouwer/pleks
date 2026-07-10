/**
 * lib/org/capabilities.test.ts — org-type capability surface gates
 *
 * Notes:  Locks the 2026-07-10 product ruling: HOA is a STANDALONE service, never bundled into a
 *         rental-agent package. hasHOA drives the /hoa nav item in both Sidebar and MobileMoreSheet,
 *         so a regression here silently re-advertises a surface no residential package sells.
 */
import { describe, it, expect } from "vitest"
import { getOrgCapabilities } from "./capabilities"

describe("getOrgCapabilities — HOA is standalone, never bundled (2026-07-10 ruling)", () => {
  it.each(["agency", "sole_prop", "landlord"] as const)(
    "%s (a residential package) does NOT surface HOA",
    (orgType) => {
      expect(getOrgCapabilities(orgType, "Acme").hasHOA).toBe(false)
    },
  )

  it("the standalone hoa_manager line DOES surface HOA", () => {
    expect(getOrgCapabilities("hoa_manager", "Acme Schemes").hasHOA).toBe(true)
  })

  it("retiring HOA leaves the rest of the agency surface intact", () => {
    const caps = getOrgCapabilities("agency", "Acme")
    expect(caps.hasLeases).toBe(true)
    expect(caps.hasTenants).toBe(true)
    expect(caps.hasApplications).toBe(true)
    expect(caps.hasLandlordsList).toBe(true)
    expect(caps.trustAccountLabel).toBe("trust")
  })

  it("the hoa_manager line stays lease-less with scheme-funds framing", () => {
    const caps = getOrgCapabilities("hoa_manager", "Acme Schemes")
    expect(caps.hasLeases).toBe(false)
    expect(caps.hasTenants).toBe(false)
    expect(caps.hasApplications).toBe(false)
    expect(caps.trustAccountLabel).toBe("scheme_funds")
  })
})
