import { describe, it, expect } from "vitest"
import { ROUTE_MANIFEST, AGENT_ROLES } from "@/lib/routing/manifest"

const AGENT_ROLE_SET = AGENT_ROLES as readonly string[]
const AGENT_ONLY_ROUTES = Object.entries(ROUTE_MANIFEST)
  .filter(([, rule]) => rule.auth && !rule.skipOrgCheck && rule.roles?.every(r => AGENT_ROLE_SET.includes(r)))
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

  it("/help is reachable by all authenticated roles (no role restriction) — BUILD_68 OQ1=A", () => {
    const rule = ROUTE_MANIFEST["/help"]
    expect(rule.auth).toBe(true)
    expect(rule.roles).toBeUndefined()       // not agent-gated → tenant/landlord/supplier can reach it
    expect(rule.skipOrgCheck).toBe(true)
  })

  it("/help/fitscore-report stays agent-only (its URL is stamped into screening PDFs)", () => {
    const rule = ROUTE_MANIFEST["/help/fitscore-report"]
    expect(rule).toBeDefined()
    expect(rule.roles).toEqual(AGENT_ROLES)   // agent-only (every agent-class role; no portal role)
    expect(rule.requiresAal2).toBeFalsy()    // AAL1, as it was under the old /help rule
  })

  it("every other agent route requires AAL2", () => {
    // Guard the assertion below from passing vacuously: if the AGENT_ONLY_ROUTES filter ever yields [] (a rule
    // shape change), "no AAL1 agent routes" would be trivially true having checked nothing.
    expect(AGENT_ONLY_ROUTES.length).toBeGreaterThan(3)
    const aal1AgentRoutes = AGENT_ONLY_ROUTES.filter(
      p => p !== "/settings" && p !== "/help" && p !== "/help/fitscore-report" && !ROUTE_MANIFEST[p]?.requiresAal2
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
