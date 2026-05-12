/**
 * lib/maintenance/warranty.ts — Warranty subject derivation + Haiku match call
 *
 * Auth:   Server-only
 * Data:   Anthropic API via lib/ai/client.ts (logged to ai_usage)
 * Notes:  findWarrantyMatch returns null when there are no active warranties to compare,
 *         or when the AI call fails (callers degrade gracefully — no banner shown).
 *         Match prompt is conservative by design (D-60B-12): bias toward false negatives.
 */
import { createMessage } from "@/lib/ai/client"

export interface WarrantyMatchInput {
  id: string
  subject: string
  warranty_type: string
  contractor_name?: string | null
  manufacturer_name?: string | null
  expires_on: string | null
  notes?: string | null
}

export interface WarrantyMatchResult {
  match_warranty_id: string | null
  confidence: "high" | "medium" | "low" | null
  reason: string
}

/**
 * Derive a human-readable subject line for a workmanship warranty auto-created
 * from a maintenance sign-off. Pure function — no I/O.
 */
export function deriveWarrantySubject(request: {
  title: string
  unit?: { name?: string | null } | null
}): string {
  const unitPart = request.unit?.name ? ` — ${request.unit.name}` : ""
  return `${request.title}${unitPart} (workmanship)`
}

/**
 * Run a Haiku 4.5 match call against active warranties for the property.
 * Returns null if there are no warranties to compare or if the AI call fails.
 * Only high/medium confidence matches are surfaced in the UI banner — callers
 * are responsible for that gate.
 */
export async function findWarrantyMatch(
  request: {
    title: string
    description: string
    room?: string | null
    category?: string | null
  },
  warranties: WarrantyMatchInput[],
  orgId: string,
): Promise<WarrantyMatchResult | null> {
  if (warranties.length === 0) return null
  if (!process.env.ANTHROPIC_API_KEY) return null

  const warrantyList = warranties
    .map(
      (w, i) =>
        `${i + 1}. id=${w.id}
   subject: ${w.subject}
   type: ${w.warranty_type}
   provider: ${w.contractor_name ?? w.manufacturer_name ?? "unknown"}
   expires: ${w.expires_on ?? "no expiry set"}
   notes: ${w.notes ?? "—"}`,
    )
    .join("\n\n")

  const prompt = `You are matching a maintenance request to existing property warranties.

REQUEST:
  Title: ${request.title}
  Description: ${request.description}
  Room: ${request.room ?? "unspecified"}
  Category: ${request.category ?? "unspecified"}

ACTIVE WARRANTIES:
${warrantyList}

Return ONLY a JSON object on a single line:
  {"match_warranty_id":"uuid-or-null","confidence":"high"|"medium"|"low"|null,"reason":"one short sentence"}

Match conservatively. If unsure, return null for match_warranty_id. Geyser-related requests usually match geyser warranties. Roof leaks usually match roof or waterproofing warranties. Workmanship warranties only match if the new request is for a defect in the same item the contractor previously fixed.`

  try {
    const { message } = await createMessage(
      {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [{ role: "user", content: prompt }],
      },
      { orgId, purpose: "warranty_match" },
    )

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : ""
    const raw = JSON.parse(text) as Partial<WarrantyMatchResult>

    const validConfidence = new Set(["high", "medium", "low"])
    const confidence = validConfidence.has(raw.confidence as string)
      ? (raw.confidence as "high" | "medium" | "low")
      : null

    return {
      match_warranty_id: typeof raw.match_warranty_id === "string" ? raw.match_warranty_id : null,
      confidence,
      reason: raw.reason ?? "",
    }
  } catch {
    return null
  }
}
