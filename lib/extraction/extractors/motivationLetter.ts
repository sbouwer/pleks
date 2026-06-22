/**
 * lib/extraction/extractors/motivationLetter.ts — Motivation letter extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { MOTIVATION_LETTER_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/motivationLetter"
import { toMediaBlock } from "../mediaReader"
import type { Document, MotivationLetterExtraction } from "../types"

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

function int(v: unknown): number | null {
  if (typeof v !== "number" || !isFinite(v)) return null
  return Math.round(v)
}

export async function extractMotivationLetter(doc: Document, aiOpts: AiOpts): Promise<MotivationLetterExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-haiku-4-5-20251001",  // simple doc — Haiku (routing): identity/income docs stay on Sonnet
        max_tokens: 1024,
        system: [{ type: "text", text: MOTIVATION_LETTER_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this motivation letter." }, mediaBlock] as any,
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
    applicant_name:            str(parsed.applicant_name),
    stated_reason_for_moving:  str(parsed.stated_reason_for_moving),
    pets_mentioned:            parsed.pets_mentioned === true,
    employment_mentioned:      parsed.employment_mentioned === true,
    references_mentioned:      parsed.references_mentioned === true,
    letter_date:               str(parsed.letter_date),
    word_count:                int(parsed.word_count),
    extraction_confidence:     typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
