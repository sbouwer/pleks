/**
 * scripts/extraction-harness/lib/outputWriter.ts — Write pipeline results to disk
 *
 * Outputs go to brief/build/_HARNESS_OUTPUT/ (gitignored).
 * Extracted PII is redacted via redactor.ts before write — harness output
 * is a POPIA-safe research artefact, not an operational record (D-14L-04).
 *
 * Spec: ADDENDUM_14L §4.5, §5.2
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { PipelineResult } from "../../../lib/extraction/pipeline"
import { redactExtraction } from "./redactor"

const __dirname  = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, "../../../brief/build/_HARNESS_OUTPUT")

export function writeOutput(folderName: string, result: PipelineResult): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const outPath = join(OUTPUT_DIR, `${folderName}.json`)
  const safeResult = {
    archetype: result.archetype,
    documents: result.documents.map(doc => ({
      filename:              doc.filename,
      path:                  doc.path,
      status:                doc.status,
      rejectionReason:       doc.rejectionReason,
      format:                doc.format,
      documentType:          doc.documentType,
      documentTypeConfidence: doc.documentTypeConfidence,
      language:              doc.language,
      classifyNote:          doc.classifyNote,
      extractionConfidence:  doc.extractionConfidence,
      extracted:             redactExtraction(doc.documentType, doc.extracted ?? null),
    })),
  }
  writeFileSync(outPath, JSON.stringify(safeResult, null, 2), "utf-8")
}
