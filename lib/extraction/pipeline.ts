/**
 * lib/extraction/pipeline.ts — Phase 1 extraction pipeline
 *
 * Orchestration: validate → format-detect → archetype-classify → doctype-classify → language
 *
 * Shared verbatim between production (Next.js API route) and the local harness
 * (scripts/extraction-harness/). The harness passes suppressLogging: true to suppress
 * ai_usage writes (D-14L-20).
 *
 * Spec: ADDENDUM_14L §4.2
 */
import { validateUpload } from "./uploadValidator"
import { detectFormat } from "./formatDetector"
import { detectLanguage } from "./languageDetector"
import { classifyArchetype } from "./archetypeClassifier"
import { classifyDocumentType } from "./documentTypeClassifier"
import type { ApplicationArchetype, Document } from "./types"
import type { AiCallOptions } from "@/lib/ai/client"

export interface PipelineDocumentResult {
  filename: string
  path: string
  status: "classified" | "rejected-at-upload"
  rejectionReason?: string
  format?: string
  documentType?: string
  documentTypeConfidence?: number
  language?: string
  classifyNote?: string
}

export interface PipelineResult {
  archetype: ApplicationArchetype | null
  archetypeConfidence: number
  documents: PipelineDocumentResult[]
}

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

interface ClassifyResult {
  documentType: string
  confidence: number
  language: string
  classifyNote?: string
}

function gateDocument(
  doc: Document,
  results: PipelineDocumentResult[],
  classifiableDocs: Document[],
): void {
  const validation = validateUpload(doc.filename, doc.mimeType, doc.bytes)
  if (!validation.valid) {
    const language = detectLanguage(doc.filename)
    doc.language = language
    results.push({
      filename:        doc.filename,
      path:            doc.path,
      status:          "rejected-at-upload",
      rejectionReason: validation.rejectionReason ?? "unknown",
      language,
    })
    return
  }
  const format = detectFormat(doc.filename, doc.bytes)
  doc.format = format
  classifiableDocs.push(doc)
  results.push({ filename: doc.filename, path: doc.path, status: "classified", format })
}

async function classifyDocWithFallback(
  doc: Document,
  archetype: ApplicationArchetype | null,
  aiOpts: AiOpts,
): Promise<ClassifyResult> {
  try {
    return await classifyDocumentType(doc, archetype, aiOpts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const classifyNote = msg.includes("password protected") ? "protected-pdf" : "classification-error"
    return { documentType: "unknown", confidence: 0, language: detectLanguage(doc.filename), classifyNote }
  }
}

function applyClassification(
  doc: Document,
  result: ClassifyResult,
  results: PipelineDocumentResult[],
): void {
  doc.documentType           = result.documentType as typeof doc.documentType
  doc.documentTypeConfidence = result.confidence
  doc.language               = result.language as typeof doc.language

  const idx = results.findIndex(r => r.path === doc.path)
  if (idx === -1) return
  results[idx].documentType           = result.documentType
  results[idx].documentTypeConfidence = result.confidence
  results[idx].language               = result.language
  if (result.classifyNote) results[idx].classifyNote = result.classifyNote
}

export async function runPipeline(
  documents: Document[],
  _metadata: { source: "harness" | "production"; orgId?: string; applicationId?: string },
  aiOpts: AiOpts,
): Promise<PipelineResult> {
  const results: PipelineDocumentResult[] = []
  const classifiableDocs: Document[] = []

  for (const doc of documents) {
    gateDocument(doc, results, classifiableDocs)
  }

  // Archetype classification — filenames only, no document content (D-14L-06)
  const allFilenames = documents.map(d => d.filename)
  const { archetype, confidence: archetypeConfidence } = await classifyArchetype(allFilenames, aiOpts)

  // Document type classification — per classifiable document (D-14L-07)
  for (const doc of classifiableDocs) {
    const result = await classifyDocWithFallback(doc, archetype, aiOpts)
    applyClassification(doc, result, results)
  }

  return { archetype, archetypeConfidence, documents: results }
}
