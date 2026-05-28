import { describe, it, expect } from "vitest"
import { ROUTE_MANIFEST } from "@/lib/routing/manifest"

const AGENT_ONLY_ROUTES = Object.entries(ROUTE_MANIFEST)
  .filter(([, rule]) => rule.auth && !rule.skipOrgCheck && rule.roles?.every(r =>
    ["owner", "property_manager", "agent", "accountant", "maintenance_manager"].includes(r)
  ))
  .map(([path]) => path)

describe("ROUTE_MANIFEST — structural invariants", () => {
  it("/settings is AAL1-accessible (enrolment must work before AAL2)", () => {
    const rule = ROUTE_MANIFEST["/settings"]
    expect(rule).toBeDefined()
    expect(rule.requiresAal2).toBeFalsy()
  })

  it("/help is AAL1-accessible", () => {
    const rule = ROUTE_MANIFEST["/help"]
    expect(rule).toBeDefined()
    expect(rule.requiresAal2).toBeFalsy()
  })

  it("every other agent route requires AAL2", () => {
    const aal1AgentRoutes = AGENT_ONLY_ROUTES.filter(
      p => p !== "/settings" && p !== "/help" && !ROUTE_MANIFEST[p]?.requiresAal2
    )
    expect(aal1AgentRoutes).toEqual([])
  })

  it("/login/mfa has skipOrgCheck so gate does not touch org cookies during MFA", () => {
    expect(ROUTE_MANIFEST["/login/mfa"]?.skipOrgCheck).toBe(true)
  })

  it("/onboarding/severed has skipOrgCheck so users with no org can reach it", () => {
    expect(ROUTE_MANIFEST["/onboarding/severed"]?.skipOrgCheck).toBe(true)
  })

  it("/settings/security/enrol-totp is covered by /settings prefix (auth + agent roles, no AAL2)", () => {
    const rule = ROUTE_MANIFEST["/settings"]
    expect(rule?.auth).toBe(true)
    expect(rule?.requiresAal2).toBeFalsy()
  })

  it("tenant portal has skipOrgCheck", () => {
    expect(ROUTE_MANIFEST["/tenant"]?.skipOrgCheck).toBe(true)
  })

  it("landlord portal has skipOrgCheck", () => {
    expect(ROUTE_MANIFEST["/landlord"]?.skipOrgCheck).toBe(true)
  })
})
