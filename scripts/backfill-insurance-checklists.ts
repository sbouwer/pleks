/**
 * Backfill insurance checklists for all existing properties.
 * Run once on 60A go-live: npx tsx scripts/backfill-insurance-checklists.ts
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING (ignoreDuplicates: true).
 * Properties that already have checklist rows are skipped.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  const isUniversal =
    scenarios.length === 0 || (scenarios.length === 1 && scenarios[0] === "*")

  if (!isUniversal) {
    if (!ctx.scenarioType || !scenarios.includes(ctx.scenarioType)) return false
  }

  if (item.applies_when.furnishing_status && !ctx.hasFurnishedUnits) return false

  return true
}

async function main() {
  console.log("Fetching insurance checklist catalogue...")

  const { data: catalogue, error: catErr } = await db
    .from("insurance_checklist_items")
    .select("code, applies_to_scenarios, applies_when")
    .eq("is_active", true)
    .order("sort_order")

  if (catErr || !catalogue) {
    console.error("Failed to fetch catalogue:", catErr?.message)
    process.exit(1)
  }

  console.log(`Catalogue: ${catalogue.length} items`)

  // Fetch all non-deleted properties
  const { data: properties, error: propErr } = await db
    .from("properties")
    .select("id, org_id, scenario_type")
    .is("deleted_at", null)
    .order("created_at")

  if (propErr || !properties) {
    console.error("Failed to fetch properties:", propErr?.message)
    process.exit(1)
  }

  console.log(`Properties: ${properties.length} to process`)

  let initialized = 0
  let skipped = 0
  let errors = 0

  for (const property of properties) {
    const { data: existingCount, error: countErr } = await db
      .from("property_insurance_checklists")
      .select("id", { count: "exact", head: true })
      .eq("property_id", property.id)

    if (countErr) {
      console.error(`  [${property.id}] count check failed:`, countErr.message)
      errors++
      continue
    }

    if ((existingCount as unknown as { count: number } | null)?.count !== undefined) {
      // Check via the response's count
    }

    // Re-query to get count properly
    const { count, error: c2 } = await db
      .from("property_insurance_checklists")
      .select("*", { count: "exact", head: true })
      .eq("property_id", property.id)

    if (c2) {
      console.error(`  [${property.id}] count check failed:`, c2.message)
      errors++
      continue
    }

    if ((count ?? 0) > 0) {
      skipped++
      continue
    }

    // Fetch units for furnishing check
    const { data: units } = await db
      .from("units")
      .select("furnishing_status")
      .eq("property_id", property.id)

    const hasFurnishedUnits = (units ?? []).some(
      (u) => u.furnishing_status === "semi_furnished" || u.furnishing_status === "furnished"
    )

    const ctx: ApplicabilityContext = {
      scenarioType: property.scenario_type ?? null,
      hasFurnishedUnits,
    }

    const rows = catalogue.map((item) => ({
      org_id: property.org_id,
      property_id: property.id,
      item_code: item.code,
      state: isApplicable(item as CatalogueItem, ctx) ? "unknown" : "not_applicable",
    }))

    const { data: inserted, error: insertErr } = await db
      .from("property_insurance_checklists")
      .upsert(rows, { onConflict: "property_id,item_code", ignoreDuplicates: true })
      .select("id, item_code, state")

    if (insertErr) {
      console.error(`  [${property.id}] insert failed:`, insertErr.message)
      errors++
      continue
    }

    if (inserted && inserted.length > 0) {
      const events = inserted.map((row) => ({
        checklist_id: row.id,
        event_type: "initialized" as const,
        new_state: row.state,
        source: "auto" as const,
        payload: {
          scenario_type: property.scenario_type,
          has_furnished_units: hasFurnishedUnits,
          backfill: true,
        },
      }))

      const { error: evtErr } = await db
        .from("property_insurance_checklist_events")
        .insert(events)

      if (evtErr) {
        console.error(`  [${property.id}] audit events failed:`, evtErr.message)
      }
    }

    // Auto-derive POLICY_HEADER
    const { data: prop } = await db
      .from("properties")
      .select(
        "insurance_provider, insurance_policy_number, insurance_policy_type, " +
          "insurance_renewal_date, insurance_replacement_value_cents, insurance_excess_cents"
      )
      .eq("id", property.id)
      .single()

    if (prop) {
      const allPresent =
        !!(prop.insurance_provider as string | null)?.trim() &&
        !!(prop.insurance_policy_number as string | null)?.trim() &&
        !!prop.insurance_policy_type &&
        !!prop.insurance_renewal_date &&
        prop.insurance_replacement_value_cents !== null &&
        prop.insurance_excess_cents !== null

      if (allPresent) {
        const { data: headerRow } = await db
          .from("property_insurance_checklists")
          .select("id, state")
          .eq("property_id", property.id)
          .eq("item_code", "POLICY_HEADER")
          .maybeSingle()

        if (headerRow && headerRow.state === "unknown") {
          const now = new Date().toISOString()
          await db
            .from("property_insurance_checklists")
            .update({
              state: "confirmed",
              confirmed_at: now,
              confirmed_via: "auto_derived",
              confirmed_by: null,
              updated_at: now,
            })
            .eq("id", headerRow.id)

          await db.from("property_insurance_checklist_events").insert({
            checklist_id: headerRow.id,
            event_type: "confirmed",
            prior_state: "unknown",
            new_state: "confirmed",
            source: "auto",
            payload: { reason: "all_fields_populated", backfill: true },
          })
        }
      }
    }

    initialized++
    console.log(
      `  [${initialized}/${properties.length - skipped}] ${property.id} — ${rows.length} items initialized`
    )
  }

  console.log("")
  console.log("Done.")
  console.log(`  Initialized: ${initialized}`)
  console.log(`  Skipped (already had rows): ${skipped}`)
  console.log(`  Errors: ${errors}`)

  if (errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
