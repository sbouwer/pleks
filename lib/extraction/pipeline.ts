/**
 * lib/extraction/pipeline.ts — Extraction pipeline (Phase 1 + Phase 2 + Phase 3)
 *
 * Orchestration: validate → format-detect → archetype-derive → doctype-classify → extract → reconcile +
 * fraud-signals. Reconciliation + fraud are DETERMINISTIC (no AI) — see reconciler.ts / fraudSignals.ts.
 *
 * Archetype is derived deterministically from unitType + applicantCount (no AI call).
 * Document type classification uses Claude Haiku per document.
 * Per-type extraction uses Claude Sonnet per document (Phase 2a: ID, payslip,
 * bank statement, employer letter, proof of address).
 *
 * Shared verbatim between production (Next.js API route) and the local harness
 * (scripts/extraction-harness/). The harness passes suppressLogging: true to suppress
 * ai_usage writes (D-14L-20).
 *
 * Spec: ADDENDUM_14L §4.2, §4.6, §4.7
 */
import { validateUpload, isProtectedPdf } from "./uploadValidator"
import { decryptProtectedPdf } from "./pdfDecrypt"
import { detectFormat } from "./formatDetector"
import { detectLanguage } from "./languageDetector"
import { deriveArchetype } from "./archetypeClassifier"
import { classifyDocumentType } from "./documentTypeClassifier"
import { extractId } from "./extractors/id"
import { extractPayslip } from "./extractors/payslip"
import { extractBankStatement } from "./extractors/bankStatement"
import { extractEmployerLetter } from "./extractors/employerLetter"
import { extractProofOfAddress } from "./extractors/proofOfAddress"
import { extractIRP5 } from "./extractors/irp5"
import { extractUI19 } from "./extractors/ui19"
import { extractNoticeOfAssessment } from "./extractors/noticeOfAssessment"
import { extractProxyLetter } from "./extractors/proxyLetter"
import { extractDisclosr } from "./extractors/disclosr"
import { extractDonationDeclaration } from "./extractors/donationDeclaration"
import { extractMotivationLetter } from "./extractors/motivationLetter"
import { extractRecommendationLetter } from "./extractors/recommendationLetter"
import { extractSalaryIncreaseLetter } from "./extractors/salaryIncreaseLetter"
import { extractSarsIncomeTaxReference } from "./extractors/sarsIncomeTaxReference"
import { extractSarsVatReference } from "./extractors/sarsVatReference"
import { extractSavingsAccountDetails } from "./extractors/savingsAccountDetails"
import { extractCreditBureauReport } from "./extractors/creditBureauReport"
import { reconcile } from "./reconciler"
import { detectFraudSignals } from "./fraudSignals"
import { extractionMatchesSlot } from "./slotType"
import type { ApplicationArchetype, ApplicationInput, Document, DocumentExtraction, PipelineResult, PipelineDocumentResult, FraudSignal } from "./types"
import type { AiCallOptions } from "@/lib/ai/client"

// PipelineResult / PipelineDocumentResult now live in ./types (so reconciler/fraud can consume them without a
// value-import cycle). Re-exported here for existing importers (e.g. the harness outputWriter).
export type { PipelineResult, PipelineDocumentResult } from "./types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

interface ClassifyResult {
  documentType: string
  confidence: number
  language: string
  classifyNote?: string
}

async function extractDocument(doc: Document, aiOpts: AiOpts): Promise<DocumentExtraction> {
  try {
    switch (doc.documentType) {
      case "id-document":             return await extractId(doc, aiOpts)
      case "payslip":                 return await extractPayslip(doc, aiOpts)
      case "bank-statement":          return await extractBankStatement(doc, aiOpts)
      case "employer-letter":         return await extractEmployerLetter(doc, aiOpts)
      case "proof-of-address":        return await extractProofOfAddress(doc, aiOpts)
      case "irp5":                    return await extractIRP5(doc, aiOpts)
      case "ui19":                    return await extractUI19(doc, aiOpts)
      case "notice-of-assessment":    return await extractNoticeOfAssessment(doc, aiOpts)
      case "proxy-letter":            return await extractProxyLetter(doc, aiOpts)
      case "disclosr":                return await extractDisclosr(doc, aiOpts)
      case "donation-declaration":    return await extractDonationDeclaration(doc, aiOpts)
      case "motivation-letter":       return await extractMotivationLetter(doc, aiOpts)
      case "recommendation-letter":   return await extractRecommendationLetter(doc, aiOpts)
      case "salary-increase-letter":  return await extractSalaryIncreaseLetter(doc, aiOpts)
      case "sars-income-tax-reference": return await extractSarsIncomeTaxReference(doc, aiOpts)
      case "sars-vat-reference":      return await extractSarsVatReference(doc, aiOpts)
      case "savings-account-details": return await extractSavingsAccountDetails(doc, aiOpts)
      case "credit-bureau-report":    return await extractCreditBureauReport(doc, aiOpts)
      default:                        return null
    }
  } catch {
    return null
  }
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
  const entry: PipelineDocumentResult = { filename: doc.filename, path: doc.path, status: "classified", format }
  // Trust the upload slot for the type (skip the Haiku classification call). Validated post-extraction.
  if (doc.slotType) {
    doc.documentType = doc.slotType
    doc.documentTypeConfidence = 1
    entry.documentType = doc.slotType
    entry.documentTypeConfidence = 1
  }
  results.push(entry)
}

async function classifyDocWithFallback(
  doc: Document,
  archetype: ApplicationArchetype,
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

/** Max concurrent per-doc AI calls within ONE application's pipeline. Bounds Sonnet/Haiku fan-out so a hot
 *  listing being screened doesn't trip provider rate limits (the cron serialises across applications). */
const AI_FANOUT = 4

/** Run fn over items with at most `limit` in flight at once. Workers pull from a shared cursor; each call writes
 *  a distinct entry, so there's no cross-write race (JS is single-threaded between awaits). */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

/** Decrypt empty-password PDFs to text so the (un-readable) encrypted bytes become extractable; a genuinely
 *  password-locked PDF is recorded rejected and excluded. Returns the docs that can proceed to classify/extract. */
async function decryptProtectedDocs(docs: Document[], results: PipelineDocumentResult[]): Promise<Document[]> {
  const extractable: Document[] = []
  for (const doc of docs) {
    if (doc.format !== "pdf" || !isProtectedPdf(doc.bytes)) {
      extractable.push(doc)
      continue
    }
    const decrypted = await decryptProtectedPdf(doc.bytes)
    if (decrypted.ok) {
      doc.textContent = decrypted.text
      extractable.push(doc)
      continue
    }
    const idx = results.findIndex(r => r.path === doc.path)
    if (idx !== -1) {
      results[idx].status = "rejected-at-upload"
      results[idx].rejectionReason = decrypted.reason === "password-required" ? "pdf-password-required" : "pdf-unreadable"
    }
  }
  return extractable
}

/** Skip-classification guardrail: flag a slot-trusted doc whose extraction doesn't match its slot (wrong doc in a
 *  slot) — agent-facing warning, never an auto-reject. */
function validateSlotTypes(docs: Document[], results: PipelineDocumentResult[]): FraudSignal[] {
  const signals: FraudSignal[] = []
  for (const doc of docs) {
    if (!doc.slotType) continue
    const res = results.find((r) => r.path === doc.path)
    if (!res || res.status !== "classified") continue
    if (extractionMatchesSlot(doc.slotType, (res.extracted as { extraction_confidence?: number } | null) ?? null, res.extractionConfidence)) continue
    signals.push({
      type: "document-type-mismatch",
      severity: "warning",
      documentPath: doc.path,
      description: `Uploaded as a ${doc.slotType.replaceAll("-", " ")} but it doesn't read as one — possibly the wrong document in that slot.`,
    })
  }
  return signals
}

export async function runPipeline(
  input: ApplicationInput,
  aiOpts: AiOpts,
): Promise<PipelineResult> {
  const results: PipelineDocumentResult[] = []
  const classifiableDocs: Document[] = []

  for (const doc of input.documents) {
    gateDocument(doc, results, classifiableDocs)
  }

  // Decrypt empty-password PDFs to text BEFORE classify/extract (Claude can't read encrypted bytes); a truly
  // password-locked PDF is marked rejected and dropped.
  const extractableDocs = await decryptProtectedDocs(classifiableDocs, results)

  // Archetype is deterministic — derived from structured application data, not documents
  const archetype = deriveArchetype(input.unitType, input.applicantCount)

  // Document type classification (D-14L-07) — ONLY for docs whose type we don't already trust from the upload
  // slot (gateDocument set documentType for slot-trusted docs). This skips the Haiku call for ID/payslip/bank/etc.
  // and only classifies the free-form "other" slot. Parallel + capped fan-out so a hot listing can't trip limits.
  const toClassify = extractableDocs.filter((d) => !d.documentType)
  await mapWithConcurrency(toClassify, AI_FANOUT, async (doc) => {
    const result = await classifyDocWithFallback(doc, archetype, aiOpts)
    applyClassification(doc, result, results)
  })

  // Phase 2a: per-type structured extraction — parallel (same cap). Must run AFTER classification (extraction
  // dispatches on doc.documentType), so it's a separate awaited pass. The single multi-page bank-statement call
  // is the latency floor here; tighter output (batch 2) is what brings that down.
  await mapWithConcurrency(extractableDocs, AI_FANOUT, async (doc) => {
    const extraction = await extractDocument(doc, aiOpts)
    if (extraction === null) return
    const idx = results.findIndex(r => r.path === doc.path)
    if (idx !== -1) {
      results[idx].extracted            = extraction
      results[idx].extractionConfidence = extraction.extraction_confidence
    }
  })

  // Skip-classification guardrail: a slot-trusted doc whose extraction doesn't match its slot is flagged (a wrong
  // doc in a slot), not silently extracted as junk. Agent-facing warning, never an auto-reject.
  const mismatchSignals = validateSlotTypes(extractableDocs, results)

  // Phase 3: deterministic reconciliation + heuristic fraud signals over the extractions (no AI).
  const reconciliation = reconcile(results, input.declared, new Date())
  const fraudSignals = [...detectFraudSignals(input.documents, results), ...mismatchSignals]

  return { archetype, documents: results, reconciliation, fraudSignals }
}
