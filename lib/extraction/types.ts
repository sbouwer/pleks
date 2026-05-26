/**
 * lib/extraction/types.ts — Document extraction pipeline type definitions
 *
 * Spec: ADDENDUM_14L §4.4
 */

export type DocumentFormat =
  | "pdf"
  | "image-jpeg"
  | "image-png"
  | "image-other"
  | "docx"
  | "odt"
  | "psd"
  | "unknown"

export type ApplicationArchetype =
  | "residential-single"
  | "residential-single-destressed"
  | "residential-single-family"
  | "residential-single-guarantee"
  | "residential-multi"
  | "commercial-single-director"
  | "commercial-multi-director"

export type DocumentType =
  | "id-document"
  | "payslip"
  | "bank-statement"
  | "employer-letter"
  | "irp5"
  | "ui19"
  | "notice-of-assessment"
  | "proof-of-address"
  | "proxy-letter"
  | "disclosr"
  | "donation-declaration"
  | "motivation-letter"
  | "recommendation-letter"
  | "salary-increase-letter"
  | "sars-income-tax-reference"
  | "sars-vat-reference"
  | "savings-account-details"
  | "credit-bureau-report"
  | "application-form"
  | "work-contract"
  | "reference-letter"
  | "unknown"

export interface Document {
  path: string
  filename: string
  bytes: Uint8Array
  mimeType: string
  format?: DocumentFormat
  documentType?: DocumentType
  documentTypeConfidence?: number
  language?: "en" | "af" | "mixed" | "unknown"
}

export interface ApplicationInput {
  archetype: ApplicationArchetype | null
  documents: Document[]
  metadata: {
    source: "harness" | "production"
    orgId?: string
    applicationId?: string
  }
}

export interface ExtractedField<T> {
  value: T
  confidence: number
  sourceDocumentPath: string
  rawText?: string
}

export interface CrossDocumentReconciliation {
  field: string
  sources: Array<{ documentPath: string; value: unknown }>
  resolved: unknown
  conflict: boolean
  conflictNote?: string
}

export type FraudSignalSeverity = "low" | "medium" | "high"

export interface FraudSignal {
  type: string
  severity: FraudSignalSeverity
  description: string
  affectedDocuments: string[]
}

export interface ApplicationExtraction {
  applicationId?: string
  archetype: ApplicationArchetype | null
  documents: Document[]
  reconciliation: CrossDocumentReconciliation[]
  fraudSignals: FraudSignal[]
  metadata: {
    processedAt: string
    totalDocuments: number
    successfulExtractions: number
  }
}
