/**
 * app/(dashboard)/listings/[slug]/compare/__tests__/comparable.test.ts — A9: the compare link is offered only when it leads somewhere
 *
 * Notes:  Probed both ways. PLANTED: one comparable application (or several that the page would filter out) offers no
 *         link; two do. The link carries the listing id the page reads as ?listing, and the page reads the same set.
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { COMPARABLE_STAGE1, compareHref, isComparable } from "../comparable"

describe("compareHref", () => {
  it("two comparable applications → the compare page for this listing", () => {
    expect(compareHref("sea-view-2", "lst-1", ["pre_screen_complete", "shortlisted"]))
      .toBe("/listings/sea-view-2/compare?listing=lst-1")
  })

  it("PLANTED: fewer than two comparable → no link, whatever else is submitted", () => {
    expect(compareHref("s", "l", [])).toBeNull()
    expect(compareHref("s", "l", ["shortlisted"])).toBeNull()
    expect(compareHref("s", "l", ["shortlisted", "documents_submitted", "not_shortlisted", null])).toBeNull()
  })

  it("encodes both values into their own segment and parameter", () => {
    expect(compareHref("a/b", "x&y", ["shortlisted", "shortlisted"])).toBe("/listings/a%2Fb/compare?listing=x%26y")
  })
})

describe("the page reads the set the link counts", () => {
  it("isComparable is exactly COMPARABLE_STAGE1", () => {
    for (const s of COMPARABLE_STAGE1) expect(isComparable(s)).toBe(true)
    for (const s of ["pending_documents", "documents_submitted", "extracting", "not_shortlisted", null]) expect(isComparable(s)).toBe(false)
  })

  it("PLANTED: the compare page filters on the shared constant and on ?listing, not a literal or ?ids", () => {
    const page = readFileSync("app/(dashboard)/listings/[slug]/compare/page.tsx", "utf8")
    expect(page).toContain(`.in("stage1_status", [...COMPARABLE_STAGE1])`)
    expect(page).toContain(`searchParams.get("listing")`)
    expect(page).not.toContain(`searchParams.get("ids")`)
  })
})
