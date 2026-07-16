/**
 * lib/import/assemble/classify.ts — "what IS this table?" (ADDENDUM_21C D-5, 21D §2)
 *
 * Notes:  A staged table is classified by its REFERENCE-prefix namespace (D-5 — the prefix IS the discriminator)
 *         plus a few signature columns, from the MRI report shapes hand-derived in museum/ORACLE.md. This is the
 *         ENGINE's deterministic best-guess for the known dialect; 21D layers the suggest-then-confirm UI on top
 *         (ambiguous → ask; unrecognised → ask or ignore) and NEVER silently drops or auto-misclassifies a table.
 */
import { refPrefix } from "./normalise"
import type { StagedEntityKind } from "./types"

export interface Classification {
  kind: StagedEntityKind
  keyColumn?: string
  /** The dominant REFERENCE namespace prefix, if the table is keyed. */
  keyPrefix?: string
  confidence: "high" | "medium" | "low"
}

const has = (headers: string[], name: string) => headers.some((h) => h.trim().toLowerCase() === name.toLowerCase())
const hasAny = (headers: string[], names: string[]) => names.some((n) => has(headers, n))

/** The REFERENCE-column prefixes actually present in the rows (a contacts table mixes TEN/ONR/SUP/AGT). */
function prefixesIn(rows: Record<string, string>[], keyColumn: string): Set<string> {
  const set = new Set<string>()
  for (const r of rows) {
    const p = refPrefix(r[keyColumn] ?? "")
    if (p) set.add(p)
  }
  return set
}

export function classifyTable(table: { headers: string[]; rows: Record<string, string>[] }): Classification {
  const { headers, rows } = table
  const keyColumn = headers.find((h) => h.trim().toLowerCase() === "reference")

  // No key column: either a GL/control ledger (context in section breaks) or genuinely unplaceable.
  if (!keyColumn) {
    if (hasAny(headers, ["debit", "credit"]) && has(headers, "description")) {
      return { kind: "reference_only", confidence: "high" }
    }
    return { kind: "unclassified", confidence: "low" }
  }

  const prefixes = prefixesIn(rows, keyColumn)
  const only = (p: string) => prefixes.size === 1 && prefixes.has(p)

  // Contacts: the identity master mixes the party namespaces and carries TYPE + IDENTIFIER.
  if (has(headers, "type") && hasAny(headers, ["identifier", "first names", "legal name"])) {
    return { kind: "contact", keyColumn, confidence: "high" }
  }
  // Property master: PRO namespace.
  if (only("PRO")) return { kind: "property", keyColumn, keyPrefix: "PRO", confidence: "high" }

  // LEA-keyed reports are disambiguated by their signature columns.
  if (prefixes.has("LEA")) {
    if (hasAny(headers, ["tenants", "landlord"])) {
      return { kind: "lease_parties", keyColumn, keyPrefix: "LEA", confidence: "high" }
    }
    if (hasAny(headers, ["held", "required", "still due", "by agent"])) {
      return { kind: "deposit", keyColumn, keyPrefix: "LEA", confidence: "high" }
    }
    if (hasAny(headers, ["rental amount", "rental", "start date", "lease status"])) {
      return { kind: "lease", keyColumn, keyPrefix: "LEA", confidence: "high" }
    }
    return { kind: "lease", keyColumn, keyPrefix: "LEA", confidence: "low" } // LEA-keyed but unsignposted
  }

  return { kind: "unclassified", keyColumn, confidence: "low" }
}
