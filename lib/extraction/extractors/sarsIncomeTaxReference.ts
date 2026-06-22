/**
 * lib/extraction/extractors/sarsIncomeTaxReference.ts — SARS income tax reference letter extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { SARS_INCOME_TAX_REFERENCE_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/sarsIncomeTaxReference"
import { toMediaBlock } from "../mediaReader"
import type { Document, SarsIncomeTaxReferenceExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{")
  const end   = text.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown> }
  catch { return null }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export async function extractSarsIncomeTaxReference(doc: Document, aiOpts: AiOpts): Promise<SarsIncomeTaxReferenceExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        system: [{ type: "text", text: SARS_INCOME_TAX_REFERENCE_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this SARS income tax reference letter." }, mediaBlock] as any,
        }],
      },
      { orgId: aiOpts.orgId, purpose: "document_extraction", suppressLogging: aiOpts.suppressLogging, harnessMode: aiOpts.harnessMode },
    )
    text = message.content[0].type === "text" ? message.content[0].text : ""
  } catch {
    return null
  }

  const parsed = parseJson(text)
  if (!parsed) return null

  return {
    taxpayer_name:        str(parsed.taxpayer_name),
    income_tax_number:    str(parsed.income_tax_number),
    issue_date:           str(parsed.issue_date),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
