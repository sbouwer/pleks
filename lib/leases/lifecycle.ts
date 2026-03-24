"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { addDays } from "date-fns"

export async function logLifecycleEvent(
  leaseId: string,
  orgId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  triggeredBy: string = "system",
  userId?: string
) {
  const supabase = await createClient()
  await supabase.from("lease_lifecycle_events").insert({
    org_id: orgId,
    lease_id: leaseId,
    event_type: eventType,
    metadata,
    triggered_by: triggeredBy,
    triggered_by_user: userId || null,
  })
}

export function calculateEscalation(
  currentRentCents: number,
  escalationPercent: number,
  escalationType: string
): number {
  if (escalationType === "fixed") {
    return Math.round(currentRentCents * (1 + escalationPercent / 100))
  }
  if (escalationType === "cpi") {
    const cpiRate = 5.5 // placeholder — Phase 2: pull from Stats SA
    return Math.round(currentRentCents * (1 + cpiRate / 100))
  }
  return currentRentCents
}

export async function processEscalation(
  leaseId: string,
  newRentCents: number,
  effectiveDate: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: lease } = await supabase.from("leases").select("*").eq("id", leaseId).single()
  if (!lease) return { error: "Lease not found" }

  const oldRentCents = lease.rent_amount_cents
  const depositTopUp = lease.deposit_amount_cents === oldRentCents
    ? newRentCents - oldRentCents
    : 0

  // Create amendment record
  await supabase.from("lease_amendments").insert({
    org_id: lease.org_id,
    lease_id: leaseId,
    amendment_type: "rent_escalation",
    previous_values: { rent_amount_cents: oldRentCents },
    new_values: { rent_amount_cents: newRentCents, deposit_top_up: depositTopUp },
    effective_date: effectiveDate,
    requires_signature: true,
    created_by: user.id,
  })

  // Update lease
  const nextEscalation = new Date(effectiveDate)
  nextEscalation.setFullYear(nextEscalation.getFullYear() + 1)

  await supabase.from("leases").update({
    rent_amount_cents: newRentCents,
    deposit_amount_cents: (lease.deposit_amount_cents || 0) + depositTopUp,
    escalation_review_date: nextEscalation.toISOString().split("T")[0],
  }).eq("id", leaseId)

  await logLifecycleEvent(leaseId, lease.org_id, "escalation_processed", {
    old_rent: oldRentCents,
    new_rent: newRentCents,
    effective_date: effectiveDate,
  }, "agent", user.id)

  await supabase.from("audit_log").insert({
    org_id: lease.org_id,
    table_name: "leases",
    record_id: leaseId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { rent_amount_cents: newRentCents, escalation_processed: true },
  })

  revalidatePath(`/leases/${leaseId}`)
  return { success: true }
}

export async function createRenewalOffer(
  leaseId: string,
  proposedRentCents: number,
  proposedStartDate: string,
  proposedEndDate: string | null,
  escalationPercent: number
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: lease } = await supabase.from("leases").select("org_id").eq("id", leaseId).single()
  if (!lease) return { error: "Lease not found" }

  const expiresAt = addDays(new Date(), 10).toISOString()

  const { data: offer, error } = await supabase
    .from("lease_renewal_offers")
    .insert({
      org_id: lease.org_id,
      lease_id: leaseId,
      proposed_start_date: proposedStartDate,
      proposed_end_date: proposedEndDate,
      proposed_rent_cents: proposedRentCents,
      proposed_escalation_percent: escalationPercent,
      status: "draft",
      expires_at: expiresAt,
      ai_drafted: false,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (error || !offer) return { error: error?.message || "Failed to create offer" }

  await logLifecycleEvent(leaseId, lease.org_id, "renewal_offer_sent", {
    proposed_rent: proposedRentCents,
    proposed_start: proposedStartDate,
  }, "agent", user.id)

  revalidatePath(`/leases/${leaseId}`)
  return { success: true, offerId: offer.id }
}

export async function acceptRenewalOffer(offerId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: offer } = await supabase
    .from("lease_renewal_offers")
    .select("*, leases(*)")
    .eq("id", offerId)
    .single()

  if (!offer) return { error: "Offer not found" }
  const currentLease = offer.leases as Record<string, unknown>

  // Create new lease
  const { data: newLease } = await supabase
    .from("leases")
    .insert({
      org_id: currentLease.org_id,
      unit_id: currentLease.unit_id,
      property_id: currentLease.property_id,
      tenant_id: currentLease.tenant_id,
      lease_type: currentLease.lease_type,
      cpa_applies: currentLease.cpa_applies,
      start_date: offer.proposed_start_date,
      end_date: offer.proposed_end_date,
      is_fixed_term: !!offer.proposed_end_date,
      rent_amount_cents: offer.proposed_rent_cents,
      escalation_percent: offer.proposed_escalation_percent || 10,
      payment_due_day: currentLease.payment_due_day,
      deposit_amount_cents: currentLease.deposit_amount_cents,
      notice_period_days: currentLease.notice_period_days,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single()

  if (!newLease) return { error: "Failed to create renewal lease" }

  // Update old lease
  await supabase.from("leases").update({ status: "expired" }).eq("id", offer.lease_id)

  // Update offer
  await supabase.from("lease_renewal_offers").update({
    status: "accepted",
    responded_at: new Date().toISOString(),
    new_lease_id: newLease.id,
  }).eq("id", offerId)

  await logLifecycleEvent(offer.lease_id, offer.org_id, "lease_renewed", {
    new_lease_id: newLease.id,
  }, "agent", user.id)

  revalidatePath("/leases")
  return { success: true, newLeaseId: newLease.id }
}
