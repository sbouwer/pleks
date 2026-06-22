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
import type { ApplicationArchetype, ApplicationInput, Document, DocumentExtraction, PipelineResult, PipelineDocumentResult } from "./types"
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
  results.push({ filename: doc.filename, path: doc.path, status: "classified", format })
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

  // Document type classification — per classifiable document (D-14L-07)
  for (const doc of extractableDocs) {
    const result = await classifyDocWithFallback(doc, archetype, aiOpts)
    applyClassification(doc, result, results)
  }

  // Phase 2a: per-type structured extraction (ID, payslip, bank statement, employer letter, proof of address)
  for (const doc of extractableDocs) {
    const extraction = await extractDocument(doc, aiOpts)
    if (extraction !== null) {
      const idx = results.findIndex(r => r.path === doc.path)
      if (idx !== -1) {
        results[idx].extracted            = extraction
        results[idx].extractionConfidence = extraction.extraction_confidence
      }
    }
  }

  // Phase 3: deterministic reconciliation + heuristic fraud signals over the extractions (no AI).
  const reconciliation = reconcile(results, input.declared, new Date())
  const fraudSignals = detectFraudSignals(input.documents, results)

  return { archetype, documents: results, reconciliation, fraudSignals }
}
