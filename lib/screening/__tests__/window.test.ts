/**
 * lib/screening/__tests__/window.test.ts — every screening-window reader reads the ONE value, SCREENING_WINDOW_DAYS
 *
 * Notes:  BUILD_72 P1-R8b-2 + counsel-approved comms 2026-10-03 §1: the surety invite says "This link expires in
 *         {ttlDays} days", so the invite's link, the reminders' countdown and expiry, the stage-2 consent window and the
 *         lead's payment link must all be that one number. Before this they were three literal 14s and a 7 — the lead's
 *         payment link died a week before the consent window it waited on.
 *         Two halves. BEHAVIOURAL where a reader is a pure function (`directorTokenExpiry`). STRUCTURAL for the rest,
 *         which are DB-bound handlers: each named reader must import the constant and carry no day-count literal of its
 *         own — neither a literal nor a NAMED local (`const STAGE2_WINDOW_DAYS = 14` is how the pre-fix code spelled it,
 *         and walker F7 found a literal-only matcher missed every one). The import must be a real import, not a mention.
 *         The SQL default on application_screening_payments.expires_at and the seed's "expires in" lines are pinned to
 *         the same value, since neither can import it. KNOWN-GOOD: the matcher catches every planted pre-fix line.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
import { directorTokenExpiry } from "@/lib/applications/directorInvite"

/** Every reader of the window, by the job it does. */
const READERS: Record<string, string> = {
  "invite link life + its 'expires in N days' line": "lib/applications/directorInvite.ts",
  "stage-2 consent window + the lead's payment link": "lib/screening/sendShortlistInvitation.ts",
  "reminder countdown, surety expiry, consent-window decline": "app/api/cron/screening-portal-reminders/route.ts",
  "the lead's shortlist email 'expires in N days' line": "lib/applications/emails.tsx",
}

/** A day count written as a number where the window belongs: `addDays(x, 7)`, `14 * DAY_MS`, an expiry's `>= 14` (not the t3/t7/t10 milestones), `14 - d`, "in 7 days". */
const WINDOW_LITERALS: readonly RegExp[] = [
  /addDays\([^,]+,\s*\d+\)/,
  /\b\d+\s*\*\s*(?:DAY_MS|86_400_000)/,
  /daysElapsed\s*>=\s*\d+\)\s*return expire/,
  /\b\d+\s*-\s*daysElapsed/,
  /expires in \d+ days/,
  /\b\d+-day window/,
  /const \w*(?:WINDOW|TTL)\w*\s*=\s*\d/,
  /addDays\([^,]+,\s*(?!SCREENING_WINDOW_DAYS\b)[A-Za-z_]\w*\)/,
  /\b(?!SCREENING_WINDOW_DAYS\b)[A-Z][A-Z0-9_]*_DAYS\s*\*/,
]
const IMPORTS_WINDOW = /import\s*\{[^}]*\bSCREENING_WINDOW_DAYS\b[^}]*\}\s*from\s*"@\/lib\/constants"/
const statesWindow = (line: string) => WINDOW_LITERALS.some((re) => re.test(line))

describe("the screening window is one value (P1-R8b-2)", () => {
  it("is 14 days", () => {
    expect(SCREENING_WINDOW_DAYS).toBe(14)
  })

  it("BEHAVIOURAL: the surety link lives exactly the window", () => {
    const now = Date.UTC(2026, 9, 3)
    expect(Date.parse(directorTokenExpiry(now)) - now).toBe(SCREENING_WINDOW_DAYS * 86_400_000)
  })

  it.each(Object.entries(READERS))("%s (%s) reads SCREENING_WINDOW_DAYS and states no number of its own", (_job, file) => {
    const src = readFileSync(file, "utf8")
    expect(src).toMatch(IMPORTS_WINDOW)
    const hits = src.split("\n").filter((l) => !/^\s*(\*|\/\/)/.test(l) && statesWindow(l))
    expect(hits).toEqual([])
  })

  it.each([
    "      expires_at: addDays(new Date(), 7).toISOString(),",
    "const STAGE2_WINDOW_MS = 14 * DAY_MS",
    "  if (daysElapsed >= 14) return expireDirectorLine(service, line, row)",
    "      daysRemaining: Math.max(0, 14 - daysElapsed),",
    "        <p style={S.footer}>This link expires in 7 days.</p>",
    "const STAGE2_WINDOW_DAYS = 14",
    "const DIRECTOR_TOKEN_TTL_DAYS = 14",
    "  return new Date(now + DIRECTOR_TOKEN_TTL_DAYS * 86_400_000).toISOString()",
    "  const windowEnd = addDays(now, STAGE2_WINDOW_DAYS)",
  ])("KNOWN-GOOD: the matcher catches the pre-fix line %s", (planted) => {
    expect(statesWindow(planted)).toBe(true)
  })

  it.each([
    "const STAGE2_WINDOW_MS = SCREENING_WINDOW_DAYS * DAY_MS",
    "  const windowEnd = addDays(now, SCREENING_WINDOW_DAYS)",
  ])("KNOWN-GOOD: the window's own use is not flagged: %s", (ok) => {
    expect(statesWindow(ok)).toBe(false)
  })

  it("a mention is not an import: a comment naming the constant does not satisfy the reader check", () => {
    expect("// reads SCREENING_WINDOW_DAYS, honest").not.toMatch(IMPORTS_WINDOW)
    expect('import { formatZAR, SCREENING_WINDOW_DAYS } from "@/lib/constants"').toMatch(IMPORTS_WINDOW)
  })

  it("the SQL default on a screening payment row's expires_at is the window (005 cannot import it)", () => {
    const sql = readFileSync("supabase/migrations/005_operations.sql", "utf8")
    const start = sql.indexOf("CREATE TABLE IF NOT EXISTS application_screening_payments")
    expect(start).toBeGreaterThan(-1)
    const table = sql.slice(start, sql.indexOf(");", start))
    const m = /expires_at\s+timestamptz NOT NULL DEFAULT now\(\) \+ interval '(\d+) days'/.exec(table)
    expect(m?.[1]).toBe(String(SCREENING_WINDOW_DAYS))
  })

  it("the seeded applicant and surety templates state the window, never another number", () => {
    const seed = readFileSync("lib/comms/templates/seed/applications.ts", "utf8")
    const days = [...seed.matchAll(/This link expires in (\d+) days/g)].map((m) => m[1])
    expect(days.length).toBeGreaterThan(0)
    expect(new Set(days)).toEqual(new Set([String(SCREENING_WINDOW_DAYS)]))
  })
})
