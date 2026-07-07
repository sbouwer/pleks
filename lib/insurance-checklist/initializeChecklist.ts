/**
 * lib/insurance-checklist/initializeChecklist.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createServiceClient } from "@/lib/supabase/server"

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

export async function initializeInsuranceChecklist(
  propertyId: string,
  orgId: string
): Promise<void> {
  const db = await createServiceClient()

  const { data: property, error: propErr } = await db
    .from("properties")
    .select("scenario_type")
    .eq("id", propertyId)
    .single()

  if (propErr || !property) {
    console.error("initializeInsuranceChecklist: property not found", propErr?.message)
    return
  }

  const { data: units, error: unitsErr } = await db
    .from("units")
    .select("furnishing_status")
    .eq("property_id", propertyId)

  if (unitsErr) {
    console.error("initializeInsuranceChecklist: units fetch failed", unitsErr.message)
  }

  const hasFurnishedUnits = (units ?? []).some(
    (u) => u.furnishing_status === "semi_furnished" || u.furnishing_status === "furnished"
  )

  const ctx: ApplicabilityContext = {
    scenarioType: property.scenario_type ?? null,
    hasFurnishedUnits,
  }

  const { data: catalogue, error: catErr } = await db
    .from("insurance_checklist_items")
    .select("code, applies_to_scenarios, applies_when")
    .eq("is_active", true)
    .order("sort_order")

  if (catErr || !catalogue) {
    console.error("initializeInsuranceChecklist: catalogue fetch failed", catErr?.message)
    return
  }

  const rows = catalogue.map((item) => ({
    org_id: orgId,
    property_id: propertyId,
    item_code: item.code,
    state: isApplicable(item as CatalogueItem, ctx) ? "unknown" : "not_applicable",
  }))

  const { data: inserted, error: insertErr } = await db
    .from("property_insurance_checklists")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- validated-caller: sole caller createPropertyFromWizard (lib/actions/createPropertyFromWizard.ts, requireAgentWriteAccess-gated) passes its freshly-created in-org propertyId + gateway orgId; rows carry org_id: orgId
    .upsert(rows, { onConflict: "property_id,item_code", ignoreDuplicates: true })
    .select("id, item_code, state")

  if (insertErr) {
    console.error("initializeInsuranceChecklist: insert failed", insertErr.message)
    return
  }

  if (!inserted || inserted.length === 0) return

  const events = inserted.map((row) => ({
    checklist_id: row.id,
    event_type: "initialized" as const,
    new_state: row.state,
    source: "auto" as const,
    payload: {
      scenario_type: property.scenario_type,
      has_furnished_units: hasFurnishedUnits,
    },
  }))

  const { error: evtErr } = await db
    .from("property_insurance_checklist_events")
    .insert(events)

  if (evtErr) {
    console.error("initializeInsuranceChecklist: audit events failed", evtErr.message)
  }
}
