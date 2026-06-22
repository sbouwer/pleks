/**
 * lib/extraction/extractors/employerLetter.ts — Employer letter extraction wrapper
 *
 * Calls Sonnet with prompt-cached system prompt + document media block.
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { EMPLOYER_LETTER_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/employerLetter"
import { toMediaBlock } from "../mediaReader"
import type { Document, EmployerLetterExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_EMPLOYMENT_TYPES = new Set(["permanent", "contract", "probation", "unknown"])

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

export async function extractEmployerLetter(doc: Document, aiOpts: AiOpts): Promise<EmployerLetterExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: EMPLOYER_LETTER_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this employer letter." }, mediaBlock] as any,
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

  const empTypeRaw = String(parsed.employment_type ?? "unknown")
  return {
    employer_name:             str(parsed.employer_name),
    employer_address:          str(parsed.employer_address),
    employer_contact:          str(parsed.employer_contact),
    employee_name:             str(parsed.employee_name),
    employment_start_date:     str(parsed.employment_start_date),
    employment_type:           VALID_EMPLOYMENT_TYPES.has(empTypeRaw) ? (empTypeRaw as EmployerLetterExtraction["employment_type"]) : "unknown",
    job_title:                 str(parsed.job_title),
    gross_monthly_salary_cents: int(parsed.gross_monthly_salary_cents),
    net_monthly_salary_cents:   int(parsed.net_monthly_salary_cents),
    signed:                    parsed.signed === true,
    letter_date:               str(parsed.letter_date),
    extraction_confidence:     typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
