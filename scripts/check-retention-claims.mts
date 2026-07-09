/**
 * scripts/check-retention-claims.mts — F3 retention claim-drift gate (O-20)
 *
 * Truth Pipeline: the ENFORCED retention windows live in lib/popia/retention.ts (what the purge crons read);
 * the public-facing CLAIMS live in the legal pages. This gate makes the two impossible to silently diverge:
 *   (a) each RETENTION_DOCUMENTATION claim's `period` must equal what retentionDisplay() reports for its
 *       enforcedCategory — so changing a retention policy without updating the doc (or vice versa) fails CI;
 *   (b) each listed public surface must still state the period phrase — so a page refactor can't drop a claim.
 * Runs in `npm run check` (sibling of check-marketing-consistency.mjs). Exit 1 on any drift.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { RETENTION_DOCUMENTATION } from "../lib/legal/retention-documentation"
import { retentionDisplay, type DataCategory } from "../lib/popia/retention"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

type Duration = { days?: number; months?: number }

/** Parse "90 days" / "up to 5 years" / "84 months" → a canonical duration (years folded into months). */
function normalize(phrase: string): Duration | null {
  const m = phrase.match(/(\d+)\s+(day|month|year)s?/i)
  if (!m) return null
  const n = Number(m[1])
  const unit = m[2].toLowerCase()
  if (unit === "day") return { days: n }
  if (unit === "month") return { months: n }
  return { months: n * 12 } // year
}

function sameDuration(a: Duration, b: Duration): boolean {
  if (a.days != null || b.days != null) return a.days === b.days
  return a.months === b.months
}

let errors = 0
function fail(msg: string): void {
  console.error(`[retention-claims] FAIL — ${msg}`)
  errors++
}

for (const claim of RETENTION_DOCUMENTATION) {
  // (a) enforcement cross-check — the documented period must match what retention.ts actually enforces.
  const enforced = retentionDisplay(claim.enforcedCategory as DataCategory)
  const enfNorm = normalize(enforced)
  const claimNorm = normalize(claim.period)
  if (!enfNorm || !claimNorm) {
    fail(`${claim.key}: unparseable period (doc "${claim.period}" / enforced "${enforced}")`)
  } else if (!sameDuration(enfNorm, claimNorm)) {
    fail(
      `${claim.key}: documented "${claim.period}" ≠ enforced "${enforced}" ` +
        `(lib/popia/retention.ts → ${claim.enforcedCategory}). The public claim and the purge policy must agree.`,
    )
  }

  // (b) surface presence — every listed public page must still state the period phrase.
  for (const surface of claim.surfaces) {
    let content: string
    try {
      content = readFileSync(join(ROOT, surface), "utf8")
    } catch {
      fail(`${claim.key}: surface not found: ${surface}`)
      continue
    }
    if (!content.includes(claim.period)) {
      fail(`${claim.key}: surface ${surface} no longer states "${claim.period}"`)
    }
  }
}

if (errors === 0) {
  console.log(
    `[retention-claims] OK — ${RETENTION_DOCUMENTATION.length} claims consistent with lib/popia/retention.ts + all surfaces present`,
  )
}
process.exit(errors === 0 ? 0 : 1)
