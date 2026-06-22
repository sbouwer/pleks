/**
 * scripts/extraction-harness/lib/reporter.ts — Terminal summary table
 *
 * Output format per ADDENDUM_14L §5.3
 */

export interface HarnessRunResult {
  folderName: string
  archetype: string | null  // null only on pipeline error
  totalDocs: number
  classified: number
  rejectedAtUpload: number
  unknownType: number
  extracted: number
  reconIssues: number       // declared sources uncorroborated/variance + identity mismatch + net-pay gap (Phase 3)
  fraudCount: number        // fraud signals raised (Phase 3)
  durationMs: number
  error?: string
}

const LINE = "-".repeat(120)

const HEADER =
  "     " +
  pad("FOLDER", 35) + pad("ARCHETYPE", 28) +
  pad("DOCS", 6) + pad("OK", 5) + pad("REJ", 5) + pad("UNK", 5) + pad("EXT", 5) + pad("ms", 7)

function getRowIcon(r: HarnessRunResult): string {
  if (r.error)                return "[ERR]"
  if (r.rejectedAtUpload > 0) return "[REJ]"
  if (r.unknownType > 0)      return "[UNK]"
  return "[ OK]"
}

function formatRow(r: HarnessRunResult): string {
  const archStr = r.archetype ?? "(error)"
  return (
    getRowIcon(r) + " " +
    pad(r.folderName, 35) + pad(archStr, 28) +
    pad(String(r.totalDocs), 6) + pad(String(r.classified), 5) +
    pad(String(r.rejectedAtUpload), 5) + pad(String(r.unknownType), 5) +
    pad(String(r.extracted), 5) + pad(String(r.durationMs), 7)
  )
}

function sumField(results: HarnessRunResult[], key: "totalDocs" | "classified" | "rejectedAtUpload" | "unknownType" | "extracted" | "reconIssues" | "fraudCount"): number {
  return results.reduce((s, r) => s + r[key], 0)
}

function printGate(archetypesOk: number, total: number, errors: number): void {
  const gatePass = archetypesOk === total && errors === 0
  console.log()
  console.log(`Acceptance gate:     ${gatePass ? "PASS" : "FAIL"}`)
  if (gatePass) { console.log(); return }
  if (errors > 0)            console.log("  FAIL reason: pipeline errors (see [ERR] rows)")
  if (archetypesOk < total)  console.log("  FAIL reason: archetype errors (see (error) rows)")
  console.log()
}

export function printSummaryTable(results: HarnessRunResult[]): void {
  console.log("\n" + LINE)
  console.log(HEADER)
  console.log(LINE)

  for (const r of results) {
    console.log(formatRow(r))
    if (r.error) console.log("       ERROR: " + r.error)
    if (r.reconIssues > 0 || r.fraudCount > 0) console.log(`       ISSUES: ${r.reconIssues} reconciliation · ${r.fraudCount} fraud signal(s)`)
  }

  const totalDocs       = sumField(results, "totalDocs")
  const totalClassified = sumField(results, "classified")
  const totalRejected   = sumField(results, "rejectedAtUpload")
  const totalUnknown    = sumField(results, "unknownType")
  const totalExtracted  = sumField(results, "extracted")
  const errors          = results.filter(r => r.error).length
  const archetypesOk    = results.filter(r => r.archetype !== null && !r.error).length

  console.log(LINE)
  console.log("     " + pad("TOTAL", 35) + pad("", 28) + pad(String(totalDocs), 6) + pad(String(totalClassified), 5) + pad(String(totalRejected), 5) + pad(String(totalUnknown), 5) + pad(String(totalExtracted), 5))
  console.log(LINE)
  console.log()
  console.log(`Folders processed:   ${results.length}`)
  console.log(`Archetypes resolved: ${archetypesOk}/${results.length}`)
  console.log(`Total documents:     ${totalDocs}`)
  console.log(`Classified:          ${totalClassified}`)
  console.log(`Rejected at upload:  ${totalRejected}`)
  console.log(`Type unknown:        ${totalUnknown}`)
  console.log(`Extracted:           ${totalExtracted}`)
  console.log(`Reconciliation flags:${sumField(results, "reconIssues")}`)
  console.log(`Fraud signals:       ${sumField(results, "fraudCount")}`)
  if (errors > 0) console.log(`Pipeline errors:     ${errors}`)

  printGate(archetypesOk, results.length, errors)
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length)
}
