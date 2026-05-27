/**
 * lib/extraction/extractors/payslip.ts — Payslip extraction wrapper (EN + AF)
 *
 * Calls Sonnet with prompt-cached system prompt + document media block.
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { PAYSLIP_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/payslip"
import { toMediaBlock } from "../mediaReader"
import type { Document, PayslipExtraction } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_LANGUAGE       = new Set(["en", "af", "mixed"])
const VALID_PAYMENT_METHOD = new Set(["eft", "cash", "cheque", "unknown"])

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

function deductionRow(v: unknown): { label: string; amount_cents: number } | null {
  if (!v || typeof v !== "object") return null
  const row = v as Record<string, unknown>
  const label = str(row.label)
  const amount = int(row.amount_cents)
  if (!label || amount === null || amount < 0) return null
  return { label, amount_cents: amount }
}

export async function extractPayslip(doc: Document, aiOpts: AiOpts): Promise<PayslipExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc.bytes, doc.format, doc.filename)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: [{ type: "text", text: PAYSLIP_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this payslip." }, mediaBlock] as any,
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

  const rawDeductions = Array.isArray(parsed.deductions) ? parsed.deductions : []
  const deductions = rawDeductions.map(deductionRow).filter((d): d is NonNullable<typeof d> => d !== null)

  return {
    employer_name:        str(parsed.employer_name),
    employee_name:        str(parsed.employee_name),
    pay_period:           str(parsed.pay_period),
    language:             VALID_LANGUAGE.has(String(parsed.language)) ? (parsed.language as "en" | "af" | "mixed") : "en",
    gross_pay_cents:      int(parsed.gross_pay_cents),
    net_pay_cents:        int(parsed.net_pay_cents),
    deductions,
    ytd_gross_cents:      int(parsed.ytd_gross_cents),
    ytd_paye_cents:       int(parsed.ytd_paye_cents),
    payment_method:       VALID_PAYMENT_METHOD.has(String(parsed.payment_method)) ? (parsed.payment_method as PayslipExtraction["payment_method"]) : "unknown",
    bank_account_last4:   str(parsed.bank_account_last4),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
