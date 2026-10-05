/**
 * lib/reports/screening/_web/primitives/__tests__/EditorialHeadline.test.tsx — "Assessed with N of M" is the first line
 *
 * Notes:  ADDENDUM_14X §4 (walker 14x-p3 F4): the agent sees the stamp FIRST, ahead of the eyebrow and the headline;
 *         amber when a party did not complete; and a score with no stamp (pre-P3) renders no line at all.
 */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { EditorialHeadline } from "../EditorialHeadline"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"

const data = (assessedWith: FitScoreReportData["assessedWith"]) =>
  ({ applicants: [{}, {}], generatedAt: "2026-10-15T08:00:00Z", assessedWith }) as unknown as FitScoreReportData

describe("EditorialHeadline (web) — the N-of-M stamp", () => {
  it("renders the stamp before the eyebrow, in amber when a party did not complete", () => {
    const html = renderToStaticMarkup(<EditorialHeadline data={data({ n: 2, m: 3 })} />)
    const stamp = html.indexOf("Assessed with 2 of 3 parties")
    expect(stamp).toBeGreaterThan(-1)
    expect(stamp).toBeLessThan(html.indexOf("FITSCORE · STREAM 2"))
    expect(html.slice(0, stamp)).toContain("text-amber-700")
  })

  it("a complete roster is not amber", () => {
    const html = renderToStaticMarkup(<EditorialHeadline data={data({ n: 3, m: 3 })} />)
    expect(html).toContain("Assessed with 3 of 3 parties")
    expect(html).not.toContain("text-amber-700")
  })

  it("claims nothing for a score with no stamp", () => {
    expect(renderToStaticMarkup(<EditorialHeadline data={data(null)} />)).not.toContain("Assessed with")
  })
})
