/**
 * lib/auth/__tests__/decisions.test.ts — ADDENDUM_AUTH_CONTRACT §6
 *
 * Table-driven, one test per §3 truth-table row plus the gate matrix.
 * Green = contract holds; red = a precise, named broken behaviour.
 */
import { describe, it, expect } from "vitest"
import {
  resolveAuthDestination, routeGateDecision, requiredAssurance,
  canAccessPath, mfaMandatoryFor, type AuthFacts,
} from "@/lib/auth/decisions"

const base: AuthFacts = {
  isAuthenticated: true,
  membership: { exists: true, roleClass: "agent", sessionRole: "owner", orgId: "org_1" },
  assurance:  { current: "aal2", hasVerifiedFactor: true },
  onboarding: { complete: false },
  consent:    { current: true },
  route: { path: "/dashboard", isPublic: false, requiresAal2: true, allowedRoles: ["owner"] },
  safeNext: null,
}
const f = (o: Partial<AuthFacts>): AuthFacts => ({
  ...base, ...o,
  membership: { ...base.membership, ...(o.membership ?? {}) },
  assurance:  { ...base.assurance,  ...(o.assurance  ?? {}) },
  onboarding: { ...base.onboarding, ...(o.onboarding ?? {}) },
  consent:    { ...base.consent,    ...(o.consent    ?? {}) },
  route:      { ...base.route,      ...(o.route      ?? {}) },
})

describe("resolveAuthDestination — §3 contract", () => {
  it("1: no session → login", () =>
    expect(resolveAuthDestination(f({ isAuthenticated: false, safeNext: null })))
      .toEqual({ kind: "login", redirect: null }))
  it("2: no session preserves target", () =>
    expect(resolveAuthDestination(f({ isAuthenticated: false, safeNext: "/properties" })))
      .toEqual({ kind: "login", redirect: "/properties" }))
  it("3: no membership, never onboarded → onboarding", () =>
    expect(resolveAuthDestination(f({ membership: { exists: false }, onboarding: { complete: false } })))
      .toEqual({ kind: "onboarding" }))
  it("4: no membership, was onboarded → severed", () =>
    expect(resolveAuthDestination(f({ membership: { exists: false }, onboarding: { complete: true } })))
      .toEqual({ kind: "severed" }))
  it("5: agent, aal1, NO factor → enrol (no-factor loop fix)", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: false }, safeNext: "/dashboard",
    }))).toEqual({ kind: "mfa_enrol", redirect: "/dashboard" }))
  it("6: agent, aal1, has factor → verify", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: true }, safeNext: "/dashboard",
    }))).toEqual({ kind: "mfa_verify", redirect: "/dashboard" }))
  it("7: agent, aal2, consent current → destination", () =>
    expect(resolveAuthDestination(f({ safeNext: "/dashboard", consent: { current: true } })))
      .toEqual({ kind: "app", path: "/dashboard", pendingConsent: false }))
  it("8: agent, aal2, consent stale → destination + pending", () =>
    expect(resolveAuthDestination(f({ safeNext: "/dashboard", consent: { current: false } })))
      .toEqual({ kind: "app", path: "/dashboard", pendingConsent: true }))
  it("9: tenant, aal1, no factor → straight through", () =>
    expect(resolveAuthDestination(f({
      membership: { exists: true, roleClass: "tenant", sessionRole: "tenant" },
      assurance:  { current: "aal1", hasVerifiedFactor: false },
      route:      { ...base.route, requiresAal2: false }, safeNext: "/tenant/x",
    }))).toEqual({ kind: "app", path: "/tenant/x", pendingConsent: false }))
  it("10: agent redirect into tenant space → rejected, default", () =>
    expect(resolveAuthDestination(f({ safeNext: "/tenant/abc" })))
      .toEqual({ kind: "app", path: "/dashboard", pendingConsent: false }))
  it("11: landlord, no redirect → landlord default", () =>
    expect(resolveAuthDestination(f({
      membership: { exists: true, roleClass: "landlord", sessionRole: "landlord" }, safeNext: null,
    }))).toEqual({ kind: "app", path: "/landlord/dashboard", pendingConsent: false }))
  it("12: landlord, aal1 → straight through", () =>
    expect(resolveAuthDestination(f({
      membership: { exists: true, roleClass: "landlord", sessionRole: "landlord" },
      assurance:  { current: "aal1", hasVerifiedFactor: false },
      route:      { ...base.route, requiresAal2: false }, safeNext: "/landlord/x",
    }))).toEqual({ kind: "app", path: "/landlord/x", pendingConsent: false }))
  it("13: agent honours in-class redirect", () =>
    expect(resolveAuthDestination(f({ safeNext: "/properties" })))
      .toEqual({ kind: "app", path: "/properties", pendingConsent: false }))
  it("14: agent honours deep in-class redirect", () =>
    expect(resolveAuthDestination(f({ safeNext: "/finance/trust-ledger" })))
      .toEqual({ kind: "app", path: "/finance/trust-ledger", pendingConsent: false }))

  // first_login: fires when everAccepted === false (explicitly) AND no MFA factor
  it("15: first-time agent — no terms ever, no factor → first_login", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: false },
      consent:   { current: false, everAccepted: false },
    }))).toEqual({ kind: "first_login", redirect: null }))
  it("16: first_login preserves redirect target", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: false },
      consent:   { current: false, everAccepted: false },
      safeNext:  "/dashboard",
    }))).toEqual({ kind: "first_login", redirect: "/dashboard" }))
  it("17: everAccepted=true, stale consent, no factor → still mfa_enrol (not first_login)", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: false },
      consent:   { current: false, everAccepted: true },
      safeNext:  "/dashboard",
    }))).toEqual({ kind: "mfa_enrol", redirect: "/dashboard" }))
  it("18: no factor, everAccepted=undefined (gate default) → not first_login", () =>
    expect(resolveAuthDestination(f({
      assurance: { current: "aal1", hasVerifiedFactor: false },
      consent:   { current: false },
      safeNext:  "/dashboard",
    }))).toEqual({ kind: "mfa_enrol", redirect: "/dashboard" }))
})

describe("requiredAssurance — purely route-driven (no class override)", () => {
  it("aal2 route → aal2 regardless of class", () =>
    expect(requiredAssurance(f({}))).toBe("aal2"))  // base.route.requiresAal2 = true
  it("agent on non-aal2 route (e.g. /settings for enrolment) → aal1", () =>
    expect(requiredAssurance(f({ route: { ...base.route, requiresAal2: false } }))).toBe("aal1"))
  it("tenant on non-aal2 route → aal1", () =>
    expect(requiredAssurance(f({
      membership: { exists: true, roleClass: "tenant", sessionRole: "tenant" },
      route: { ...base.route, requiresAal2: false },
    }))).toBe("aal1"))
  it("tenant on an aal2 route → aal2 (route can demand it)", () =>
    expect(requiredAssurance(f({
      membership: { exists: true, roleClass: "tenant", sessionRole: "tenant" },
      route: { ...base.route, requiresAal2: true },
    }))).toBe("aal2"))
})

describe("mfaMandatoryFor — D3", () => {
  it("agent yes", () => expect(mfaMandatoryFor("agent")).toBe(true))
  it("tenant no",  () => expect(mfaMandatoryFor("tenant")).toBe(false))
  it("landlord no",() => expect(mfaMandatoryFor("landlord")).toBe(false))
  it("supplier no",() => expect(mfaMandatoryFor("supplier")).toBe(false))
})

describe("canAccessPath — cross-class redirect guard", () => {
  it("agent owns /properties",      () => expect(canAccessPath("agent",  "/properties")).toBe(true))
  it("agent not /tenant/x",         () => expect(canAccessPath("agent",  "/tenant/x")).toBe(false))
  it("tenant owns /tenant/lease/1", () => expect(canAccessPath("tenant", "/tenant/lease/1")).toBe(true))
  it("tenant not /dashboard",       () => expect(canAccessPath("tenant", "/dashboard")).toBe(false))
  it("prefix boundary: /tenanting is not /tenant", () =>
    expect(canAccessPath("tenant", "/tenanting")).toBe(false))
})

describe("routeGateDecision — middleware brain, fail-closed", () => {
  it("public → allow", () =>
    expect(routeGateDecision(f({ route: { ...base.route, isPublic: true } }))).toEqual({ action: "allow" }))
  it("no session on protected → login", () =>
    expect(routeGateDecision(f({ isAuthenticated: false }))).toEqual({ action: "to_login" }))
  it("aal1 on aal2 route → resolver", () =>
    expect(routeGateDecision(f({ assurance: { current: "aal1", hasVerifiedFactor: true } })))
      .toEqual({ action: "to_resolver" }))
  it("missing role on role-gated route → resolver (FAIL-CLOSED)", () =>
    expect(routeGateDecision(f({ membership: { exists: true, roleClass: "agent", sessionRole: undefined } })))
      .toEqual({ action: "to_resolver" }))
  it("wrong role → forbidden", () =>
    expect(routeGateDecision(f({ membership: { exists: true, roleClass: "tenant", sessionRole: "tenant" } })))
      .toEqual({ action: "forbidden" }))
  it("right role + aal2 → allow", () =>
    expect(routeGateDecision(f({}))).toEqual({ action: "allow" }))
})
