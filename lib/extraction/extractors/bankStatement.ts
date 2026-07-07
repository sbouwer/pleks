/**
 * lib/extraction/extractors/bankStatement.ts — Bank statement extraction wrapper
 *
 * Calls Sonnet with prompt-cached system prompt + document media block.
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions, MessageContent } from "@/lib/ai/client"
import { BANK_STATEMENT_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/bankStatement"
import { toMediaBlock } from "../mediaReader"
import type { Document, BankStatementExtraction, BankName } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_BANKS = new Set<string>([
  "FNB", "Standard Bank", "ABSA", "Nedbank", "Capitec",
  "Investec", "Discovery", "TymeBank", "African Bank", "Bidvest", "other",
])
const VALID_ACCOUNT_TYPES  = new Set(["cheque", "savings", "credit", "transmission", "other"])
const VALID_INFLOW_CATS    = new Set(["salary", "rental-deposit", "transfer", "refund", "other"])
const VALID_OUTFLOW_CATS   = new Set(["rent", "home-loan", "debit-order", "utility", "retail", "atm", "transfer", "loan", "other"])

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

function parseInflowRow(v: unknown): BankStatementExtraction["inflows"][number] | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const date   = str(r.date)
  const amount = int(r.amount_cents)
  const cat    = VALID_INFLOW_CATS.has(String(r.counterparty_category)) ? String(r.counterparty_category) : "other"
  const label  = str(r.counterparty_label) ?? "other"
  if (!date || amount === null || amount <= 0) return null
  return { date, amount_cents: amount, counterparty_category: cat as BankStatementExtraction["inflows"][number]["counterparty_category"], counterparty_label: label }
}

function parseMonthlyRow(v: unknown): BankStatementExtraction["monthly_summary"][number] | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const month = str(r.month)
  if (!month) return null
  return { month, closing_balance_cents: int(r.closing_balance_cents) }
}

function parseOutflowRow(v: unknown): BankStatementExtraction["outflows"][number] | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const date   = str(r.date)
  const amount = int(r.amount_cents)
  const cat    = VALID_OUTFLOW_CATS.has(String(r.counterparty_category)) ? String(r.counterparty_category) : "other"
  const label  = str(r.counterparty_label) ?? "other"
  if (!date || amount === null || amount <= 0) return null
  return { date, amount_cents: amount, counterparty_category: cat as BankStatementExtraction["outflows"][number]["counterparty_category"], counterparty_label: label }
}

export async function extractBankStatement(doc: Document, aiOpts: AiOpts): Promise<BankStatementExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: [{ type: "text", text: BANK_STATEMENT_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: [{ type: "text", text: "Extract all fields from this bank statement." }, mediaBlock] as MessageContent,
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

  const bankRaw = String(parsed.bank ?? "other")
  const bank: BankName = VALID_BANKS.has(bankRaw) ? (bankRaw as BankName) : "other"

  const rawInflows  = Array.isArray(parsed.inflows)  ? parsed.inflows  : []
  const rawOutflows = Array.isArray(parsed.outflows)  ? parsed.outflows : []
  const inflows     = rawInflows.map(parseInflowRow).filter((r): r is NonNullable<typeof r> => r !== null)
  const outflows    = rawOutflows.map(parseOutflowRow).filter((r): r is NonNullable<typeof r> => r !== null)

  const indicators = parsed.income_indicators && typeof parsed.income_indicators === "object"
    ? parsed.income_indicators as Record<string, unknown>
    : {}

  return {
    bank,
    account_number_last4: str(parsed.account_number_last4),
    account_type:         VALID_ACCOUNT_TYPES.has(String(parsed.account_type)) ? (parsed.account_type as BankStatementExtraction["account_type"]) : "other",
    statement_period_from: str(parsed.statement_period_from),
    statement_period_to:   str(parsed.statement_period_to),
    opening_balance_cents: int(parsed.opening_balance_cents),
    closing_balance_cents: int(parsed.closing_balance_cents),
    inflows,
    outflows,
    income_indicators: {
      regular_salary_detected:      indicators.regular_salary_detected === true,
      average_monthly_inflow_cents: int(indicators.average_monthly_inflow_cents),
      debit_order_volume_cents:     int(indicators.debit_order_volume_cents),
      end_of_month_dip_detected:    indicators.end_of_month_dip_detected === true,
    },
    monthly_summary:      (Array.isArray(parsed.monthly_summary) ? parsed.monthly_summary : []).map(parseMonthlyRow).filter((r): r is NonNullable<typeof r> => r !== null),
    returned_debit_count: int(parsed.returned_debit_count),
    overdraft_days:       int(parsed.overdraft_days),
    lowest_balance_cents: int(parsed.lowest_balance_cents),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
