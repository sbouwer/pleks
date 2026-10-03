import { describe, it, expect } from "vitest"
import { applicationStoragePrefix, parseDocKey, pathBelongsToSubject, subjectUploadPath, type ApplicantSubject } from "./applicationStoragePath"
import { allDocCategoryKeys } from "./docCategories"

const ORG = "11111111-1111-1111-1111-111111111111"
const APP = "22222222-2222-2222-2222-222222222222"
const VICTIM_ORG = "99999999-9999-9999-9999-999999999999"
const LEAD: ApplicantSubject = { kind: "lead" }
const CO_A: ApplicantSubject = { kind: "co", coId: "aaaa" }
const ROOT = `applications/${ORG}/${APP}`

/**
 * Subject binding (DECISIONS 2026-10-03, scout R4). Bound only to the application, a co token could name the
 * lead's or a sibling's file and the service client downloaded it — and sent it to the processor. Both ways:
 * each subject reaches its own folder, and nobody else's.
 */
describe("pathBelongsToSubject — each party reaches only its own folder", () => {
  it("the lead reaches a file in the root", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `${ROOT}/bank_main.pdf`)).toBe(true)
  })
  it("a co reaches a file in its own co_ folder", () => {
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/co_aaaa/bank_main.pdf`)).toBe(true)
  })
  it("REJECTS the lead naming a co's file", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `${ROOT}/co_aaaa/id.jpg`)).toBe(false)
  })
  it("REJECTS a co naming the lead's file", () => {
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/bank_main.pdf`)).toBe(false)
  })
  it("REJECTS a co naming a sibling co's file, including one whose id extends its own", () => {
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/co_bbbb/id.jpg`)).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/co_aaaab/id.jpg`)).toBe(false)
  })
  it("REJECTS a nested path, and the folder itself", () => {
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/co_aaaa/x/id.jpg`)).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, CO_A, `${ROOT}/co_aaaa/`)).toBe(false)
  })
})

describe("subjectUploadPath — the server builds the upload key", () => {
  it("puts a single slot at its canonical key in the subject's folder", () => {
    expect(subjectUploadPath(ORG, APP, LEAD, "bank_main", "PDF", true, "0a1b2c3d")).toBe(`${ROOT}/bank_main.pdf`)
    expect(subjectUploadPath(ORG, APP, CO_A, "bank_main", "png", true, "0a1b2c3d")).toBe(`${ROOT}/co_aaaa/bank_main.png`)
  })
  it("gives a multi slot a random suffix", () => {
    expect(subjectUploadPath(ORG, APP, LEAD, "payslips", "pdf", false, "0a1b2c3d")).toBe(`${ROOT}/payslips_0a1b2c3d.pdf`)
  })
  it("every built path passes the subject's own guard", () => {
    for (const s of [LEAD, CO_A]) {
      expect(pathBelongsToSubject(ORG, APP, s, subjectUploadPath(ORG, APP, s, "payslips_2", "jpg", false, "deadbeef"))).toBe(true)
    }
  })
  it("REJECTS an unlisted slot, a foreign extension, and a non-hex suffix", () => {
    expect(subjectUploadPath(ORG, APP, LEAD, "../../x", "pdf", true, "0a1b2c3d")).toBeNull()
    expect(subjectUploadPath(ORG, APP, LEAD, "bank_main", "html", true, "0a1b2c3d")).toBeNull()
    expect(subjectUploadPath(ORG, APP, LEAD, "bank_main", "pdf/../x", true, "0a1b2c3d")).toBeNull()
    expect(subjectUploadPath(ORG, APP, LEAD, "payslips", "pdf", false, "../x")).toBeNull()
  })
})

describe("pathBelongsToSubject — the cross-tenant storage guard", () => {
  it("accepts a file inside the application's own folder", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${ORG}/${APP}/bank_statement.pdf`)).toBe(true)
  })

  it("REJECTS another org's path (the IDOR)", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${VICTIM_ORG}/${APP}/bank_statement.pdf`)).toBe(false)
  })

  it("REJECTS another application's path in the same org", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${ORG}/33333333-3333-3333-3333-333333333333/x.pdf`)).toBe(false)
  })

  it("REJECTS a sibling app whose id is a prefix of the owned id (trailing-slash guard)", () => {
    // owned app id is APP; a path under `${APP}extra` must not match
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${ORG}/${APP}extra/x.pdf`)).toBe(false)
  })

  it("REJECTS path traversal", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${ORG}/${APP}/../../${VICTIM_ORG}/a/x.pdf`)).toBe(false)
  })

  /**
   * These four FAIL on the pre-fix guard, which tested `path.includes("..")` — none of them contains a
   * literal `..`, and every one starts with the owned prefix, so both of the old tests passed them
   * straight through. storage-js interpolates the key raw and the WHATWG URL parser resolves the encoded
   * dot segments before fetch sends them: measured, all three encodings land on `/orgB/appB/…`.
   */
  it("REJECTS percent-encoded dot segments after a valid prefix", () => {
    const enc = (mid: string) => `applications/${ORG}/${APP}/${mid}/${VICTIM_ORG}/victim/id.jpg`
    expect(pathBelongsToSubject(ORG, APP, LEAD, enc("%2e%2e/%2e%2e/%2e%2e"))).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, LEAD, enc("%2E%2E/%2E%2E/%2E%2E"))).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, LEAD, enc(".%2e/.%2e/.%2e"))).toBe(false)
    // Double-encoded — the shape that defeats a single decode-then-check.
    expect(pathBelongsToSubject(ORG, APP, LEAD, enc("%252e%252e"))).toBe(false)
  })

  it("still accepts a legitimate filename containing dots", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, `applications/${ORG}/${APP}/bank.statement.v2.pdf`)).toBe(true)
  })

  it("REJECTS empty / missing path", () => {
    expect(pathBelongsToSubject(ORG, APP, LEAD, "")).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, LEAD, undefined)).toBe(false)
    expect(pathBelongsToSubject(ORG, APP, LEAD, null)).toBe(false)
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
describe("parseDocKey — the upload allowlist", () => {
  it("accepts every slot the wizard can ask for, unindexed", () => {
    for (const key of allDocCategoryKeys()) {
      expect(parseDocKey(key)?.canonical, key).toBe(key)
    }
  })

  it("accepts an indexed slot — a bare set-membership test would reject these", () => {
    expect(parseDocKey("payslips_1")?.canonical).toBe("payslips_1")
    expect(parseDocKey("payslips_2")?.canonical).toBe("payslips_2")
    expect(parseDocKey("other_0")?.canonical).toBe("other_0")
    // Multi-digit: the index is a digit RUN, not a single digit.
    expect(parseDocKey("payslips_12")?.canonical).toBe("payslips_12")
  })

  it("splits an indexed slot into its set member and index", () => {
    expect(parseDocKey("payslips_2")).toEqual({ key: "payslips", index: "2", canonical: "payslips_2" })
    expect(parseDocKey("bank_main")).toEqual({ key: "bank_main", index: null, canonical: "bank_main" })
  })

  it("REJECTS every traversal spelling — encoding is irrelevant to a closed set", () => {
    for (const hostile of [
      "../../../victim",
      "..",
      "%2e%2e%2f%2e%2e",
      "%2E%2E/x",
      ".%2e/.%2e",
      "%252e%252e",
      `../../../${VICTIM_ORG}/victim/id`,
      "payslips/../../../x",
    ]) {
      expect(parseDocKey(hostile), hostile).toBeNull()
    }
  })

  it("REJECTS a plausible-but-unlisted key", () => {
    // The classifier's vocabulary is a DIFFERENT namespace — hyphenated, and not an upload contract.
    expect(parseDocKey("id-document")).toBeNull()
    expect(parseDocKey("bank-statement")).toBeNull()
    expect(parseDocKey("")).toBeNull()
    expect(parseDocKey(null)).toBeNull()
    expect(parseDocKey(undefined)).toBeNull()
  })

  it("REJECTS a non-numeric or oversized suffix", () => {
    expect(parseDocKey("payslips_abc")).toBeNull()
    expect(parseDocKey("payslips_1a")).toBeNull()
    expect(parseDocKey("payslips_9999")).toBeNull()
    // Co-applicant subfolders are not an upload-route shape yet — the route registers subjectRef
    // "primary" only, and agent-side co/director uploads arrive with §5b.
    expect(parseDocKey("co_abc123/id")).toBeNull()
  })

  it("never returns caller-controlled text — canonical is rebuilt from the matched member", () => {
    const parsed = parseDocKey("payslips_007")
    expect(parsed).not.toBeNull()
    expect(allDocCategoryKeys().has(parsed!.key)).toBe(true)
    expect(parsed!.canonical).toBe(`${parsed!.key}_${parsed!.index}`)
  })
})
