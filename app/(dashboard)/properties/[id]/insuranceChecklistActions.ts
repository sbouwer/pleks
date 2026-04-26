"use server"

import type { SupabaseClient } from "@supabase/supabase-js"
import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

interface ActionResult {
  ok: boolean
  error?: string
}

async function resolveRow(db: SupabaseClient, orgId: string, checklistRowId: string) {
  const { data, error } = await db
    .from("property_insurance_checklists")
    .select("id, item_code, state, property_id")
    .eq("id", checklistRowId)
    .eq("org_id", orgId)
    .single()

  if (error || !data) return null
  return data as { id: string; item_code: string; state: string; property_id: string }
}

export async function confirmChecklistItem(
  checklistRowId: string,
  propertyId: string,
  notes?: string
): Promise<ActionResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const row = await resolveRow(db, orgId, checklistRowId)
  if (!row) return { ok: false, error: "Item not found" }
  if (row.state === "confirmed") return { ok: true }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    state: "confirmed",
    confirmed_at: now,
    confirmed_by: userId,
    confirmed_via: "agent_inline",
    updated_at: now,
  }
  if (notes !== undefined) update.notes = notes

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update(update)
    .eq("id", checklistRowId)
    .eq("org_id", orgId)

  if (updErr) {
    console.error("confirmChecklistItem:", updErr.message)
    return { ok: false, error: "Failed to confirm item" }
  }

  await db.from("property_insurance_checklist_events").insert({
    checklist_id: checklistRowId,
    event_type: "confirmed",
    prior_state: row.state,
    new_state: "confirmed",
    actor_user_id: userId,
    source: "agent",
    payload: notes ? { notes } : {},
  })

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function unconfirmChecklistItem(
  checklistRowId: string,
  propertyId: string
): Promise<ActionResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const row = await resolveRow(db, orgId, checklistRowId)
  if (!row) return { ok: false, error: "Item not found" }
  if (row.state !== "confirmed") return { ok: true }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update({
      state: "unknown",
      confirmed_at: null,
      confirmed_by: null,
      confirmed_via: null,
      updated_at: now,
    })
    .eq("id", checklistRowId)
    .eq("org_id", orgId)

  if (updErr) {
    console.error("unconfirmChecklistItem:", updErr.message)
    return { ok: false, error: "Failed to unconfirm item" }
  }

  await db.from("property_insurance_checklist_events").insert({
    checklist_id: checklistRowId,
    event_type: "unconfirmed",
    prior_state: "confirmed",
    new_state: "unknown",
    actor_user_id: userId,
    source: "agent",
  })

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function markItemNotApplicable(
  checklistRowId: string,
  propertyId: string,
  reason: string
): Promise<ActionResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const row = await resolveRow(db, orgId, checklistRowId)
  if (!row) return { ok: false, error: "Item not found" }
  if (row.state === "not_applicable") return { ok: true }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update({
      state: "not_applicable",
      confirmed_at: null,
      confirmed_by: null,
      confirmed_via: null,
      notes: reason,
      updated_at: now,
    })
    .eq("id", checklistRowId)
    .eq("org_id", orgId)

  if (updErr) {
    console.error("markItemNotApplicable:", updErr.message)
    return { ok: false, error: "Failed to mark as N/A" }
  }

  await db.from("property_insurance_checklist_events").insert({
    checklist_id: checklistRowId,
    event_type: "marked_not_applicable",
    prior_state: row.state,
    new_state: "not_applicable",
    actor_user_id: userId,
    source: "agent",
    payload: { reason },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function unmarkItemNotApplicable(
  checklistRowId: string,
  propertyId: string
): Promise<ActionResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const row = await resolveRow(db, orgId, checklistRowId)
  if (!row) return { ok: false, error: "Item not found" }
  if (row.state !== "not_applicable") return { ok: true }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update({
      state: "unknown",
      notes: null,
      updated_at: now,
    })
    .eq("id", checklistRowId)
    .eq("org_id", orgId)

  if (updErr) {
    console.error("unmarkItemNotApplicable:", updErr.message)
    return { ok: false, error: "Failed to restore item" }
  }

  await db.from("property_insurance_checklist_events").insert({
    checklist_id: checklistRowId,
    event_type: "unmarked_not_applicable",
    prior_state: "not_applicable",
    new_state: "unknown",
    actor_user_id: userId,
    source: "agent",
  })

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function bulkConfirmRenewalItems(
  propertyId: string,
  itemIds: string[],
): Promise<ActionResult> {
  if (itemIds.length === 0) return { ok: true }
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update({
      state: "confirmed",
      confirmed_at: now,
      confirmed_by: userId,
      confirmed_via: "agent_inline",
      updated_at: now,
    })
    .in("id", itemIds)
    .eq("org_id", orgId)
    .eq("property_id", propertyId)

  if (updErr) {
    console.error("bulkConfirmRenewalItems:", updErr.message)
    return { ok: false, error: "Failed to confirm items" }
  }

  const events = itemIds.map((id) => ({
    checklist_id: id,
    event_type: "confirmed",
    prior_state: "unknown",
    new_state: "confirmed",
    actor_user_id: userId,
    source: "agent",
    payload: { bulk: true, via: "renewal_banner" },
  }))
  await db.from("property_insurance_checklist_events").insert(events)

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}

export async function addChecklistItemNote(
  checklistRowId: string,
  propertyId: string,
  notes: string
): Promise<ActionResult> {
  const gw = await gateway()
  if (!gw) return { ok: false, error: "Not authenticated" }
  const { db, userId, orgId } = gw

  const row = await resolveRow(db, orgId, checklistRowId)
  if (!row) return { ok: false, error: "Item not found" }

  const now = new Date().toISOString()

  const { error: updErr } = await db
    .from("property_insurance_checklists")
    .update({ notes, updated_at: now })
    .eq("id", checklistRowId)
    .eq("org_id", orgId)

  if (updErr) {
    console.error("addChecklistItemNote:", updErr.message)
    return { ok: false, error: "Failed to save note" }
  }

  await db.from("property_insurance_checklist_events").insert({
    checklist_id: checklistRowId,
    event_type: "note_added",
    actor_user_id: userId,
    source: "agent",
    payload: { notes },
  })

  revalidatePath(`/properties/${propertyId}`)
  return { ok: true }
}
