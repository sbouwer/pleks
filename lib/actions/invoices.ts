"use server"

/**
 * lib/actions/invoices.ts — supplier-invoice review server actions (approve, mark paid, reject)
 *
 * Auth:   requireAgentWriteAccess("accept_quote"); every write is org-scoped (.eq("org_id", orgId)).
 * Data:   supplier_invoices via the gateway service client.
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

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
