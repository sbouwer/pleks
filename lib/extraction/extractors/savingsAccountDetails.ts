/**
 * lib/extraction/extractors/savingsAccountDetails.ts — Savings/investment account extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions } from "@/lib/ai/client"
import { SAVINGS_ACCOUNT_DETAILS_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/savingsAccountDetails"
import { toMediaBlock } from "../mediaReader"
import type { Document, SavingsAccountDetailsExtraction, BankName } from "../types"

type AiOpts = Pick<AiCallOptions, "orgId" | "suppressLogging" | "harnessMode">

const VALID_BANKS         = new Set<string>(["FNB", "Standard Bank", "ABSA", "Nedbank", "Capitec", "Investec", "Discovery", "TymeBank", "African Bank", "Bidvest", "other"])
const VALID_ACCOUNT_TYPES = new Set(["savings", "fixed-deposit", "money-market", "other"])

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

export async function extractSavingsAccountDetails(doc: Document, aiOpts: AiOpts): Promise<SavingsAccountDetailsExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        system: [{ type: "text", text: SAVINGS_ACCOUNT_DETAILS_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [{ type: "text", text: "Extract fields from this savings or investment account document." }, mediaBlock] as any,
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

  const bankRaw = String(parsed.bank ?? "")
  let bank: BankName | null = null
  if (VALID_BANKS.has(bankRaw)) bank = bankRaw as BankName
  else if (bankRaw) bank = "other"
  const acctTypeRaw = String(parsed.account_type ?? "other")

  return {
    bank,
    account_number_last4: str(parsed.account_number_last4),
    account_type: VALID_ACCOUNT_TYPES.has(acctTypeRaw) ? (acctTypeRaw as SavingsAccountDetailsExtraction["account_type"]) : "other",
    balance_cents:        int(parsed.balance_cents),
    balance_date:         str(parsed.balance_date),
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
