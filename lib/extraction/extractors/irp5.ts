/**
 * lib/extraction/extractors/irp5.ts — IRP5 employee tax certificate extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { IRP5_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/irp5"
import { toMediaBlock } from "../mediaReader"
import type { Document, IRP5Extraction } from "../types"

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

export async function extractIRP5(doc: Document, aiOpts: AiOpts): Promise<IRP5Extraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: IRP5_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this IRP5 tax certificate." }, mediaBlock] as any,
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
    employer_name:            str(parsed.employer_name),
    employee_name:            str(parsed.employee_name),
    tax_year:                 str(parsed.tax_year),
    gross_remuneration_cents: int(parsed.gross_remuneration_cents),
    paye_deducted_cents:      int(parsed.paye_deducted_cents),
    uif_employee_cents:       int(parsed.uif_employee_cents),
    income_tax_number:        str(parsed.income_tax_number),
    extraction_confidence:    typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
