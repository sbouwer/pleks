/**
 * lib/auth/passkeys/__tests__/resolveAuthenticatorName.test.ts — the vendored registry is real
 *
 * Notes:  ADDENDUM_62F §1.1. The risk this guards is not "the function has a bug" — it is that the
 *         VENDORED FILE is wrong, truncated, or hand-edited. A wrong AAGUID labels a Windows Hello
 *         key "iCloud Keychain", the user assumes it syncs, and they lock themselves out of the
 *         device-bound credential §1 exists to warn them about. So the assertions are about the
 *         data, not the lookup.
 */
import { describe, expect, it } from "vitest"
import {
  resolveAuthenticatorName,
  authenticatorDisplayName,
  REGISTRY_ENTRY_COUNT,
} from "../resolveAuthenticatorName"
import registry from "../aaguid-registry.json"

describe("AAGUID registry — vendored data integrity", () => {
  it("is populated (a truncated or emptied file must not pass silently)", () => {
    // Fetched 2026-08-16 with 54 entries. A floor rather than an equality so upstream additions
    // don't fail the build, but a gutted file does.
    expect(REGISTRY_ENTRY_COUNT).toBeGreaterThanOrEqual(40)
  })

  it("every key is a well-formed lowercase UUID and every entry has a name", () => {
    // Catches hand-editing, which the module header forbids: the most likely corruption is someone
    // adding an entry from memory with a plausible-looking but wrong UUID.
    const entries = Object.entries(registry as Record<string, string>)
    for (const [aaguid, name] of entries) {
      expect(aaguid, `${aaguid} is not a lowercase UUID`).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(typeof name === "string" && name.length > 0, `${aaguid} has no name (or the file was re-vendored unstripped)`).toBe(true)
    }
  })

  it("resolves the providers §1 names by their real AAGUIDs", () => {
    // These UUIDs come from the fetched file, not from memory. If the vendored file is ever
    // replaced by a bad one, this is the assertion that fails.
    expect(resolveAuthenticatorName("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4")).toBe("Google Password Manager")
    expect(resolveAuthenticatorName("08987058-cadc-4b81-b6e1-30de50dcbe96")).toBe("Windows Hello")
    expect(resolveAuthenticatorName("bada5566-a7aa-401f-bd96-45619a55120d")).toBe("1Password")
    expect(resolveAuthenticatorName("d548826e-79b4-db40-a3d8-11116f7e8349")).toBe("Bitwarden")
    expect(resolveAuthenticatorName("531126d6-e717-415c-9320-3d9aa6981239")).toBe("Dashlane")
  })
})

describe("resolveAuthenticatorName — unknown input returns null, never a guess", () => {
  it.each<[string, string | null | undefined]>([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["the all-zero anonymous AAGUID", "00000000-0000-0000-0000-000000000000"],
    ["an AAGUID not in the registry", "ffffffff-ffff-ffff-ffff-ffffffffffff"],
  ])("%s → null", (_label, input) => {
    // Null, not a placeholder. The caller decides how to render an unknown authenticator; a
    // plausible-but-wrong label in front of a security decision is the failure mode.
    expect(resolveAuthenticatorName(input)).toBeNull()
  })

  it("is case- and whitespace-insensitive (WebAuthn libraries differ on casing)", () => {
    expect(resolveAuthenticatorName("  EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4 ")).toBe("Google Password Manager")
  })

  it("authenticatorDisplayName falls back to a neutral label", () => {
    expect(authenticatorDisplayName(null)).toBe("Passkey")
    expect(authenticatorDisplayName("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4")).toBe("Google Password Manager")
  })
})
