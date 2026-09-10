// scripts/codegen/gen-sa-holidays.mts
// ─────────────────────────────────────────────────────────────────────────────
// Regenerates lib/dates/saHolidays.json — the SA public-holiday table — from the
// statute (lib/dates/saHolidayDerivation.ts) plus the hand-carried s2A rows in
// lib/dates/saProclamations.json. ADDENDUM_70L Phase A.
//
// MACHINE-GENERATED ON PURPOSE — never hand-edit saHolidays.json. To add a
// presidential proclamation, put it in saProclamations.json with its Gazette
// reference and re-run; to change a derived rule, change the derivation. The
// generator is authoritative and the committed file is derived.
//
// THIN ON PURPOSE: every decision lives in lib/dates/saHolidayDerivation.ts, so
// the test and this writer cannot disagree about what the file should contain.
// The ENFORCED gate is not this script — lib/dates/saHolidayDerivation.test.ts
// re-derives in memory and diffs the committed file, and `vitest run` is already
// in `npm run check`. `--check` here is that same assertion for a terminal.
//
// USAGE:  npm run gen:holidays
//         npm run gen:holidays -- --check    (diff only, exit 1 on drift)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  COVERAGE_FROM_YEAR,
  deriveHolidayTable,
  renderHolidayTableJson,
  type Proclamation,
} from "../../lib/dates/saHolidayDerivation"

const DATES_DIR = join(process.cwd(), "lib", "dates")
const TABLE_PATH = join(DATES_DIR, "saHolidays.json")
const PROCLAMATIONS_PATH = join(DATES_DIR, "saProclamations.json")

const proclamations = (
  JSON.parse(readFileSync(PROCLAMATIONS_PATH, "utf8")) as { proclamations: Proclamation[] }
).proclamations

const expected = renderHolidayTableJson(deriveHolidayTable({ fromYear: COVERAGE_FROM_YEAR, proclamations }))

if (process.argv.includes("--check")) {
  if (readFileSync(TABLE_PATH, "utf8") !== expected) {
    console.error(
      "saHolidays.json is out of date with the derivation.\n" +
        "Run `npm run gen:holidays` and commit the result — do not edit the JSON by hand.",
    )
    process.exit(1)
  }
  console.log("saHolidays.json matches the derivation.")
} else {
  writeFileSync(TABLE_PATH, expected)
  const { holidays, coversFrom, coversThrough } = JSON.parse(expected) as {
    holidays: unknown[]
    coversFrom: string
    coversThrough: string
  }
  console.log(`Wrote saHolidays.json: ${holidays.length} entries, ${coversFrom} .. ${coversThrough}.`)
}
