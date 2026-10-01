/**
 * lib/searchworx/__tests__/envelopeMeta.test.ts — the stored envelope carries metadata and never the report
 *
 * Notes:  Both directions: a planted unknown billing key at envelope and SearchInformation level must
 *         survive (it is what the column exists to catch), and every subject-bearing part — the payload
 *         values, SearchDescription, the PDF bearer link, nested objects — must not.
 */
import { describe, expect, it } from "vitest"
import { envelopeMeta } from "../envelopeMeta"

const ID = "8001015009087"

const envelope = {
  ResponseMessage: "CombinedConsumerCreditReport",
  PDFCopyURL: "https://vendor.example/report.pdf?t=secret",
  TransactionCost: 194.1,
  Nested: { IDNumber: ID },
  ResponseObject: {
    SearchInformation: {
      SearchToken: "tok-1",
      SearchID: 42,
      SearchDescription: `Combined report for ${ID}`,
      ChargedAmount: "194.10",
      Subject: { IDNumber: ID },
    },
    CombinedCreditInformation: { TransUnion: { IDNumber: ID } },
    PersonInformation: { IDNumber: ID, FirstName: "Test" },
  },
}

describe("envelopeMeta", () => {
  const meta = envelopeMeta(envelope)
  const stored = JSON.stringify(meta)

  it("keeps an unknown billing key at envelope and SearchInformation level", () => {
    expect(meta.top.TransactionCost).toBe(194.1)
    expect(meta.searchInformation?.ChargedAmount).toBe("194.10")
    expect(meta.top.ResponseMessage).toBe("CombinedConsumerCreditReport")
    expect(meta.searchInformation?.SearchToken).toBe("tok-1")
  })

  it("records the payload's key names, not its values", () => {
    expect(meta.responseObjectKeys).toEqual(["SearchInformation", "CombinedCreditInformation", "PersonInformation"])
  })

  it("never stores the subject's ID, SearchDescription, the PDF link or a nested object", () => {
    expect(stored).not.toContain(ID)
    expect(stored).not.toContain("SearchDescription")
    expect(stored).not.toContain("vendor.example")
    expect(meta.top).not.toHaveProperty("Nested")
    expect(meta.searchInformation).not.toHaveProperty("Subject")
    expect(meta.hasPdfCopyUrl).toBe(true)
  })

  it("reads an array payload from its first element", () => {
    const m = envelopeMeta({ ResponseMessage: "x", ResponseObject: [{ SearchInformation: { SearchID: 1 }, Company: {} }] })
    expect(m.responseObjectKeys).toEqual(["SearchInformation", "Company"])
    expect(m.searchInformation).toEqual({ SearchID: 1 })
  })

  it("degrades to an empty shape on a malformed body", () => {
    expect(envelopeMeta(null)).toEqual({ top: {}, searchInformation: null, responseObjectKeys: [], hasPdfCopyUrl: false })
  })
})
