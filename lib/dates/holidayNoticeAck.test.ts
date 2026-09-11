/**
 * lib/dates/holidayNoticeAck.test.ts — a gazette notice the table already cites stops alerting; nothing else does
 *
 * Notes: The asymmetry is the whole subject, so the probes are deliberately lopsided. ONE case may be
 *        silenced — a notice whose exact link is already cited by a proclamation row. Every near-miss
 *        must survive, because the cost of a wrongly-silenced proclamation is a statutory notice served
 *        on a day that is actually a public holiday, which is void. A wrongly-kept one costs an email.
 */
import { describe, it, expect } from "vitest"
import { partitionNotices } from "./holidayAuditFetch"
import { SA_PUBLIC_HOLIDAYS } from "./saPublicHolidays"

/** The real, live citation — read from the table rather than restated, so this test cannot drift from it. */
const cited = SA_PUBLIC_HOLIDAYS.find(h => h.source?.includes("https://"))
const citedUrl = cited?.source?.match(/https?:\/\/\S+/)?.[0] ?? ""

function notice(link: string, title = "Public Holidays Act: Declaration of a Public Holiday") {
  return { title, link, pubDate: "Mon, 08 Sep 2026 00:00:00 +0200" }
}

describe("partitionNotices", () => {
  it("the table carries at least one proclamation cited by URL — otherwise every probe below is vacuous", () => {
    expect(citedUrl).toMatch(/^https:\/\//)
  })

  it("acknowledges a notice whose link the table already cites", () => {
    const { unactioned, actioned } = partitionNotices([notice(citedUrl)])
    expect(actioned.map(n => n.link)).toEqual([citedUrl])
    expect(unactioned).toEqual([])
  })

  it("tolerates a trailing slash and case, which the publisher varies and a human would not notice", () => {
    const { actioned } = partitionNotices([notice(citedUrl.toUpperCase() + "/")])
    expect(actioned).toHaveLength(1)
  })

  it("strips a RUN of trailing slashes — the case the hand-rolled scan replaced a backtracking regex for", () => {
    const { actioned } = partitionNotices([notice(citedUrl + "/////")])
    expect(actioned).toHaveLength(1)
  })

  // ── everything below must SURVIVE ──────────────────────────────────────────

  it("does NOT acknowledge a DIFFERENT notice — the next real proclamation must still alert", () => {
    const other = "https://www.gov.za/documents/notices/public-holidays-act-declaration-some-other-day"
    const { unactioned, actioned } = partitionNotices([notice(other)])
    expect(unactioned.map(n => n.link)).toEqual([other])
    expect(actioned).toEqual([])
  })

  it("does NOT acknowledge a notice carrying a query string the cited URL lacks", () => {
    const { unactioned } = partitionNotices([notice(citedUrl + "?x=1")])
    expect(unactioned).toHaveLength(1)
  })

  it("does NOT acknowledge a link that merely CONTAINS the cited one as a prefix", () => {
    const { unactioned } = partitionNotices([notice(citedUrl + "-amendment")])
    expect(unactioned).toHaveLength(1)
  })

  it("does NOT acknowledge on title alone — a matching title with no link still needs a human", () => {
    const { unactioned, actioned } = partitionNotices([notice("", cited?.name ?? "Local Government Elections")])
    expect(unactioned).toHaveLength(1)
    expect(actioned).toEqual([])
  })

  it("partitions a mixed batch without losing one", () => {
    const fresh = "https://www.gov.za/documents/notices/brand-new-proclamation"
    const { unactioned, actioned } = partitionNotices([notice(citedUrl), notice(fresh)])
    expect(actioned.map(n => n.link)).toEqual([citedUrl])
    expect(unactioned.map(n => n.link)).toEqual([fresh])
  })

  it("an empty feed is neither actioned nor unactioned", () => {
    expect(partitionNotices([])).toEqual({ unactioned: [], actioned: [] })
  })
})
