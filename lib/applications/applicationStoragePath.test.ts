import { describe, it, expect } from "vitest"
import { applicationStoragePrefix, pathBelongsToApplication } from "./applicationStoragePath"

const ORG = "11111111-1111-1111-1111-111111111111"
const APP = "22222222-2222-2222-2222-222222222222"
const VICTIM_ORG = "99999999-9999-9999-9999-999999999999"

describe("pathBelongsToApplication — the cross-tenant storage guard", () => {
  it("accepts a file inside the application's own folder", () => {
    expect(pathBelongsToApplication(ORG, APP, `applications/${ORG}/${APP}/bank_statement.pdf`)).toBe(true)
  })

  it("accepts a co-applicant subfolder file", () => {
    expect(pathBelongsToApplication(ORG, APP, `applications/${ORG}/${APP}/co_abc/id.jpg`)).toBe(true)
  })

  it("REJECTS another org's path (the IDOR)", () => {
    expect(pathBelongsToApplication(ORG, APP, `applications/${VICTIM_ORG}/${APP}/bank_statement.pdf`)).toBe(false)
  })

  it("REJECTS another application's path in the same org", () => {
    expect(pathBelongsToApplication(ORG, APP, `applications/${ORG}/33333333-3333-3333-3333-333333333333/x.pdf`)).toBe(false)
  })

  it("REJECTS a sibling app whose id is a prefix of the owned id (trailing-slash guard)", () => {
    // owned app id is APP; a path under `${APP}extra` must not match
    expect(pathBelongsToApplication(ORG, APP, `applications/${ORG}/${APP}extra/x.pdf`)).toBe(false)
  })

  it("REJECTS path traversal", () => {
    expect(pathBelongsToApplication(ORG, APP, `applications/${ORG}/${APP}/../../${VICTIM_ORG}/a/x.pdf`)).toBe(false)
  })

  it("REJECTS empty / missing path", () => {
    expect(pathBelongsToApplication(ORG, APP, "")).toBe(false)
    expect(pathBelongsToApplication(ORG, APP, undefined)).toBe(false)
    expect(pathBelongsToApplication(ORG, APP, null)).toBe(false)
  })

  it("prefix has the load-bearing trailing slash", () => {
    expect(applicationStoragePrefix(ORG, APP)).toBe(`applications/${ORG}/${APP}/`)
  })
})

/**
 * The WRITE side (BUILD_71 D10). Every case above hands the guard a path the caller SUPPLIED — the
 * applicant read routes. The upload route instead BUILDS the path from a caller-supplied `docKey`,
 * so the string always starts with the right prefix and only the interior is hostile. Reads were
 * bound and writes were not; these assert the guard holds on the constructed shape too.
 *
 * Why this matters more than it looks: storage-js does not normalise `..` (it only strips
 * leading/trailing slashes), and the URL parser resolves the segments before fetch sends them — so
 * `../../../{victimOrg}/…` lands outside the org prefix, uploaded with `upsert: true`, through the
 * service client that bypasses RLS.
 */
describe("pathBelongsToApplication — the constructed-path (upload) side", () => {
  const built = (docKey: string, ext = "jpg") => `applications/${ORG}/${APP}/${docKey}.${ext}`

  it("accepts the ordinary docKeys the applicant flow sends", () => {
    expect(pathBelongsToApplication(ORG, APP, built("id_document"))).toBe(true)
    expect(pathBelongsToApplication(ORG, APP, built("payslip_1"))).toBe(true)
    expect(pathBelongsToApplication(ORG, APP, built("co_abc123/id_document"))).toBe(true)
  })

  it("REJECTS a docKey that traverses to another org", () => {
    expect(pathBelongsToApplication(ORG, APP, built(`../../../${VICTIM_ORG}/victim/id_document`))).toBe(false)
  })

  it("REJECTS a docKey that traverses out of the bucket entirely", () => {
    expect(pathBelongsToApplication(ORG, APP, built("../../../../../../object/other-bucket/x"))).toBe(false)
  })

  it("REJECTS a bare dot-dot docKey", () => {
    expect(pathBelongsToApplication(ORG, APP, built(".."))).toBe(false)
  })
})
