/**
 * scripts/extraction-harness/run.ts — CLI entry point for extraction harness
 *
 * Usage: npx tsx scripts/extraction-harness/run.ts
 *
 * Walks brief/build/_TEST/, runs Phase 1 pipeline on each folder, writes JSON output
 * to brief/build/_HARNESS_OUTPUT/, prints terminal summary table.
 *
 * Harness mode: suppressLogging suppresses ai_usage writes (D-14L-20).
 * POPIA: Phase 1 output is structural only — no PII extracted.
 *
 * Spec: ADDENDUM_14L §4, §5.3
 */
import { config } from "dotenv"
config({ path: ".env.local" })
config()

import { loadTestFolders } from "./lib/filesystem"
import { runPipeline } from "../../lib/extraction/pipeline"
import { writeOutput } from "./lib/outputWriter"
import { printSummaryTable } from "./lib/reporter"
import type { HarnessRunResult } from "./lib/reporter"

async function main() {
  console.log("Extraction Harness — Phase 2 + 3 (extraction + reconciliation + fraud signals)")
  console.log("Test data: brief/build/_TEST/")
  console.log("Output:    brief/build/_HARNESS_OUTPUT/\n")

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: ANTHROPIC_API_KEY not set")
    process.exit(1)
  }

  const folders = loadTestFolders()
  console.log(`Found ${folders.length} application folders\n`)

  const results: HarnessRunResult[] = []

  for (const folder of folders) {
    const start = Date.now()
    process.stdout.write(`Processing ${folder.folderName} (${folder.unitType}, ${folder.applicantCount} applicant${folder.applicantCount > 1 ? "s" : ""}, ${folder.documents.length} docs)... `)

    try {
      const pipelineResult = await runPipeline(
        {
          unitType:       folder.unitType,
          applicantCount: folder.applicantCount,
          documents:      folder.documents,
          metadata:       { source: "harness" },
        },
        { orgId: null, suppressLogging: true, harnessMode: true },
      )

      writeOutput(folder.folderName, pipelineResult)

      const classified       = pipelineResult.documents.filter(d => d.status === "classified").length
      const rejectedAtUpload = pipelineResult.documents.filter(d => d.status === "rejected-at-upload").length
      const unknownType      = pipelineResult.documents.filter(
        d => d.status === "classified" && d.documentType === "unknown",
      ).length
      const extracted        = pipelineResult.documents.filter(
        d => d.status === "classified" && d.extracted != null,
      ).length
      const recon = pipelineResult.reconciliation
      const reconIssues =
        recon.declaredSources.filter(s => s.status === "uncorroborated" || s.status === "variance").length +
        (recon.identity.name === "material-mismatch" ? 1 : 0) +
        (recon.netPayVsCredit.verdict === "gap" ? 1 : 0)
      const fraudCount = pipelineResult.fraudSignals.length
      const durationMs = Date.now() - start

      results.push({
        folderName:    folder.folderName,
        archetype:     pipelineResult.archetype,
        totalDocs:     folder.documents.length,
        classified,
        rejectedAtUpload,
        unknownType,
        extracted,
        reconIssues,
        fraudCount,
        durationMs,
      })

      console.log(`done (${durationMs}ms)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAILED`)
      results.push({
        folderName:    folder.folderName,
        archetype:     null,
        totalDocs:     folder.documents.length,
        classified:    0,
        rejectedAtUpload: 0,
        unknownType:   folder.documents.length,
        extracted:     0,
        reconIssues:   0,
        fraudCount:    0,
        durationMs:    Date.now() - start,
        error:         msg,
      })
    }
  }

  printSummaryTable(results)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
