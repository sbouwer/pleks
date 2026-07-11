"use server"

/**
 * lib/actions/invoices.ts — supplier-invoice review server actions (approve, mark paid, reject)
 *
 * Auth:   requireAgentWriteAccess("accept_quote"); every write is org-scoped (.eq("org_id", orgId)).
 * Data:   supplier_invoices via the gateway service client.
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { calculateVAT } from "@/lib/finance/vatCalculation"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { monthStart, saTodayISO } from "@/lib/dates"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function createSupplierInvoice(formData: FormData) {
  const gw = await requireAgentWriteAccess("accept_quote")
  const { db, userId, orgId } = gw

  const contractorId = formData.get("contractor_id") as string || null
  const amountExcl = Math.round(parseFloat(formData.get("amount_excl_vat") as string) * 100)
  const vatRegistered = formData.get("vat_registered") === "true"
  const vat = calculateVAT(amountExcl, vatRegistered)

  // `new Date()` + local setDate(1), sliced in UTC — the month label depended on the server timezone.
  const statementMonth = monthStart(saTodayISO())

  const { data: invoice, error } = await db
    .from("supplier_invoices")
    .insert({
      org_id: orgId,
      contractor_id: contractorId,
      maintenance_request_id: formData.get("maintenance_request_id") as string || null,
      schedule_id: formData.get("schedule_id") as string || null,
      property_id: formData.get("property_id") as string || null,
      unit_id: formData.get("unit_id") as string || null,
      invoice_number: formData.get("invoice_number") as string || null,
      invoice_date: formData.get("invoice_date") as string,
      due_date: formData.get("due_date") as string || null,
      description: formData.get("description") as string,
      amount_excl_vat_cents: vat.exclVat,
      vat_amount_cents: vat.vatAmount,
      amount_incl_vat_cents: vat.inclVat,
      payment_source: formData.get("payment_source") as string || "trust",
      statement_month: statementMonth,
      statement_line_description: formData.get("description") as string,
      status: "submitted",
    })
    .select("id")
    .single()

  if (error || !invoice) {
    return { error: error?.message || "Failed to create invoice" }
  }

  await recordAudit(db, { orgId: orgId, table: "supplier_invoices", recordId: invoice.id, action: "INSERT", actorId: userId, after: { amount: vat.inclVat, contractor_id: contractorId } })

  revalidatePath("/billing")
  return { success: true, id: invoice.id }
}

export async function approveInvoice(invoiceId: string) {
  const gw = await requireAgentWriteAccess("accept_quote")
  const { db, userId, orgId } = gw

  const { error } = await db
    .from("supplier_invoices")
    .update({
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)

  if (error) return { error: error.message }

  revalidatePath("/billing")
  return { success: true }
}

export async function markInvoicePaid(invoiceId: string, reference?: string) {
  const gw = await requireAgentWriteAccess("accept_quote")
  const { db, userId, orgId } = gw

  const { data: invoice, error: invoiceError } = await db
    .from("supplier_invoices")
    .select("org_id, payment_source")
    .eq("id", invoiceId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)
    .single()
    logQueryError("markInvoicePaid supplier_invoices", invoiceError)

  if (!invoice) return { error: "Invoice not found" }

  const newStatus = invoice.payment_source === "owner_direct" ? "owner_direct_recorded" : "paid"

  const { error } = await db
    .from("supplier_invoices")
    .update({
      status: newStatus,
      paid_at: new Date().toISOString(),
      paid_by: userId,
      payment_reference: reference || null,
    })
    .eq("id", invoiceId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  await recordAudit(db, { orgId: invoice.org_id, table: "supplier_invoices", recordId: invoiceId, action: "UPDATE", actorId: userId, after: { status: newStatus, paid_at: new Date().toISOString() } })

  revalidatePath("/billing")
  return { success: true }
}

export async function rejectInvoice(invoiceId: string, reason: string) {
  const gw = await requireAgentWriteAccess("accept_quote")
  const { db, userId, orgId } = gw

  const { error } = await db
    .from("supplier_invoices")
    .update({
      status: "rejected",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", invoiceId)
    .eq("org_id", orgId) // org-scope guard (caller-ID census)

  if (error) return { error: error.message }

  revalidatePath("/billing")
  return { success: true }
}
