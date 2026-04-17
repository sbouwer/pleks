export interface TriageResult {
  category: string
  urgency: string
  urgency_reason: string
  suggested_action: string
  severity: "routine" | "elevated" | "urgent" | "critical"
  insurance_relevant: boolean
}

const SYSTEM_PROMPT = `You are a property maintenance triage assistant for South African residential properties.

Given a maintenance request title and description, classify it into:

1. **category** — one of: electrical, plumbing, hvac, structural, roofing, windows_doors, appliances, garden, pest_control, painting, flooring, security, access_control, cleaning, other

2. **urgency** — one of:
   - emergency: immediate risk to health, safety, or property (burst pipe, gas leak, no power to whole unit, fire damage, structural failure)
   - urgent: significant inconvenience or risk of worsening (blocked drain, broken geyser, broken lock/door, leaking roof, pest infestation)
   - routine: standard maintenance needed within 1–2 weeks
   - cosmetic: aesthetic issues only, schedule at convenience

3. **urgency_reason** — one sentence explaining why this urgency was assigned

4. **suggested_action** — one sentence on what should happen next

5. **severity** — incident severity for insurance and escalation purposes, one of:
   - critical: fire, flood, structural damage/collapse, gas leak, major electrical fault, break-in/burglary, burst water main, safety to persons implicated
   - urgent: significant damage risk or health hazard (geyser failure, sewer backup, major roof leak, broken perimeter security)
   - elevated: potential for worsening if not addressed promptly (slow leak, partial power loss, minor structural crack)
   - routine: standard maintenance with no escalation risk

6. **insurance_relevant** — true if the incident is likely to involve an insurance claim (fire, flood, structural damage, theft, major water damage, storm damage), false otherwise

Respond with ONLY valid JSON, no markdown, no explanation:
{"category":"...","urgency":"...","urgency_reason":"...","suggested_action":"...","severity":"...","insurance_relevant":false}`

export async function triageMaintenanceRequest(
  title: string,
  description: string,
): Promise<TriageResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackTriage(title, description)
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Title: ${title}\n\nDescription: ${description}`,
        },
      ],
    })

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : ""
    const raw = JSON.parse(text) as Partial<TriageResult>

    const validCategories = ["electrical", "plumbing", "hvac", "structural", "roofing", "windows_doors", "appliances", "garden", "pest_control", "painting", "flooring", "security", "access_control", "cleaning", "other"]
    const validUrgencies  = ["emergency", "urgent", "routine", "cosmetic"]
    const validSeverities = ["routine", "elevated", "urgent", "critical"] as const

    return {
      category:          validCategories.includes(raw.category ?? "") ? (raw.category ?? "other") : "other",
      urgency:           validUrgencies.includes(raw.urgency ?? "")   ? (raw.urgency  ?? "routine") : "routine",
      urgency_reason:    raw.urgency_reason    ?? "",
      suggested_action:  raw.suggested_action  ?? "",
      severity:          validSeverities.includes(raw.severity as typeof validSeverities[number]) ? (raw.severity as typeof validSeverities[number]) : "routine",
      insurance_relevant: raw.insurance_relevant === true,
    }
  } catch {
    return fallbackTriage(title, description)
  }
}

// ── Severity-only derivation (for updates / tenant-submitted requests) ─────────

export type Severity = "routine" | "elevated" | "urgent" | "critical"

const CRITICAL_KEYWORDS = ["fire", "flood", "gas leak", "collapse", "electrocution", "burst main", "break-in", "burglary", "smoke", "explosion"]
const CRITICAL_CATEGORIES = new Set(["fire", "flood", "structural", "gas_leak", "electrical_major", "break_in", "water_burst"])

export function deriveSeverityFromTriage(
  category: string,
  urgency: string,
  title: string,
  description: string,
): Severity {
  const text = `${title} ${description}`.toLowerCase()
  if (
    CRITICAL_KEYWORDS.some((kw) => text.includes(kw)) ||
    CRITICAL_CATEGORIES.has(category) ||
    urgency === "emergency"
  ) {
    return "critical"
  }
  if (urgency === "urgent") return "urgent"
  return "routine"
}

function fallbackTriage(title: string, description: string): TriageResult {
  const text = `${title} ${description}`.toLowerCase()

  let category = "other"
  let urgency = "routine"

  if (text.includes("leak") || text.includes("tap") || text.includes("drain") || text.includes("geyser") || text.includes("pipe") || text.includes("burst")) category = "plumbing"
  else if (text.includes("power") || text.includes("socket") || text.includes("light") || text.includes("circuit") || text.includes("electric") || text.includes("breaker")) category = "electrical"
  else if (text.includes("aircon") || text.includes("heating") || text.includes("hvac") || text.includes("air con")) category = "hvac"
  else if (text.includes("crack") || text.includes("wall") || text.includes("roof") || text.includes("ceiling") || text.includes("structural")) category = "structural"
  else if (text.includes("window") || text.includes("door") || text.includes("lock") || text.includes("hinge")) category = "windows_doors"
  else if (text.includes("stove") || text.includes("oven") || text.includes("dishwasher") || text.includes("fridge") || text.includes("washing machine")) category = "appliances"
  else if (text.includes("garden") || text.includes("lawn") || text.includes("tree") || text.includes("braai")) category = "garden"
  else if (text.includes("pest") || text.includes("rat") || text.includes("cockroach") || text.includes("termite") || text.includes("ant")) category = "pest_control"
  else if (text.includes("paint") || text.includes("repaint")) category = "painting"
  else if (text.includes("alarm") || text.includes("security") || text.includes("gate") || text.includes("camera")) category = "security"
  else if (text.includes("floor") || text.includes("tile") || text.includes("carpet")) category = "flooring"

  if (text.includes("emergency") || text.includes("flood") || text.includes("fire") || text.includes("gas leak") || text.includes("no power") || text.includes("burst")) urgency = "emergency"
  else if (text.includes("urgent") || text.includes("no hot water") || text.includes("blocked") || text.includes("broken") || text.includes("no water")) urgency = "urgent"
  else if (text.includes("cosmetic") || text.includes("scuff") || text.includes("minor") || text.includes("touch up")) urgency = "cosmetic"

  const severity = deriveSeverityFromTriage(category, urgency, title, description)
  const insurance_relevant = CRITICAL_KEYWORDS.some((kw) => text.includes(kw))

  return {
    category,
    urgency,
    urgency_reason:   "Classified from keywords — AI triage unavailable.",
    suggested_action: urgency === "emergency" ? "Contact contractor immediately" : "Review and assign contractor",
    severity,
    insurance_relevant,
  }
}
