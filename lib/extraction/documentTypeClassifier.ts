/**
 * lib/extraction/documentTypeClassifier.ts — Classify document type via Claude Haiku
 *
 * Uses Haiku with cached system prompt + archetype hint. Sends document content block.
 * Only called for pdf/image-jpeg/image-png — rejected formats skip this step.
 *
 * Spec: ADDENDUM_14L D-14L-07
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions, MessageContent } from "@/lib/ai/client"
import { DOCUMENT_TYPE_SYSTEM_PROMPT, DOCUMENT_TYPE_USER_TEMPLATE } from "./prompts/documentType"
import { toMediaBlock } from "./mediaReader"
import type { ApplicationArchetype, Document, DocumentType } from "./types"

const VALID_DOC_TYPES = new Set<string>([
  "id-document", "payslip", "bank-statement", "employer-letter", "irp5", "ui19",
  "notice-of-assessment", "proof-of-address", "proxy-letter", "disclosr",
  "donation-declaration", "motivation-letter", "recommendation-letter",
  "salary-increase-letter", "sars-income-tax-reference", "sars-vat-reference",
  "savings-account-details", "credit-bureau-report", "application-form",
  "work-contract", "reference-letter", "unknown",
])

const VALID_LANGUAGES = new Set(["en", "af", "mixed", "unknown"])

export async function classifyDocumentType(
  doc: Document,
  archetype: ApplicationArchetype | null,
  aiOpts: Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">,
): Promise<{ documentType: DocumentType; confidence: number; language: "en" | "af" | "mixed" | "unknown" }> {
  const fmt = doc.format
  if (!fmt || (fmt !== "pdf" && fmt !== "image-jpeg" && fmt !== "image-png")) {
    return { documentType: "unknown", confidence: 0, language: "unknown" }
  }

  const mediaBlock = toMediaBlock(doc)
  const archetypeHint = archetype ?? "unknown"

  const { message } = await createMessage(
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: [
        {
          type: "text",
          text: DOCUMENT_TYPE_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          // The content array mixes TextBlockParam + DocumentBlockParam/ImageBlockParam.
          // The inline types are structurally compatible with the SDK's ContentBlockParam union.
          content: [
            { type: "text", text: DOCUMENT_TYPE_USER_TEMPLATE(archetypeHint, doc.filename) },
            mediaBlock,
          ] as MessageContent,
        },
      ],
    },
    {
      orgId: aiOpts.orgId,
      purpose: "document_type_classification",
      suppressLogging: aiOpts.suppressLogging,
      harnessMode: aiOpts.harnessMode,
    },
  )

  const text = message.content[0].type === "text" ? message.content[0].text : ""
  const jsonStart = text.indexOf("{")
  const jsonEnd   = text.lastIndexOf("}")
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    return { documentType: "unknown", confidence: 0, language: "unknown" }
  }

  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    documentType?: string
    confidence?: number
    language?: string
  }
  const documentType = parsed.documentType && VALID_DOC_TYPES.has(parsed.documentType)
    ? (parsed.documentType as DocumentType)
    : "unknown"
  const language = parsed.language && VALID_LANGUAGES.has(parsed.language)
    ? (parsed.language as "en" | "af" | "mixed" | "unknown")
    : "unknown"

  return { documentType, confidence: parsed.confidence ?? 0, language }
}
