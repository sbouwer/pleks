"use server"

import { createClient } from "@/lib/supabase/server"

export async function approveQuote(quoteId: string, approvedBy: string) {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from("maintenance_quotes")
    .select("id, request_id, org_id, total_incl_vat_cents, contractor_id")
    .eq("id", quoteId)
    .single()

  if (!quote) return { error: "Quote not found" }

  // Check if landlord approval is needed
  const { data: org } = await supabase
    .from("organisations")
    .select("maintenance_approval_threshold_cents")
    .eq("id", quote.org_id)
    .single()

  const threshold = (org?.maintenance_approval_threshold_cents as number) ?? 200000

  if (quote.total_incl_vat_cents > threshold) {
    // Mark as needing landlord approval
    await supabase.from("maintenance_quotes").update({
      landlord_approval_required: true,
    }).eq("id", quoteId)

    await supabase.from("maintenance_requests").update({
      status: "pending_landlord",
    }).eq("id", quote.request_id)

    return { success: true, needs_landlord: true }
  }

  // Direct approval
  await supabase.from("maintenance_quotes").update({
    status: "approved",
    reviewed_by: approvedBy,
    reviewed_at: new Date().toISOString(),
  }).eq("id", quoteId)

  await supabase.from("maintenance_requests").update({
    status: "quote_approved",
    quoted_cost_cents: quote.total_incl_vat_cents,
  }).eq("id", quote.request_id)

  // Notify contractor
  await supabase.from("contractor_updates").insert({
    org_id: quote.org_id,
    request_id: quote.request_id,
    contractor_id: quote.contractor_id,
    new_status: "quote_approved",
    notes: "Your quote has been approved. You may proceed with the work.",
  })

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: quote.org_id,
    table_name: "maintenance_quotes",
    record_id: quoteId,
    action: "UPDATE",
    changed_by: approvedBy,
    new_values: { status: "approved", amount: quote.total_incl_vat_cents },
  })

  return { success: true, needs_landlord: false }
}

export async function rejectQuote(
  quoteId: string,
  rejectedBy: string,
  reason: string
) {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from("maintenance_quotes")
    .select("id, request_id, org_id, contractor_id")
    .eq("id", quoteId)
    .single()

  if (!quote) return { error: "Quote not found" }

  await supabase.from("maintenance_quotes").update({
    status: "rejected",
    reviewed_by: rejectedBy,
    reviewed_at: new Date().toISOString(),
    rejection_reason: reason,
  }).eq("id", quoteId)

  await supabase.from("maintenance_requests").update({
    status: "quote_rejected",
  }).eq("id", quote.request_id)

  // Notify contractor
  await supabase.from("contractor_updates").insert({
    org_id: quote.org_id,
    request_id: quote.request_id,
    contractor_id: quote.contractor_id,
    new_status: "quote_rejected",
    notes: `Quote rejected: ${reason}`,
  })

  return { success: true }
}
