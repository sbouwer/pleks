export interface TriageResult {
  category: string
  urgency: string
  urgency_reason: string
  suggested_action: string
}

// TODO: Implement with Anthropic API when ready
// Uses Claude Haiku 4.5 for fast, cheap classification
export async function triageMaintenanceRequest(
  title: string,
  description: string,
): Promise<TriageResult> {
  // Placeholder — basic keyword-based triage until API is wired
  const text = `${title} ${description}`.toLowerCase()

  let category = "other"
  let urgency = "routine"

  // Category detection
  if (text.includes("leak") || text.includes("tap") || text.includes("drain") || text.includes("geyser") || text.includes("pipe")) category = "plumbing"
  else if (text.includes("power") || text.includes("socket") || text.includes("light") || text.includes("circuit") || text.includes("electric")) category = "electrical"
  else if (text.includes("aircon") || text.includes("heating") || text.includes("hvac")) category = "hvac"
  else if (text.includes("crack") || text.includes("wall") || text.includes("roof") || text.includes("ceiling")) category = "structural"
  else if (text.includes("window") || text.includes("door") || text.includes("lock")) category = "windows_doors"
  else if (text.includes("stove") || text.includes("oven") || text.includes("dishwasher") || text.includes("fridge")) category = "appliances"
  else if (text.includes("garden") || text.includes("lawn") || text.includes("tree")) category = "garden"
  else if (text.includes("pest") || text.includes("rat") || text.includes("cockroach") || text.includes("termite")) category = "pest_control"
  else if (text.includes("paint")) category = "painting"
  else if (text.includes("alarm") || text.includes("security") || text.includes("gate")) category = "security"

  // Urgency detection
  if (text.includes("emergency") || text.includes("flood") || text.includes("fire") || text.includes("gas leak") || text.includes("no power") || text.includes("burst")) urgency = "emergency"
  else if (text.includes("urgent") || text.includes("no hot water") || text.includes("blocked") || text.includes("broken")) urgency = "urgent"
  else if (text.includes("cosmetic") || text.includes("paint") || text.includes("scuff") || text.includes("minor")) urgency = "cosmetic"

  return {
    category,
    urgency,
    urgency_reason: `Classified based on description keywords. Will be refined by Claude Haiku when API is connected.`,
    suggested_action: urgency === "emergency" ? "Contact contractor immediately" : "Review and assign contractor",
  }
}
