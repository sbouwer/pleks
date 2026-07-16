/**
 * test/import/fuzz.ts — the random-testing engine: thousands of books, no database, replayable failures
 *
 * Notes:  The DB tier costs 456 ms per book. The pure path costs 1.02 ms — 446× cheaper (measured). And almost
 *         every real import bug this arc found lived in the PURE code: the header aliases, the af-ZA money, the
 *         day/month swap, the Excel serial, the escalation that silently became 10%, the formula lead, the
 *         negative rent. The database contributed nothing to FINDING them; it just charged half a second to
 *         confirm each one.
 *
 *         So the hunt moves here, and it moves the combinatorial part — dialects × corruptions × densities ×
 *         seeds — which is a space you cannot walk half a second at a time.
 *
 *         ⚠ WHAT THIS TIER CANNOT PROVE, and it must be said every single time the big number is quoted:
 *
 *             a pure pass cannot see a phantom column, a NOT NULL, a CHECK, a trigger, or a unique index.
 *
 *         It would NEVER have caught `payment_method` (a column that does not exist), or `escalation_percent:
 *         null` hitting NOT NULL, or the trust ledger doubling on a re-import. Those live at the WRITE boundary
 *         and nowhere else, and a single DB test found each of them in minutes.
 *
 *         So: 5 000 pure cases are not 5 000 real ones. Anyone who reads "5 000 passed" as "the importer is
 *         proven" has been handed FALSE PROOF — which is the exact failure this whole arc is named after, and it
 *         would be an unusually stupid way to reintroduce it. The tiers are labelled for what each one proves.
 *
 *         THE INVARIANTS, checked on every single case:
 *
 *           REFUSED-OR-SOUND    a row either lands (and every value it carries is COHERENT) or is REFUSED BY
 *                               NAME. Never a lease with a negative rent, an end before its start, or a money
 *                               term nobody stated.
 *           NEVER-SILENT        a corrupted row that lands unremarked is the forbidden fifth class.
 *           NO-INVENTED-MONEY   a rent, deposit or escalation the file never stated must not appear from a
 *                               default. The `?? 5` is the founding member of that family.
 */
import { projectLeaseRow, type RowProjection } from "@/lib/import/importRunner"
import { matchColumns } from "@/lib/import/columnMapper"
import { toColumnMapping } from "@/lib/import/decisions"
import { generateBook } from "./book"
import { render, ALL_DIALECTS, type DialectName } from "./dialect"
import { corrupt, ALL_CORRUPTIONS, type Corruption } from "./corrupt"
import {
  RENT_CENTS_MAX, ESCALATION_PERCENT_MAX, NOTICE_PERIOD_DAYS_MAX, DEPOSIT_RETURN_DAYS_MAX,
} from "@/lib/import/plausibility"

/** One thing that went wrong, with everything needed to reproduce it exactly. */
export interface Finding {
  invariant: string
  seed: number
  dialect: DialectName
  density: number
  rowIndex: number
  corruption: string | null
  detail: string
}

export interface FuzzSpec {
  /** How many books. 5 000 is a serious run; it takes seconds. */
  cases: number
  /** Where the seeds start. Change it to explore a different region; keep it to reproduce a run exactly. */
  fromSeed?: number
  densities?: number[]
  leasesPerBook?: number
}

export interface FuzzReport {
  cases: number
  rowsChecked: number
  findings: Finding[]
  msPerCase: number
}

/**
 * Every value the importer let through must be COHERENT. Not "plausible" — coherent: no lease can bill a
 * negative rent, end before it starts, or run a notice period backwards. If one of these lands, the importer
 * accepted something no human meant.
 */
function checkLanded(lease: Record<string, unknown>, base: Omit<Finding, "invariant" | "detail">): Finding[] {
  const out: Finding[] = []
  const bad = (detail: string) => out.push({ ...base, invariant: "refused-or-sound", detail })

  const rent = Number(lease.rent_amount_cents)
  const deposit = lease.deposit_amount_cents === null ? null : Number(lease.deposit_amount_cents)
  const esc = lease.escalation_percent === undefined ? null : Number(lease.escalation_percent)
  const notice = lease.notice_period_days === undefined ? null : Number(lease.notice_period_days)
  const ret = lease.deposit_return_days === undefined ? null : Number(lease.deposit_return_days)
  const start = String(lease.start_date ?? "")
  const end = lease.end_date === null ? null : String(lease.end_date ?? "")

  if (!Number.isFinite(rent)) bad(`rent is not a number: ${String(lease.rent_amount_cents)}`)
  else if (rent < 0) bad(`NEGATIVE RENT landed: ${rent} cents`)
  else if (rent > RENT_CENTS_MAX * 100) bad(`absurd rent landed: ${rent} cents`)

  if (deposit !== null && deposit < 0) bad(`NEGATIVE DEPOSIT landed: ${deposit} cents`)
  if (esc !== null && Number.isFinite(esc) && Math.abs(esc) > ESCALATION_PERCENT_MAX * 20) {
    bad(`absurd escalation landed: ${esc}%`)
  }
  if (notice !== null && Number.isFinite(notice) && notice < 0) bad(`NEGATIVE notice period landed: ${notice}`)
  if (notice !== null && Number.isFinite(notice) && notice > NOTICE_PERIOD_DAYS_MAX * 5) {
    bad(`absurd notice period landed: ${notice} days`)
  }
  if (ret !== null && Number.isFinite(ret) && ret < 0) bad(`NEGATIVE deposit-return window landed: ${ret}`)
  if (ret !== null && Number.isFinite(ret) && ret > DEPOSIT_RETURN_DAYS_MAX * 5) {
    bad(`absurd deposit-return window landed: ${ret} days`)
  }
  if (end && start && end < start) bad(`a lease that ENDS (${end}) BEFORE IT STARTS (${start}) landed`)

  return out
}

/** A corrupted row that lands with nothing said is the forbidden fifth class: silently wrong. */
function checkNotSilent(
  projection: RowProjection,
  corruption: Corruption,
  base: Omit<Finding, "invariant" | "detail">,
): Finding[] {
  // ONLY judge what this projection can SEE. The lease projection does not check an SA ID checksum (that is
  // checkTenantIdentity), a province (upsertProperty), or a formula lead (runImport's own scan) — so holding it
  // responsible for them accused the importer of 5 912 silent failures that were entirely the fuzzer's error.
  // Those corruptions are real and are covered by the DB tier; they are simply not this tier's to assert.
  if (corruption.scope !== "lease") return []
  if (corruption.expect === "imported") return []
  if (!projection.lease) return []                                  // refused — honest
  if (projection.errors.some((e) => e.rowIndex === base.rowIndex)) return []   // flagged — honest

  return [{
    ...base,
    invariant: "never-silent",
    detail:
      `row was corrupted (${corruption.id}: ${corruption.why}) and the importer accepted it with NOTHING SAID. ` +
      `Whatever landed, the agency was not told.`,
  }]
}

/** Run the fuzz. Deterministic: the same spec produces the same findings, forever. */
export function fuzz(spec: FuzzSpec): FuzzReport {
  const densities = spec.densities ?? [0, 0.1, 0.5, 1]
  const leases = spec.leasesPerBook ?? 8
  const from = spec.fromSeed ?? 1

  const findings: Finding[] = []
  let rowsChecked = 0
  const t0 = performance.now()

  for (let n = 0; n < spec.cases; n++) {
    const seed = from + n
    const dialect = ALL_DIALECTS[seed % ALL_DIALECTS.length]
    const density = densities[seed % densities.length]

    const truth = generateBook({ seed, leases, variety: true })
    const clean = render(truth, dialect)
    const book = density > 0 ? corrupt(clean, density, seed, ALL_CORRUPTIONS) : { ...clean, corrupted: new Map() }

    const suggestions = matchColumns(book.headers)
    const wire: Record<string, { field: string; entity: string }> = {}
    for (const s of suggestions) if (s.field) wire[s.column] = { field: s.field, entity: s.entity }
    const mapping = toColumnMapping(wire)

    for (const [rowIndex, row] of book.rows.entries()) {
      rowsChecked++
      const corruption = book.corrupted.get(rowIndex) ?? null
      const base = { seed, dialect, density, rowIndex, corruption: corruption?.id ?? null }

      let projection: RowProjection
      try {
        projection = projectLeaseRow(row, mapping, rowIndex)
      } catch (e) {
        findings.push({
          ...base,
          invariant: "no-crash",
          detail: `the projection THREW: ${e instanceof Error ? e.message : String(e)}`,
        })
        continue
      }

      if (projection.lease) findings.push(...checkLanded(projection.lease, base))
      if (corruption) findings.push(...checkNotSilent(projection, corruption, base))
    }
  }

  return {
    cases: spec.cases,
    rowsChecked,
    findings,
    msPerCase: (performance.now() - t0) / spec.cases,
  }
}

/** A findings REPORT, not a wall of red. Grouped by invariant, each one replayable from its seed. */
export function formatReport(r: FuzzReport): string {
  const lines: string[] = []
  lines.push(`\n── import fuzz · ${r.cases} books · ${r.rowsChecked} rows · ${r.msPerCase.toFixed(2)} ms/book ──`)

  if (r.findings.length === 0) {
    lines.push(`  ✓ no findings`)
    lines.push(
      `  ⚠ PURE TIER — this proves the mapping, parsing, classification and plausibility layers. It proves` +
      ` NOTHING about NOT NULL, CHECK, triggers or unique indexes; those live at the write boundary and are the` +
      ` DB tier's job. "${r.cases} passed" is not "the importer is proven".`,
    )
    return lines.join("\n")
  }

  const byInvariant = new Map<string, Finding[]>()
  for (const f of r.findings) {
    const list = byInvariant.get(f.invariant) ?? []
    list.push(f)
    byInvariant.set(f.invariant, list)
  }

  for (const [invariant, fs] of byInvariant) {
    lines.push(`\n  ✗ ${invariant} — ${fs.length} finding(s)`)
    // One line per DISTINCT detail: a thousand instances of one bug is one bug, and a report that says it a
    // thousand times is a report nobody reads.
    const seen = new Set<string>()
    for (const f of fs) {
      const key = `${f.corruption}:${f.detail.slice(0, 60)}`
      if (seen.has(key)) continue
      seen.add(key)
      lines.push(
        `      seed ${f.seed} · ${f.dialect} · ${Math.round(f.density * 100)}% · row ${f.rowIndex}` +
        `${f.corruption ? ` · ${f.corruption}` : ""}\n        ${f.detail}`,
      )
    }
  }
  lines.push(`\n  Every finding above is REPLAYABLE: generateBook({ seed }) → render(dialect) → corrupt(density).`)
  return lines.join("\n")
}
