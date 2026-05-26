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
// Next.js uses .env.local; load it explicitly for harness runs
config({ path: ".env.local" })
config() // also loads .env if present
import { loadTestFolders } from "./lib/filesystem"
import { runPipeline } from "../../lib/extraction/pipeline"
import { writeOutput } from "./lib/outputWriter"
import { printSummaryTable } from "./lib/reporter"
import type { HarnessRunResult } from "./lib/reporter"

async function main() {
  console.log("Extraction Harness — Phase 1 (classification only)")
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
    process.stdout.write(`Processing ${folder.folderName} (${folder.documents.length} docs)... `)

    try {
      const pipelineResult = await runPipeline(
        folder.documents,
        { source: "harness" },
        { orgId: null, suppressLogging: true, harnessMode: true },
      )

      writeOutput(folder.folderName, pipelineResult)

      const classified      = pipelineResult.documents.filter(d => d.status === "classified").length
      const rejectedAtUpload = pipelineResult.documents.filter(d => d.status === "rejected-at-upload").length
      const unknownType     = pipelineResult.documents.filter(
        d => d.status === "classified" && d.documentType === "unknown",
      ).length
      const durationMs = Date.now() - start

      results.push({
        folderName:          folder.folderName,
        archetype:           pipelineResult.archetype,
        archetypeConfidence: pipelineResult.archetypeConfidence,
        totalDocs:           folder.documents.length,
        classified,
        rejectedAtUpload,
        unknownType,
        durationMs,
      })

      console.log(`done (${durationMs}ms)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAILED`)
      results.push({
        folderName:          folder.folderName,
        archetype:           null,
        archetypeConfidence: 0,
        totalDocs:           folder.documents.length,
        classified:          0,
        rejectedAtUpload:    0,
        unknownType:         folder.documents.length,
        durationMs:          Date.now() - start,
        error:               msg,
      })
    }
  }

  printSummaryTable(results)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
