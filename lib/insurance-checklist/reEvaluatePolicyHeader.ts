import { createServiceClient } from "@/lib/supabase/server"

export async function reEvaluatePolicyHeader(propertyId: string): Promise<void> {
  const db = await createServiceClient()

  const { data: propRaw, error: propErr } = await db
    .from("properties")
    .select("insurance_provider, insurance_policy_number, insurance_policy_type, insurance_renewal_date, insurance_replacement_value_cents, insurance_excess_cents")
    .eq("id", propertyId)
    .single()

  if (propErr || !propRaw) {
    console.error("reEvaluatePolicyHeader: property not found", propErr?.message)
    return
  }

  const prop = propRaw as {
    insurance_provider: string | null
    insurance_policy_number: string | null
    insurance_policy_type: string | null
    insurance_renewal_date: string | null
    insurance_replacement_value_cents: number | null
    insurance_excess_cents: number | null
  }

  const allPresent =
    !!prop.insurance_provider?.trim() &&
    !!prop.insurance_policy_number?.trim() &&
    !!prop.insurance_policy_type &&
    !!prop.insurance_renewal_date &&
    prop.insurance_replacement_value_cents !== null &&
    prop.insurance_excess_cents !== null

  const { data: existing, error: existErr } = await db
    .from("property_insurance_checklists")
    .select("id, state")
    .eq("property_id", propertyId)
    .eq("item_code", "POLICY_HEADER")
    .maybeSingle()

  if (existErr) {
    console.error("reEvaluatePolicyHeader: checklist row fetch failed", existErr.message)
    return
  }

  if (!existing) return  // checklist not yet initialized; no-op

  const targetState = allPresent ? "confirmed" : "unknown"
  if (existing.state === targetState) return

  const now = new Date().toISOString()

  const { error: updateErr } = await db
    .from("property_insurance_checklists")
    .update({
      state: targetState,
      confirmed_at: targetState === "confirmed" ? now : null,
      confirmed_via: targetState === "confirmed" ? "auto_derived" : null,
      confirmed_by: null,
      updated_at: now,
    })
    .eq("id", existing.id)

  if (updateErr) {
    console.error("reEvaluatePolicyHeader: update failed", updateErr.message)
    return
  }

  const { error: evtErr } = await db.from("property_insurance_checklist_events").insert({
    checklist_id: existing.id,
    event_type: targetState === "confirmed" ? "confirmed" : "unconfirmed",
    prior_state: existing.state,
    new_state: targetState,
    source: "auto",
    payload: { reason: allPresent ? "all_fields_populated" : "field_missing" },
  })

  if (evtErr) {
    console.error("reEvaluatePolicyHeader: audit event failed", evtErr.message)
  }
}
