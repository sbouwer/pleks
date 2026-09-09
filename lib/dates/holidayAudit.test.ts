/**
 * lib/dates/holidayAudit.test.ts — the auditor diffs, and the table wins a disagreement
 *
 * Pins the three diff classes, the window restriction (the API knowing 2030 is not a finding), and the
 * gov.za proclamation matcher in both directions. Pure fixtures — no network.
 */
import { describe, it, expect } from "vitest"
import { classifyHolidayDiff, isProclamationNotice, parseGazetteNotices, type ApiHoliday } from "./holidayAudit"
import type { HolidayEntry } from "./saPublicHolidays"

const FROM = "2026-01-01"
const THROUGH = "2026-12-31"

const entry = (date: string, name: string, basis = "PHA s1 Sch 1"): HolidayEntry => ({ date, name, basis, observedShiftOf: null, source: null })

const TABLE: HolidayEntry[] = [
  entry("2026-01-01", "New Year's Day"),
  entry("2026-08-09", "National Women's Day"),
  entry("2026-08-10", "National Women's Day (obs)", "PHA s2(1)"),
  entry("2026-12-25", "Christmas Day"),
]

describe("classifyHolidayDiff", () => {
  it("Class A — API has a date the table lacks (a possible proclamation)", () => {
    const api: ApiHoliday[] = [...TABLE.map((h) => ({ date: h.date, name: h.name })), { date: "2026-05-29", name: "Election Day" }]
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.hasAlerts).toBe(true)
    expect(r.diffs.filter((d) => d.cls === "A").map((d) => d.date)).toEqual(["2026-05-29"])
  })

  it("Class B — table has a date the API lacks; the table wins pending review", () => {
    // A feed that missed the observed Monday — exactly the case the doctrine exists for.
    const api: ApiHoliday[] = TABLE.filter((h) => h.date !== "2026-08-10").map((h) => ({ date: h.date, name: h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.hasAlerts).toBe(true)
    const b = r.diffs.filter((d) => d.cls === "B")
    expect(b.map((d) => d.date)).toEqual(["2026-08-10"])
    expect(b[0].detail).toMatch(/table wins/)
  })

  it("Class C — dates agree, name differs; informational, no alert", () => {
    const api: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.date === "2026-12-25" ? "Christmas" : h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    // "Christmas" vs "Christmas Day" normalises equal (substring of letters) — so NOT even a C. Prove a real C:
    const api2: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.date === "2026-12-25" ? "Festive Holiday" : h.name }))
    const r2 = classifyHolidayDiff(TABLE, api2, FROM, THROUGH)
    expect(r.hasAlerts).toBe(false)
    expect(r2.diffs.filter((d) => d.cls === "C").map((d) => d.date)).toEqual(["2026-12-25"])
    expect(r2.hasAlerts).toBe(false)   // a name mismatch never alerts
  })

  it("the (obs) suffix is not a finding — name normalisation ignores parentheticals", () => {
    const api: ApiHoliday[] = TABLE.map((h) => ({ date: h.date, name: h.name.replace(" (obs)", "") }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])
  })

  it("does NOT flag a weekend holiday the feed omits — feeds list only the observed Monday", () => {
    // The real-world case: the table carries the Sunday holiday AND its observed Monday; Nager lists only the
    // Monday. 2026-08-09 (Sun) is in the table but not the feed — a weekend date, so it must NOT be Class-B.
    const api: ApiHoliday[] = TABLE.filter((h) => h.date !== "2026-08-09").map((h) => ({ date: h.date, name: h.name }))
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])           // the missing Sunday is immaterial to business-day arithmetic
    expect(r.hasAlerts).toBe(false)
  })

  it("ignores API dates OUTSIDE the coverage window (knowing 2030 is not a finding)", () => {
    const api: ApiHoliday[] = [...TABLE.map((h) => ({ date: h.date, name: h.name })), { date: "2030-01-01", name: "New Year's Day" }]
    const r = classifyHolidayDiff(TABLE, api, FROM, THROUGH)
    expect(r.diffs).toEqual([])
  })
})

/**
 * The gov.za proclamation matcher, probed in BOTH directions.
 *
 * The positives are the five REAL title forms found on gov.za/documents/notices (2026-09-09), not invented
 * ones — including 2021-11-01, the exact proclamation Nager.Date has never carried. The negatives are real
 * neighbours from the same feed: a matcher that fires on every gazette notice is not a filter, it is a
 * firehose, and an admin who deletes the digest unread is the same as no witness at all.
 */
describe("isProclamationNotice", () => {
  const REAL_PROCLAMATIONS = [
    "Public Holidays Act: Declaration of 29 May 2024 as public holiday",
    "Public Holidays Act: Declaration of 15th day of December 2023 as public holiday",
    "Public Holidays Act: Declaration of 1 November 2021 as a public holiday",
    "Public Holidays Act: Declaration of the Twenty-Seventh Day of December 2022 as a public holiday",
    "Public Holidays Act: Declaration of 31 December 1999 and 2 January 2000 as public holidays",
  ]

  const NEIGHBOURS_ON_THE_SAME_FEED = [
    "Customs and Excise Act: Amendment of Schedule No. 1 (No. 1/1/1585)",
    "Independent Communications Authority of South Africa Act: Correction Notice",
    "National Environmental Management: Waste Act: Draft regulations for comment",
    "Basic Conditions of Employment Act: Determination of earnings threshold",
    "Companies Act: Notice of intention to deregister",
  ]

  it.each(REAL_PROCLAMATIONS)("fires on a real proclamation title: %s", (title) => {
    expect(isProclamationNotice(title)).toBe(true)
  })

  it.each(NEIGHBOURS_ON_THE_SAME_FEED)("stays quiet on an ordinary gazette notice: %s", (title) => {
    expect(isProclamationNotice(title)).toBe(false)
  })

  it("is case- and whitespace-tolerant — the feed is not a stable formatter", () => {
    expect(isProclamationNotice("PUBLIC HOLIDAYS ACT: DECLARATION OF 4 NOVEMBER 2026")).toBe(true)
    expect(isProclamationNotice("Public\n  Holidays Act: Declaration")).toBe(true)
  })

  it("matches on the phrase, not on the Act's name — a proclamation titled any other way still fires", () => {
    // The broad match is deliberate (see the docblock): a false positive is one dismissible email; a false
    // negative is a statutory notice served a day early, which is void.
    expect(isProclamationNotice("Proclamation: 4 November 2026 declared a public holiday")).toBe(true)
  })
})

/**
 * The RSS parse, on the SHAPE the live feed actually has (captured from gov.za/rss.xml on 2026-09-09).
 *
 * The hazard this pins is not a malformed feed — it is a feed whose `<description>` carries the whole notice
 * as entity-encoded HTML. A parser that scanned the body globally would find `&lt;a href&gt;` and the encoded
 * `&lt;time&gt;` inside descriptions and produce confident nonsense, and the caller cannot tell nonsense from
 * a quiet week. The second item below is a real proclamation title dropped into that real envelope.
 */
describe("parseGazetteNotices", () => {
  const LIVE_SHAPE = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xml:base="https://www.gov.za/">
  <channel>
    <title>rss</title>
    <link>https://www.gov.za/</link>
    <item>
  <title>Customs and Excise Act: Amendment to Part 1 of Schedule No. 2 (No. 2/1/94) (English/ Afrikaans)</title>
  <link>https://www.gov.za/documents/notices/customs-and-excise-act-amendment</link>
  <description>&lt;span&gt;&lt;time datetime="2026-09-08T12:00:15+02:00"&gt;Tue, 09/08/2026&lt;/time&gt;&lt;/span&gt;
&lt;a href="https://www.gov.za/sites/default/files/55342gon7889.pdf"&gt;55342gon7889.pdf&lt;/a&gt;</description>
  <pubDate>Tue, 08 Sep 2026 10:00:15 +0000</pubDate>
  <guid isPermaLink="false">845996 at https://www.gov.za</guid>
    </item>
    <item>
  <title>Public Holidays Act: Declaration of 1 November 2021 as a public holiday</title>
  <link>https://www.gov.za/documents/notices/public-holidays-act-declaration</link>
  <description>&lt;span&gt;Proclamation&lt;/span&gt;</description>
  <pubDate>Mon, 04 Oct 2021 08:00:00 +0000</pubDate>
    </item>
  </channel>
</rss>`

  it("reads exactly the items, never the channel's own title or link", () => {
    const n = parseGazetteNotices(LIVE_SHAPE)
    expect(n).toHaveLength(2)
    expect(n.map((x) => x.title)).not.toContain("rss")
    expect(n[0].link).toBe("https://www.gov.za/documents/notices/customs-and-excise-act-amendment")
    expect(n[0].pubDate).toBe("Tue, 08 Sep 2026 10:00:15 +0000")
  })

  it("is not confused by the encoded HTML inside <description>", () => {
    // The description holds an encoded <a> and <time>. If those leaked into the scan the titles would be
    // wrong — and a wrong title is what silently turns the proclamation watch off.
    const n = parseGazetteNotices(LIVE_SHAPE)
    expect(n[0].title).toBe("Customs and Excise Act: Amendment to Part 1 of Schedule No. 2 (No. 2/1/94) (English/ Afrikaans)")
    expect(n.filter((x) => isProclamationNotice(x.title))).toHaveLength(1)
  })

  it("decodes CDATA and entities in a title", () => {
    const xml = `<rss><item><title><![CDATA[Act: A &amp; B, &quot;C&quot;]]></title><link>x</link><pubDate>y</pubDate></item></rss>`
    expect(parseGazetteNotices(xml)[0].title).toBe(`Act: A & B, "C"`)
  })

  it("does NOT double-decode — &amp;lt; stays a literal &lt;, it does not become a tag", () => {
    const xml = `<rss><item><title>Notice: &amp;lt;not markup&amp;gt;</title></item></rss>`
    expect(parseGazetteNotices(xml)[0].title).toBe("Notice: &lt;not markup&gt;")
  })

  it("yields nothing on a feed shape it does not recognise — the caller reads that as 'could not look'", () => {
    // The safe direction: an empty parse becomes govZa:null upstream, reported as unreachable, NEVER as
    // 'no proclamations found'. A parser that guessed here would be worse than one that gives up.
    expect(parseGazetteNotices(`{"items":[{"title":"Public Holidays Act: Declaration"}]}`)).toEqual([])
  })
})
