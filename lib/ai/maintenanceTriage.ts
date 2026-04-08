export interface TriageResult {
  category: string
  urgency: string
  urgency_reason: string
  suggested_action: string
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

4. **suggested_action** — one sentence on what should happen next (e.g. "Contact electrician immediately", "Schedule plumber within 24 hours", "Book painter at next available slot")

Respond with ONLY valid JSON, no markdown, no explanation:
{"category":"...","urgency":"...","urgency_reason":"...","suggested_action":"..."}`

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
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Title: ${title}\n\nDescription: ${description}`,
        },
      ],
    })

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : ""
    const result = JSON.parse(text) as TriageResult

    const validCategories = ["electrical", "plumbing", "hvac", "structural", "roofing", "windows_doors", "appliances", "garden", "pest_control", "painting", "flooring", "security", "access_control", "cleaning", "other"]
    const validUrgencies = ["emergency", "urgent", "routine", "cosmetic"]

    return {
      category: validCategories.includes(result.category) ? result.category : "other",
      urgency: validUrgencies.includes(result.urgency) ? result.urgency : "routine",
      urgency_reason: result.urgency_reason || "",
      suggested_action: result.suggested_action || "",
    }
  } catch {
    return fallbackTriage(title, description)
  }
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

  return {
    category,
    urgency,
    urgency_reason: "Classified from keywords — AI triage unavailable.",
    suggested_action: urgency === "emergency" ? "Contact contractor immediately" : "Review and assign contractor",
  }
}
