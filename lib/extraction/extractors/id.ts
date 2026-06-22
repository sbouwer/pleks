/**
 * lib/extraction/extractors/id.ts — SA ID document extraction wrapper
 *
 * Calls Sonnet with prompt-cached system prompt + document media block.
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { ID_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/id"
import { toMediaBlock } from "../mediaReader"
import type { Document, IDExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_DOC_TYPES = new Set(["sa-id-book", "sa-smart-id", "passport", "other"])
const VALID_GENDER    = new Set(["M", "F"])
const VALID_CITIZEN   = new Set(["SA", "non-SA"])

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

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null
}

export async function extractId(doc: Document, aiOpts: AiOpts): Promise<IDExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: ID_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this identity document." }, mediaBlock] as any,
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
    document_type:        VALID_DOC_TYPES.has(String(parsed.document_type)) ? (parsed.document_type as IDExtraction["document_type"]) : "other",
    full_name:            str(parsed.full_name),
    id_number:            str(parsed.id_number),
    date_of_birth:        str(parsed.date_of_birth),
    gender:               VALID_GENDER.has(String(parsed.gender)) ? (parsed.gender as "M" | "F") : null,
    citizenship:          VALID_CITIZEN.has(String(parsed.citizenship)) ? (parsed.citizenship as "SA" | "non-SA") : null,
    expiry_date:          str(parsed.expiry_date),
    extraction_confidence: num(parsed.extraction_confidence) ?? 0,
  }
}
