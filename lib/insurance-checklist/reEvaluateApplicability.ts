/**
 * lib/insurance-checklist/reEvaluateApplicability.ts — re-derives which checklist items apply after a property scenario/furnishing change
 *
 * Data:   properties, units, insurance_checklist_items (read); property_insurance_checklists (state update),
 *         property_insurance_checklist_events (audit insert) — via service client
 * Notes:  Only flips auto-derived states — an item that became applicable moves not_applicable→unknown; one that
 *         became inapplicable moves unknown/confirmed→not_applicable. Returns {added, removed} item codes.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface ApplicabilityContext {
  scenarioType: string | null
  hasFurnishedUnits: boolean
}

interface CatalogueItem {
  code: string
  applies_to_scenarios: string[]
  applies_when: Record<string, string[]>
}

function isApplicable(item: CatalogueItem, ctx: ApplicabilityContext): boolean {
  const scenarios = item.applies_to_scenarios
  const isUniversal = scenarios.length === 0 || (scenarios.length === 1 && scenarios[0] === "*")
  const scenarioOk = isUniversal || (!!ctx.scenarioType && scenarios.includes(ctx.scenarioType))
  const furnishingOk = !item.applies_when.furnishing_status || ctx.hasFurnishedUnits
  return scenarioOk && furnishingOk
}

export async function reEvaluateChecklistApplicability(propertyId: string): Promise<{
  added: string[]
  removed: string[]
}> {
  const db = await createServiceClient()

  const { data: property, error: propErr } = await db
    .from("properties")
    .select("scenario_type, org_id")
    .eq("id", propertyId)
    .single()

  if (propErr || !property) {
    console.error("reEvaluateChecklistApplicability: property not found", propErr?.message)
    return { added: [], removed: [] }
  }

  const { data: units, error: unitsError } = await db
    .from("units")
    .select("furnishing_status")
    .eq("property_id", propertyId)
    logQueryError("reEvaluateChecklistApplicability units", unitsError)

  const hasFurnishedUnits = (units ?? []).some(
    (u) => u.furnishing_status === "semi_furnished" || u.furnishing_status === "furnished"
  )

  const ctx: ApplicabilityContext = {
    scenarioType: property.scenario_type ?? null,
    hasFurnishedUnits,
  }

  const [{ data: catalogue, error: catErr }, { data: existing, error: existErr }] =
    await Promise.all([
      db
        .from("insurance_checklist_items")
        .select("code, applies_to_scenarios, applies_when")
        .eq("is_active", true),
      db
        .from("property_insurance_checklists")
        .select("id, item_code, state")
        .eq("property_id", propertyId),
    ])

  if (catErr || !catalogue) {
    console.error("reEvaluateChecklistApplicability: catalogue fetch failed", catErr?.message)
    return { added: [], removed: [] }
  }

  if (existErr || !existing) {
    console.error("reEvaluateChecklistApplicability: existing rows fetch failed", existErr?.message)
    return { added: [], removed: [] }
  }

  const existingByCode = new Map(existing.map((r) => [r.item_code, r]))
  const added: string[] = []
  const removed: string[] = []
  const now = new Date().toISOString()

  for (const item of catalogue) {
    const shouldApply = isApplicable(item as CatalogueItem, ctx)
    const current = existingByCode.get(item.code)
    if (!current) continue

    if (shouldApply && current.state === "not_applicable") {
      const { error: updErr } = await db
        .from("property_insurance_checklists")
        // eslint-disable-next-line pleks/require-org-scope-on-service-write -- validated-caller: sole caller reclassifyProperty (lib/actions/reclassifyProperty.ts, requireAgentWriteAccess-gated) validates the property row is in the caller's org (property fetch filtered by id + org) before calling; current.id resolves from a fetch scoped by property_id
        .update({ state: "unknown", updated_at: now })
        .eq("id", current.id)

      if (updErr) {
        console.error("reEvaluateChecklistApplicability: update failed", updErr.message)
        continue
      }

      await db.from("property_insurance_checklist_events").insert({
        checklist_id: current.id,
        event_type: "unmarked_not_applicable",
        prior_state: "not_applicable",
        new_state: "unknown",
        source: "auto",
        payload: { reason: "scenario_reclassification", scenario_type: property.scenario_type },
      })

      added.push(item.code)
    } else if (!shouldApply && (current.state === "unknown" || current.state === "confirmed")) {
      const { error: updErr } = await db
        .from("property_insurance_checklists")
        // eslint-disable-next-line pleks/require-org-scope-on-service-write -- validated-caller: sole caller reclassifyProperty validates the property row is in the caller's org before calling; current.id resolves from a fetch scoped by property_id
        .update({ state: "not_applicable", updated_at: now })
        .eq("id", current.id)

      if (updErr) {
        console.error("reEvaluateChecklistApplicability: update failed", updErr.message)
        continue
      }

      await db.from("property_insurance_checklist_events").insert({
        checklist_id: current.id,
        event_type: "marked_not_applicable",
        prior_state: current.state,
        new_state: "not_applicable",
        source: "auto",
        payload: { reason: "scenario_reclassification", scenario_type: property.scenario_type },
      })

      removed.push(item.code)
    }
  }

  return { added, removed }
}
