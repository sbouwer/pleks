/**
 * scripts/codegen/decision-reason-enums.mts — emit the F3 decision-reason CHECK SQL from the canonical TS
 *
 * Run:    npx tsx scripts/codegen/decision-reason-enums.mts          (writes the .generated.sql)
 *         npx tsx scripts/codegen/decision-reason-enums.mts --check  (CI: fail if the file is stale)
 * Notes:  SPEC §7 approach A. TypeScript (lib/screening/decisionReasons.ts) is the source; the emitted SQL
 *         is the mirror; the drift test (lib/screening/__tests__/decisionReasons.test.ts) + --check guard
 *         against divergence. The output is a PASTE-READY 010 §N block — NOT applied to prod until counsel
 *         ticks the enum values (see decisionReasons.ts header). It lives OUTSIDE supabase/migrations/ so
 *         the schema-drift script does not treat the unapplied fragment as a live migration.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { buildDecisionReasonConstraintsSql } from "../../lib/screening/decisionReasonsSql"

const OUT = join(dirname(fileURLToPath(import.meta.url)), "decision_reason_constraints.generated.sql")
const sql = buildDecisionReasonConstraintsSql()

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : ""
  if (current !== sql) {
    console.error("✗ decision_reason_constraints.generated.sql is stale — run: npx tsx scripts/codegen/decision-reason-enums.mts")
    process.exit(1)
  }
  console.log("✓ decision-reason generated SQL matches the canonical TS")
} else {
  writeFileSync(OUT, sql)
  console.log(`✓ wrote ${OUT}`)
}
