/**
 * Standalone severity classification for maintenance requests.
 * Used when the full triage pipeline isn't available (e.g. tenant portal,
 * severity re-evaluation after an update).
 *
 * The primary path is triageMaintenanceRequest() in lib/ai/maintenanceTriage.ts,
 * which returns severity as part of the single Haiku call.
 */

export type Severity = "routine" | "elevated" | "urgent" | "critical"

export interface SeverityResult {
  severity: Severity
  confidence: number
  reasoning: string
  insurance_relevant: boolean
}

const CRITICAL_KEYWORDS = new Set([
  "fire", "flood", "gas leak", "collapse", "electrocution",
  "burst main", "break-in", "burglary", "smoke", "explosion",
])

const CRITICAL_CATEGORIES = new Set([
  "fire", "flood", "structural", "gas_leak",
  "electrical_major", "break_in", "water_burst",
])

const SYSTEM_PROMPT = `You are a property incident severity classifier for South African residential properties.

Given a maintenance request title and description, output a JSON object with:
- severity: "routine" | "elevated" | "urgent" | "critical"
  - critical: fire, flood, structural collapse, gas leak, major electrical, break-in, burst main, safety to persons
  - urgent: geyser failure, sewer backup, major roof leak, broken perimeter security
  - elevated: slow leak, partial power loss, minor structural crack — potential for worsening
  - routine: standard maintenance, no escalation risk
- confidence: 0–1
- reasoning: one sentence
- insurance_relevant: true if this incident is likely to involve an insurance claim

Respond with ONLY valid JSON, no markdown:
{"severity":"...","confidence":0.9,"reasoning":"...","insurance_relevant":false}`

export async function classifySeverity(
  title: string,
  description: string,
): Promise<SeverityResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackSeverity(title, description)
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Title: ${title}\n\nDescription: ${description}` }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : ""
    const raw = JSON.parse(text) as Partial<SeverityResult>

    const validSeverities = new Set<Severity>(["routine", "elevated", "urgent", "critical"])
    const severity: Severity = validSeverities.has(raw.severity as Severity)
      ? (raw.severity as Severity)
      : "routine"

    return {
      severity,
      confidence: typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.7,
      reasoning: raw.reasoning ?? "",
      insurance_relevant: raw.insurance_relevant === true,
    }
  } catch {
    return fallbackSeverity(title, description)
  }
}

export function fallbackSeverity(
  title: string,
  description: string,
  category?: string,
  urgency?: string,
): SeverityResult {
  const text = `${title} ${description}`.toLowerCase()

  const hasCriticalKeyword  = CRITICAL_KEYWORDS  && [...CRITICAL_KEYWORDS].some((kw) => text.includes(kw))
  const hasCriticalCategory = category ? CRITICAL_CATEGORIES.has(category) : false
  const isEmergencyUrgency  = urgency === "emergency"
  const insurance_relevant  = hasCriticalKeyword

  let severity: Severity
  if (hasCriticalKeyword || hasCriticalCategory || isEmergencyUrgency) {
    severity = "critical"
  } else if (urgency === "urgent") {
    severity = "urgent"
  } else {
    severity = "routine"
  }

  return {
    severity,
    confidence: 0.6,
    reasoning:  "Derived from keywords — AI classification unavailable.",
    insurance_relevant,
  }
}
