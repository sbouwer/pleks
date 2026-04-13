import { NextResponse } from "next/server"
import { getTenantSession } from "@/lib/portal/getTenantSession"
import Anthropic from "@anthropic-ai/sdk"

const client = new Anthropic()

export async function POST(req: Request) {
  // Verify tenant session
  const session = await getTenantSession()
  if (!session) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })

  const body = await req.json() as { category: string; description: string }
  const { category, description } = body

  if (!description || description.length < 10) {
    return NextResponse.json({ urgency: null, rationale: null })
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: `You are a maintenance triage assistant for South African residential property.
Assess the urgency of maintenance requests based on tenant descriptions.

Urgency levels (choose exactly one):
- emergency: immediate health/safety risk (gas leak, flooding, no power, structural collapse, no hot water in winter, broken security gate)
- urgent: significant inconvenience or potential damage if unaddressed within 48h
- routine: normal wear/maintenance, can be scheduled within 7 days
- cosmetic: aesthetic issues only, no functional impact

Respond with JSON only: {"urgency": "<level>", "rationale": "<one sentence explanation>"}`,
      messages: [
        {
          role: "user",
          content: `Category: ${category}\nDescription: ${description}`,
        },
      ],
    })

    const text = message.content[0].type === "text" ? message.content[0].text : ""
    const jsonStart = text.indexOf("{")
    const jsonEnd = text.lastIndexOf("}")
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json({ urgency: null, rationale: null })
    }

    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
      urgency?: string
      rationale?: string
    }

    const validUrgencies = ["emergency", "urgent", "routine", "cosmetic"]
    const urgency = validUrgencies.includes(parsed.urgency ?? "") ? parsed.urgency : null

    return NextResponse.json({ urgency, rationale: parsed.rationale ?? null })
  } catch (err) {
    console.error("[portal/triage] Haiku failed:", err)
    return NextResponse.json({ urgency: null, rationale: null })
  }
}
