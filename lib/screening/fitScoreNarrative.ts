/**
 * lib/screening/fitScoreNarrative.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
// Inlined from legacy fitScore.ts — Phase D rewrites this file entirely
interface FitScoreComponents {
  credit_score: { raw: number | null; score: number; weight: number }
  income_to_rent: { ratio: number | null; score: number; weight: number }
  rental_history: { rating: string | null; score: number; weight: number }
  employment_stability: { type: string | null; score: number; weight: number }
  judgements: { count: number; score: number; weight: number }
  references: { count: number; score: number; weight: number }
}

export function buildFitScoreNarrativePrompt(
  applicantName: string,
  propertyAddress: string,
  rentCents: number,
  totalScore: number,
  components: FitScoreComponents,
  affordabilityFlag: boolean,
  isForeignNational: boolean,
  motivation: string | null
): string {
  const formatCents = (c: number) => (c / 100).toFixed(0)

  let prompt = `Summarise this rental screening result.

Applicant: ${applicantName}
Property: ${propertyAddress}
Rent: R${formatCents(rentCents)}/month
FitScore: ${totalScore}/100
${isForeignNational ? "NOTE: Foreign national — limited SA credit data available." : ""}

Components:
- Credit score: ${components.credit_score.raw ?? "unavailable"} → ${components.credit_score.score}/100
- Income ratio: ${components.income_to_rent.ratio ? (components.income_to_rent.ratio * 100).toFixed(1) + "% of income" : "unavailable"} → ${components.income_to_rent.score}/100
  ${affordabilityFlag ? "[AFFORDABILITY FLAG: rent exceeds 30% of gross income]" : ""}
- TPN rental history: ${components.rental_history.rating ?? "no record"} → ${components.rental_history.score}/100
- Employment: ${components.employment_stability.type ?? "not stated"} → ${components.employment_stability.score}/100
- Judgements/adverse: ${components.judgements.count} → ${components.judgements.score}/100
- References: ${components.references.count} → ${components.references.score}/100

Write 2-3 paragraphs: overall profile, strongest factors, any concerns or data gaps.
No recommendation. No discrimination. Facts only.`

  if (motivation) {
    prompt += `

APPLICANT MOTIVATION (submitted voluntarily):
"${motivation}"

Note to AI: Report this motivation verbatim as a separate paragraph.
Do NOT verify its claims. Do NOT use it to adjust any score component.
Simply note that the applicant provided this context for the agent's review.`
  }

  return prompt
}

export const FITSCORE_NARRATIVE_SYSTEM_PROMPT = `You are generating a factual rental screening summary for a South African property manager. Write in plain English, third person, objectively.
Do NOT recommend approval or rejection.
Do NOT reference race, gender, nationality, religion, or any protected characteristic.
This document may be reviewed in legal proceedings — accuracy is critical.`
