/**
 * scripts/extraction-harness/lib/outputWriter.ts — Write pipeline results to disk
 *
 * Outputs go to brief/build/_HARNESS_OUTPUT/ (gitignored).
 * Phase 1 output is purely structural (format, docType, archetype) — no PII extracted yet.
 *
 * Spec: ADDENDUM_14L §4.5
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { PipelineResult } from "../../../lib/extraction/pipeline"

const __dirname  = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, "../../../brief/build/_HARNESS_OUTPUT")

export function writeOutput(folderName: string, result: PipelineResult): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outPath = join(OUTPUT_DIR, `${folderName}.json`)
  // Phase 1: no PII in extraction output (bytes not serialised, only metadata)
  const safeResult = {
    archetype:           result.archetype,
    archetypeConfidence: result.archetypeConfidence,
    documents:           result.documents,
  }
  writeFileSync(outPath, JSON.stringify(safeResult, null, 2), "utf-8")
}
