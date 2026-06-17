/**
 * lib/legal/holds.ts — polymorphic litigation-hold registry helpers (SPEC_LEGAL_HOLD_POLYMORPHIC)
 *
 * Auth:   service-role only — all writes bypass the RLS insert-block (WITH CHECK false) by design.
 * Data:   legal_hold_events (append-only; instrument_hash chain computed by the BEFORE INSERT trigger).
 * Notes:  isOnHold is the shared hold-check (active = hold_placed not matched by a hold_lifted). Place/lift
 *         are the ONLY correct write path (direct INSERT is RLS-blocked — an append-only bad row can't be
 *         rolled back). Audit routes through recordAudit (action enum INSERT; semantic descriptor in
 *         after.action; reason_text excluded — may contain PII, recordAudit RULE #7).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"

export type ScopeType = "org" | "application" | "subject" | "lease"
export type HoldEventType = "hold_placed" | "hold_lifted" | "hold_suppressed"
export type TriggerCategory =
  | "customer_dispute"
  | "attorney_correspondence"
  | "regulator_inquiry"
  | "legal_demand"
  | "dsar_contested"
  | "tribunal_matter"
  | "manual_information_officer"
  | "pleks_platform_directive"
export type PlacedByCapacity = "agency_io" | "pleks_io" | "pleks_platform_admin" | "system"

export interface LegalHoldEvent {
  id: string
  org_id: string
  scope_type: ScopeType
  scope_id: string
  event_type: HoldEventType
  trigger_category: TriggerCategory
  placed_by: string | null
  placed_by_capacity: PlacedByCapacity
  reason_text: string | null
  external_reference: string | null
  lift_event_id: string | null
  instrument_hash: string
  prev_instrument_hash: string
  created_at: string
}

/**
 * Most recent ACTIVE hold against a scope, or null. Active = a hold_placed row whose id is not referenced
 * by any hold_lifted.lift_event_id for the same scope. Service-role client required. Fails closed (throws)
 * on query error so a caller can never read a DB failure as "no hold".
 */
export async function isOnHold(
  db: SupabaseClient,
  args: { scopeType: ScopeType; scopeId: string },
): Promise<LegalHoldEvent | null> {
  const { data, error } = await db
    .from("legal_hold_events")
    .select("*")
    .eq("scope_type", args.scopeType)
    .eq("scope_id", args.scopeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })

  if (error) {
    throw new Error(`isOnHold check failed for ${args.scopeType}:${args.scopeId}: ${error.message}`)
  }

  const rows = (data ?? []) as LegalHoldEvent[]
  if (rows.length === 0) return null

  const liftedHoldIds = new Set(
    rows
      .filter((r) => r.event_type === "hold_lifted" && r.lift_event_id)
      .map((r) => r.lift_event_id as string),
  )

  for (const row of rows) {
    if (row.event_type === "hold_placed" && !liftedHoldIds.has(row.id)) return row
  }
  return null
}

/** Place a hold. Only correct write path (direct INSERT is RLS-blocked). instrument_hash overwritten by trigger. */
export async function placeLegalHold(
  db: SupabaseClient,
  args: {
    orgId: string
    scopeType: ScopeType
    scopeId: string
    triggerCategory: TriggerCategory
    placedBy: string | null
    placedByCapacity: PlacedByCapacity
    reasonText?: string
    externalReference?: string
  },
): Promise<LegalHoldEvent> {
  const { data, error } = await db
    .from("legal_hold_events")
    .insert({
      org_id: args.orgId,
      scope_type: args.scopeType,
      scope_id: args.scopeId,
      event_type: "hold_placed",
      trigger_category: args.triggerCategory,
      placed_by: args.placedBy,
      placed_by_capacity: args.placedByCapacity,
      reason_text: args.reasonText ?? null,
      external_reference: args.externalReference ?? null,
      instrument_hash: "",        // overwritten by the BEFORE INSERT trigger; placeholder required (NOT NULL)
      prev_instrument_hash: "",
    })
    .select("*")
    .single()

  if (error) throw new Error(`placeLegalHold failed: ${error.message}`)

  await recordAudit(db, {
    orgId: args.orgId,
    actorId: args.placedBy,
    action: "INSERT",
    table: "legal_hold_events",
    recordId: (data as LegalHoldEvent).id,
    after: {
      action: "legal_hold_placed",
      scope_type: args.scopeType,
      scope_id: args.scopeId,
      trigger_category: args.triggerCategory,
      placed_by_capacity: args.placedByCapacity,
      external_reference: args.externalReference ?? null,
      // reason_text deliberately excluded — may contain PII (recordAudit RULE #7)
    },
  })

  return data as LegalHoldEvent
}

/** Lift an existing hold by appending a hold_lifted row pointing at the original hold_placed. */
export async function liftLegalHold(
  db: SupabaseClient,
  args: {
    holdEventId: string
    liftedBy: string | null
    liftedByCapacity: PlacedByCapacity
    reasonText?: string
    externalReference?: string
  },
): Promise<LegalHoldEvent> {
  const { data: original, error: readErr } = await db
    .from("legal_hold_events")
    .select("*")
    .eq("id", args.holdEventId)
    .eq("event_type", "hold_placed")
    .single()

  if (readErr || !original) {
    throw new Error(`liftLegalHold: original hold_placed not found (id=${args.holdEventId}): ${readErr?.message ?? "no row"}`)
  }
  const orig = original as LegalHoldEvent

  const { data, error } = await db
    .from("legal_hold_events")
    .insert({
      org_id: orig.org_id,
      scope_type: orig.scope_type,
      scope_id: orig.scope_id,
      event_type: "hold_lifted",
      trigger_category: orig.trigger_category, // mirror for query symmetry
      placed_by: args.liftedBy,
      placed_by_capacity: args.liftedByCapacity,
      reason_text: args.reasonText ?? null,
      external_reference: args.externalReference ?? null,
      lift_event_id: args.holdEventId,
      instrument_hash: "",
      prev_instrument_hash: "",
    })
    .select("*")
    .single()

  if (error) throw new Error(`liftLegalHold failed: ${error.message}`)

  await recordAudit(db, {
    orgId: orig.org_id,
    actorId: args.liftedBy,
    action: "INSERT",
    table: "legal_hold_events",
    recordId: (data as LegalHoldEvent).id,
    after: {
      action: "legal_hold_lifted",
      original_hold_id: args.holdEventId,
      scope_type: orig.scope_type,
      scope_id: orig.scope_id,
      lifted_by_capacity: args.liftedByCapacity,
      external_reference: args.externalReference ?? null,
    },
  })

  return data as LegalHoldEvent
}
