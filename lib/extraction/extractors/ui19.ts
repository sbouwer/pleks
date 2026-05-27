/**
 * lib/extraction/extractors/ui19.ts — UI19 UIF form extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { UI19_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/ui19"
import { toMediaBlock } from "../mediaReader"
import type { Document, UI19Extraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_REASONS = new Set(["retrenchment", "resignation", "dismissal", "contract-expiry", "other"])

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

export async function extractUI19(doc: Document, aiOpts: AiOpts): Promise<UI19Extraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc.bytes, doc.format, doc.filename)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: UI19_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this UI-19 form." }, mediaBlock] as any,
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

  const reasonRaw = String(parsed.reason_for_termination ?? "")
  return {
    employee_name:             str(parsed.employee_name),
    employer_name:             str(parsed.employer_name),
    date_of_termination:       str(parsed.date_of_termination),
    reason_for_termination:    VALID_REASONS.has(reasonRaw) ? (reasonRaw as UI19Extraction["reason_for_termination"]) : null,
    last_monthly_salary_cents: int(parsed.last_monthly_salary_cents),
    extraction_confidence:     typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
