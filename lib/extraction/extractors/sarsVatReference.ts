/**
 * lib/extraction/extractors/sarsVatReference.ts — SARS VAT registration certificate extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { SARS_VAT_REFERENCE_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/sarsVatReference"
import { toMediaBlock } from "../mediaReader"
import type { Document, SarsVatReferenceExtraction } from "../types"

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

export async function extractSarsVatReference(doc: Document, aiOpts: AiOpts): Promise<SarsVatReferenceExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc.bytes, doc.format, doc.filename)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        system: [{ type: "text", text: SARS_VAT_REFERENCE_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this SARS VAT registration certificate." }, mediaBlock] as any,
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
    entity_name:          str(parsed.entity_name),
    vat_number:           str(parsed.vat_number),
    registration_date:    str(parsed.registration_date),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
