/**
 * lib/extraction/extractors/noticeOfAssessment.ts — SARS IT34 Notice of Assessment extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions, MessageContent } from "@/lib/ai/client"
import { NOTICE_OF_ASSESSMENT_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/noticeOfAssessment"
import { toMediaBlock } from "../mediaReader"
import type { Document, NoticeOfAssessmentExtraction } from "../types"

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

export async function extractNoticeOfAssessment(doc: Document, aiOpts: AiOpts): Promise<NoticeOfAssessmentExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: NOTICE_OF_ASSESSMENT_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: [{ type: "text", text: "Extract fields from this SARS Notice of Assessment." }, mediaBlock] as MessageContent,
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
    tax_year:               str(parsed.tax_year),
    assessment_date:        str(parsed.assessment_date),
    taxable_income_cents:   int(parsed.taxable_income_cents),
    tax_payable_cents:      int(parsed.tax_payable_cents),
    income_tax_number:      str(parsed.income_tax_number),
    extraction_confidence:  typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
