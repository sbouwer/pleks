import { describe, it, expect } from "vitest"
import { safeRedirect } from "@/lib/auth/safe-redirect"

describe("safeRedirect — open-redirect guard", () => {
  it("null → /dashboard",        () => expect(safeRedirect(null)).toBe("/dashboard"))
  it("undefined → /dashboard",   () => expect(safeRedirect(undefined)).toBe("/dashboard"))
  it("empty string → /dashboard",() => expect(safeRedirect("")).toBe("/dashboard"))

  it("relative path passes",     () => expect(safeRedirect("/properties")).toBe("/properties"))
  it("deep path passes",         () => expect(safeRedirect("/finance/trust-ledger")).toBe("/finance/trust-ledger"))
  it("path with query passes",   () => expect(safeRedirect("/dashboard?tab=overview")).toBe("/dashboard?tab=overview"))

  it("no leading slash → /dashboard",   () => expect(safeRedirect("evil.com")).toBe("/dashboard"))
  it("protocol-relative → /dashboard", () => expect(safeRedirect("//evil.com")).toBe("/dashboard"))
  it("backslash quirk → /dashboard",   () => expect(safeRedirect("/\\evil.com")).toBe("/dashboard"))
  // eslint-disable-next-line sonarjs/no-clear-text-protocols
  it("http absolute → /dashboard",     () => expect(safeRedirect("http://evil.com")).toBe("/dashboard"))
  it("https absolute → /dashboard",    () => expect(safeRedirect("https://evil.com/path")).toBe("/dashboard"))

  it("custom fallback used",     () => expect(safeRedirect(null, "/login")).toBe("/login"))
  it("custom fallback with bad input", () => expect(safeRedirect("//evil.com", "/login")).toBe("/login"))

  // Auth-flow internals are machinery, never valid post-auth destinations
  it("rejects /welcome",                   () => expect(safeRedirect("/welcome")).toBe("/dashboard"))
  it("rejects /welcome/secure subpath",    () => expect(safeRedirect("/welcome/secure")).toBe("/dashboard"))
  it("rejects /auth/resolver",             () => expect(safeRedirect("/auth/resolver")).toBe("/dashboard"))
  it("rejects /auth/callback",             () => expect(safeRedirect("/auth/callback")).toBe("/dashboard"))
  it("rejects /login",                     () => expect(safeRedirect("/login")).toBe("/dashboard"))
  it("rejects /login/mfa subpath",         () => expect(safeRedirect("/login/mfa")).toBe("/dashboard"))
  it("rejects /onboarding",               () => expect(safeRedirect("/onboarding")).toBe("/dashboard"))
  it("boundary: /welcomers is not /welcome", () => expect(safeRedirect("/welcomers")).toBe("/welcomers"))
  it("boundary: /loginpage is not /login",   () => expect(safeRedirect("/loginpage")).toBe("/loginpage"))
})
