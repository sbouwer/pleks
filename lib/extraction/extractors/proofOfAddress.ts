/**
 * lib/extraction/extractors/proofOfAddress.ts — Proof of address extraction wrapper
 *
 * Calls Sonnet with prompt-cached system prompt + document media block.
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions, MessageContent } from "@/lib/ai/client"
import { PROOF_OF_ADDRESS_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/proofOfAddress"
import { toMediaBlock } from "../mediaReader"
import type { Document, ProofOfAddressExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_SUBTYPES = new Set(["utility-bill", "municipal-account", "bank-letter", "lease", "other"])

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

export async function extractProofOfAddress(doc: Document, aiOpts: AiOpts): Promise<ProofOfAddressExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-haiku-4-5-20251001",  // simple doc — Haiku (routing): identity/income docs stay on Sonnet
        max_tokens: 512,
        system: [{ type: "text", text: PROOF_OF_ADDRESS_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: [{ type: "text", text: "Extract fields from this proof of address document." }, mediaBlock] as MessageContent,
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

  const subtypeRaw = String(parsed.document_subtype ?? "other")
  return {
    document_subtype:     VALID_SUBTYPES.has(subtypeRaw) ? (subtypeRaw as ProofOfAddressExtraction["document_subtype"]) : "other",
    full_name:            str(parsed.full_name),
    address_line1:        str(parsed.address_line1),
    suburb:               str(parsed.suburb),
    city:                 str(parsed.city),
    province:             str(parsed.province),
    postal_code:          str(parsed.postal_code),
    document_date:        str(parsed.document_date),
    issuer:               str(parsed.issuer),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
