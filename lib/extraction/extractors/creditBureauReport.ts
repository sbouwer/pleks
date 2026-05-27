/**
 * lib/extraction/extractors/creditBureauReport.ts — Credit bureau report extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { CREDIT_BUREAU_REPORT_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/creditBureauReport"
import { toMediaBlock } from "../mediaReader"
import type { Document, CreditBureauReportExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_BUREAUS = new Set(["TransUnion", "Experian", "Compuscan", "XDS", "other"])

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

export async function extractCreditBureauReport(doc: Document, aiOpts: AiOpts): Promise<CreditBureauReportExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc.bytes, doc.format, doc.filename)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: [{ type: "text", text: CREDIT_BUREAU_REPORT_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this credit bureau report." }, mediaBlock] as any,
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

  const bureauRaw = String(parsed.bureau ?? "")
  let bureau: CreditBureauReportExtraction["bureau"] = null
  if (VALID_BUREAUS.has(bureauRaw)) bureau = bureauRaw as CreditBureauReportExtraction["bureau"]
  else if (bureauRaw) bureau = "other"

  return {
    subject_name:                   str(parsed.subject_name),
    report_date:                    str(parsed.report_date),
    credit_score:                   int(parsed.credit_score),
    total_accounts:                 int(parsed.total_accounts),
    accounts_in_arrears:            int(parsed.accounts_in_arrears),
    adverse_listings:               int(parsed.adverse_listings),
    total_monthly_obligations_cents: int(parsed.total_monthly_obligations_cents),
    bureau,
    extraction_confidence:          typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
