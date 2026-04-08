import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { AnnexureCRules } from "@/components/leases/LeaseWizard"
import type { ClauseConflict } from "@/lib/leases/conflictChecker"

/**
 * POST /api/leases/conflict-check
 *
 * Sonnet-assisted clause conflict check (ADDENDUM_31B).
 * Only fires when deterministic checks pass and optional clauses are enabled
 * alongside customised Annexure C rules.
 *
 * Free for all tiers — this is platform safety, not a convenience feature.
 */
export async function POST(req: Request) {
  // Auth gate
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { enabledClauseKeys, annexureCRules } = await req.json() as {
    enabledClauseKeys: string[]
    annexureCRules: AnnexureCRules
  }

  if (!enabledClauseKeys?.length || !annexureCRules) {
    return NextResponse.json({ conflicts: [] })
  }

  // Fetch clause bodies from the library for enabled optional clauses
  const { data: clauses } = await supabase
    .from("lease_clause_library")
    .select("clause_key, title, body_template")
    .in("clause_key", enabledClauseKeys)

  if (!clauses?.length) return NextResponse.json({ conflicts: [] })

  const clauseList = clauses
    .map((c) => `CLAUSE "${c.clause_key}" — ${c.title}:\n${(c.body_template as string).slice(0, 600)}…`)
    .join("\n\n---\n\n")

  const rulesText = (Object.entries(annexureCRules) as [string, string][])
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")

  const prompt = `You are reviewing a South African residential lease for clause conflicts.

ANNEXURE C — PROPERTY RULES:
${rulesText}

ENABLED OPTIONAL CLAUSES (excerpts):
${clauseList}

Identify conflicts where a property rule directly contradicts or creates ambiguity with an enabled clause. Only flag genuine contradictions — not stylistic differences or general overlap.

A conflict exists when:
- A rule explicitly prohibits something a clause permits
- A clause creates a tenant right that a rule restricts
- The combination would confuse a tenant about their actual rights

Return a JSON array. Each element: { "clauseKey": string, "title": string (max 8 words), "description": string (1-2 plain English sentences explaining the conflict) }

If no conflicts exist, return [].
Respond with ONLY the JSON array, no markdown, no explanation.`

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const parsed = JSON.parse(raw) as { clauseKey: string; title: string; description: string }[]

    const conflicts: ClauseConflict[] = parsed.map((c, i) => ({
      id: `ai_${c.clauseKey}_${i}`,
      clauseKey: c.clauseKey,
      title: c.title,
      description: c.description,
      source: "ai" as const,
    }))

    return NextResponse.json({ conflicts })
  } catch {
    // Never block the wizard on AI failure — return empty list
    return NextResponse.json({ conflicts: [], error: "AI check unavailable" })
  }
}
