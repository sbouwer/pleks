/**
 * lib/extraction/extractors/donationDeclaration.ts — Donation declaration extraction wrapper
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */
import { createMessage } from "@/lib/ai/client"
import type { AiCallOptions, MessageContent } from "@/lib/ai/client"
import { DONATION_DECLARATION_EXTRACTION_SYSTEM_PROMPT } from "../prompts/extractors/donationDeclaration"
import { toMediaBlock } from "../mediaReader"
import type { Document, DonationDeclarationExtraction } from "../types"

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

export async function extractDonationDeclaration(doc: Document, aiOpts: AiOpts): Promise<DonationDeclarationExtraction | null> {
  if (!doc.format || (doc.format !== "pdf" && doc.format !== "image-jpeg" && doc.format !== "image-png")) return null

  const mediaBlock = toMediaBlock(doc)

  let text: string
  try {
    const { message } = await createMessage(
      {
        model: "claude-haiku-4-5-20251001",  // simple doc — Haiku (routing): identity/income docs stay on Sonnet
        max_tokens: 512,
        system: [{ type: "text", text: DONATION_DECLARATION_EXTRACTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: [{
          role: "user",
          content: [{ type: "text", text: "Extract fields from this donation declaration." }, mediaBlock] as MessageContent,
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
    donor_name:        str(parsed.donor_name),
    donor_relationship: str(parsed.donor_relationship),
    recipient_name:    str(parsed.recipient_name),
    amount_cents:      int(parsed.amount_cents),
    purpose:           str(parsed.purpose),
    declaration_date:  str(parsed.declaration_date),
    signed:            parsed.signed === true,
    extraction_confidence: typeof parsed.extraction_confidence === "number" ? parsed.extraction_confidence : 0,
  }
}
