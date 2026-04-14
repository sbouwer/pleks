import type { WelcomePackData } from "./types"

export interface Recommendation {
  priority: "high" | "medium" | "low"
  title: string
  body: string
  financial_impact: string | null
}

const SYSTEM_PROMPT = `You are a South African property management advisor helping agents onboard new landlord clients.
Given portfolio data, generate 4-6 concise, actionable recommendations.

Rules:
- Reference SA Rental Housing Act and Consumer Protection Act where relevant
- Be specific: name tenants, quote amounts, cite dates
- Prioritise by urgency: high / medium / low
- Include estimated financial impact in ZAR where calculable
- Focus on: vacancies, lease renewals, rental adjustments, compliance gaps, escalation strategy
- Do NOT recommend anything the property management platform cannot track

Respond with ONLY a valid JSON array — no markdown, no explanation:
[{"priority":"high","title":"...","body":"...","financial_impact":"..."}]`

function staticFallback(data: WelcomePackData): Recommendation[] {
  const recs: Recommendation[] = []

  if (data.totals.vacant > 0) {
    recs.push({
      priority: "high",
      title: "Fill vacant units",
      body: `${data.totals.vacant} unit${data.totals.vacant === 1 ? " is" : "s are"} currently vacant. List immediately to recover lost income.`,
      financial_impact: data.totals.vacancy_cost_cents > 0
        ? `R ${Math.round(data.totals.vacancy_cost_cents / 100).toLocaleString("en-ZA")}/month lost`
        : null,
    })
  }

  const expiring = data.properties
    .flatMap((p) => p.units)
    .filter((u) => u.flags.includes("expiring_soon"))
  if (expiring.length > 0) {
    recs.push({
      priority: "high",
      title: "Lease renewals required",
      body: `${expiring.length} lease${expiring.length === 1 ? "" : "s"} expiring within 60 days. Send renewal offers and CPA s14 notices promptly.`,
      financial_impact: null,
    })
  }

  const monthToMonth = data.properties
    .flatMap((p) => p.units)
    .filter((u) => u.flags.includes("month_to_month"))
  if (monthToMonth.length > 0) {
    recs.push({
      priority: "medium",
      title: "Formalise month-to-month leases",
      body: `${monthToMonth.length} unit${monthToMonth.length === 1 ? "" : "s"} running month-to-month. Consider new fixed-term agreements to provide income certainty.`,
      financial_impact: null,
    })
  }

  recs.push({
    priority: "medium",
    title: "Run tenant credit checks",
    body: "No FitScores are on file for any tenant. Running credit checks now establishes a baseline risk profile and surfaces any existing arrears at other properties.",
    financial_impact: "~R 50 per check via Searchworx",
  })

  if (data.compliance.cpa_notices.length > 0) {
    recs.push({
      priority: "high",
      title: "CPA s14 notices due",
      body: `${data.compliance.cpa_notices.length} lease${data.compliance.cpa_notices.length === 1 ? "" : "s"} require CPA section 14 notice within the next 40 days. Failure to serve constitutes automatic renewal on the tenant's existing terms.`,
      financial_impact: null,
    })
  }

  return recs
}

export async function generateWelcomePackRecommendations(
  data: WelcomePackData,
): Promise<Recommendation[]> {
  if (!process.env.ANTHROPIC_API_KEY) return staticFallback(data)

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()

    // Trim co-tenants and flags from payload to keep tokens low
    const slim = {
      landlord: data.landlord_name,
      totals: data.totals,
      properties: data.properties.map((p) => ({
        name: p.name,
        type: p.type,
        total_units: p.total_units,
        occupied_units: p.occupied_units,
        monthly_income_cents: p.monthly_income_cents,
        units: p.units.map((u) => ({
          unit_number: u.unit_number,
          status: u.status,
          tenant_name: u.tenant_name,
          rent_cents: u.rent_cents,
          lease_end: u.lease_end,
          days_remaining: u.days_remaining,
          escalation_percent: u.escalation_percent,
          escalation_date: u.escalation_date,
          flags: u.flags,
        })),
      })),
      compliance: data.compliance,
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6-20250514",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Portfolio data:\n${JSON.stringify(slim, null, 2)}` }],
    })

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "[]"
    const parsed = JSON.parse(text) as Recommendation[]
    if (!Array.isArray(parsed) || parsed.length === 0) return staticFallback(data)
    return parsed
  } catch (err) {
    console.error("welcomePack/recommendations:", err)
    return staticFallback(data)
  }
}
