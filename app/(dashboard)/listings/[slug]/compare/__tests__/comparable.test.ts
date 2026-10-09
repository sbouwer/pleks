/**
 * app/(dashboard)/listings/[slug]/compare/__tests__/comparable.test.ts — A9: the compare link is offered only when it leads somewhere
 *
 * Notes:  Probed both ways. PLANTED: one comparable application (or several that the page would filter out) offers no
 *         link; two do. The page is read as SOURCE for the properties a unit test cannot reach without a database:
 *         it filters exactly as the listing page counts (shared stage set, submitted, not deleted), binds to the
 *         active org, and never selects the bank-extraction column (walker F1/F2/F4 + G1/G4, .handoff/a9/02-03).
 */
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { COMPARABLE_STAGE1, compareHref, isComparable } from "../comparable"

describe("compareHref", () => {
  it("two comparable applications → the compare page for this listing", () => {
    expect(compareHref("sea-view-2", ["pre_screen_complete", "shortlisted"])).toBe("/listings/sea-view-2/compare")
  })

  it("PLANTED: fewer than two comparable → no link, whatever else is submitted", () => {
    expect(compareHref("s", [])).toBeNull()
    expect(compareHref("s", ["shortlisted"])).toBeNull()
    expect(compareHref("s", ["shortlisted", "documents_submitted", "not_shortlisted", null])).toBeNull()
  })

  it("encodes the slug into its own segment", () => {
    expect(compareHref("a/b?c", ["shortlisted", "shortlisted"])).toBe("/listings/a%2Fb%3Fc/compare")
  })

  it("isComparable is exactly COMPARABLE_STAGE1", () => {
    for (const s of COMPARABLE_STAGE1) expect(isComparable(s)).toBe(true)
    for (const s of ["pending_documents", "documents_submitted", "extracting", "not_shortlisted", null]) expect(isComparable(s)).toBe(false)
  })
})

describe("the page reads the set the link counts, in the active org, without the bank-extraction column", () => {
  const page = readFileSync("app/(dashboard)/listings/[slug]/compare/page.tsx", "utf8")
  const listing = readFileSync("app/(dashboard)/listings/[slug]/(overview)/page.tsx", "utf8")

  it("PLANTED: same stage set, and the listing page's submitted + not-deleted filters on both sides", () => {
    expect(page).toContain(`.in("stage1_status", [...COMPARABLE_STAGE1])`)
    for (const f of [`.not("submitted_at", "is", null)`, `.is("deleted_at", null)`]) {
      expect(page, f).toContain(f)
      expect(listing, f).toContain(f)
    }
  })

  it("PLANTED: a server page on gatewaySSR, scoped to the active org on both reads", () => {
    expect(page).not.toMatch(/^"use client"/m)
    expect(page).not.toContain("@/lib/supabase/client")
    expect(page).toContain("gatewaySSR()")
    expect(page.match(/\.eq\("org_id", orgId\)/g)?.length).toBe(2)
  })

  it("PLANTED: no bank-extraction column and no wildcard select reach the page", () => {
    expect(page).not.toContain("bank_statement_extracted")
    expect(page).not.toMatch(/select\(\s*["'`]\*/)
  })
})
