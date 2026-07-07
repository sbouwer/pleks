"use server"

/**
 * lib/actions/supplierQuote.ts — supplier submits a quote for an assigned job (ADDENDUM_00M Phase 2)
 *
 * Auth:   getSupplierSession (Supabase-auth contractor); writes only for jobs assigned to THIS supplier
 * Data:   maintenance_quotes (insert), maintenance_requests (status → quote_submitted)
 * Notes:  Replaces the supplier quote page's browser-cookie-client read of contractor_view +
 *         direct insert. Resolves the contractor server-side (service) and recomputes totals here
 *         (never trust client math); the job is re-scoped to the supplier before the quote lands.
 */
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { createServiceClient } from "@/lib/supabase/server"

export interface SupplierQuoteLineItem {
  description:      string
  quantity:         number
  unit_price_cents: number
  vat_applicable:   boolean
}

export interface SupplierQuoteInput {
  requestId:         string
  quoteType:         string
  lineItems:         SupplierQuoteLineItem[]
  scopeOfWork:       string
  exclusions:        string | null
  estimatedDuration: string | null
  materialsIncluded: boolean
  callOutIncluded:   boolean
  notes:             string | null
  isVatRegistered:   boolean
}

export async function submitSupplierQuote(
  input: SupplierQuoteInput,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSupplierSession()
  if (!session) return { ok: false, error: "Not authenticated" }

  if (!input.scopeOfWork.trim()) return { ok: false, error: "Please describe the scope of work" }
  if (input.lineItems.length === 0 || input.lineItems.some((i) => !i.description.trim() || i.unit_price_cents <= 0)) {
    return { ok: false, error: "Please fill in all line items" }
  }

  // Recompute totals server-side — never trust the client's arithmetic.
  const subtotal  = input.lineItems.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0)
  const vatAmount = input.isVatRegistered ? Math.round(subtotal * 0.15) : 0
  const total     = subtotal + vatAmount

  const service = await createServiceClient()

  // The job must be assigned to THIS supplier before a quote can be lodged against it.
  const { data: job, error: jobErr } = await service
    .from("maintenance_requests")
    .select("id")
    .eq("id", input.requestId)
    .eq("contractor_id", session.contractorId)
    .maybeSingle()
  if (jobErr) {
    console.error("[submitSupplierQuote] job lookup failed:", jobErr.message)
    return { ok: false, error: "Failed to submit quote" }
  }
  if (!job) return { ok: false, error: "Job not found" }

  const { error: insErr } = await service.from("maintenance_quotes").insert({
    org_id:        session.orgId,
    request_id:    input.requestId,
    contractor_id: session.contractorId,
    quote_type:    input.quoteType,
    line_items:    input.lineItems.map((item) => ({
      description:      item.description,
      quantity:         item.quantity,
      unit_price_cents: item.unit_price_cents,
      vat_applicable:   item.vat_applicable,
      line_total_cents: item.quantity * item.unit_price_cents,
    })),
    subtotal_excl_vat_cents: subtotal,
    vat_amount_cents:        vatAmount,
    total_incl_vat_cents:    total,
    scope_of_work:           input.scopeOfWork,
    exclusions:              input.exclusions,
    estimated_duration:      input.estimatedDuration,
    materials_included:      input.materialsIncluded,
    call_out_included:       input.callOutIncluded,
    contractor_notes:        input.notes,
    status:                  "submitted",
    submitted_at:            new Date().toISOString(),
  })
  if (insErr) {
    console.error("[submitSupplierQuote] insert failed:", insErr.message)
    return { ok: false, error: "Failed to submit quote" }
  }

  const { error: updErr } = await service
    .from("maintenance_requests")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- portal-scoped: getSupplierSession() resolves session.contractorId; the write is scoped .eq("contractor_id", session.contractorId) and the job was validated to belong to this contractor above
    .update({ status: "quote_submitted" })
    .eq("id", input.requestId)
    .eq("contractor_id", session.contractorId)
  if (updErr) console.error("[submitSupplierQuote] status update failed:", updErr.message) // non-fatal

  return { ok: true }
}
