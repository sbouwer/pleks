/**
 * lib/extraction/extractors/recommendationLetter.ts — Recommendation / reference letter extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { RECOMMENDATION_LETTER_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/recommendationLetter"
import { toMediaBlock } from "../mediaReader"
import type { Document, RecommendationLetterExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_RELATIONSHIPS = new Set(["previous-landlord", "employer", "community", "other"])
const VALID_SENTIMENTS    = new Set(["positive", "neutral", "negative"])

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

export async function extractRecommendationLetter(doc: Document, aiOpts: AiOpts): Promise<RecommendationLetterExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: RECOMMENDATION_LETTER_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this recommendation or reference letter." }, mediaBlock] as any,
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

  const relRaw  = String(parsed.recommender_relationship ?? "")
  const sentRaw = String(parsed.sentiment ?? "")
  return {
    recommender_name:          str(parsed.recommender_name),
    recommender_relationship:  VALID_RELATIONSHIPS.has(relRaw) ? (relRaw as RecommendationLetterExtraction["recommender_relationship"]) : null,
    subject_name:              str(parsed.subject_name),
    sentiment:                 VALID_SENTIMENTS.has(sentRaw) ? (sentRaw as RecommendationLetterExtraction["sentiment"]) : null,
    payment_conduct_mentioned: parsed.payment_conduct_mentioned === true,
    letter_date:               str(parsed.letter_date),
    signed:                    parsed.signed === true,
    extraction_confidence:     typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
