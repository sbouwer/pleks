"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { allocatePayment } from "@/lib/finance/paymentAllocation"

export async function recordPayment(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  const invoiceId = formData.get("invoice_id") as string
  const amountCents = Math.round(parseFloat(formData.get("amount") as string) * 100)
  const paymentDate = formData.get("payment_date") as string
  const paymentMethod = formData.get("payment_method") as string
  const reference = formData.get("reference") as string || null

  // Get invoice details
  const { data: invoice } = await db
    .from("rent_invoices")
    .select("id, lease_id, tenant_id, total_amount_cents, amount_paid_cents, balance_cents, org_id, unit_id")
    .eq("id", invoiceId)
    .single()

  if (!invoice) return { error: "Invoice not found" }

  const currentBalance = invoice.balance_cents ?? (invoice.total_amount_cents - (invoice.amount_paid_cents || 0))
  const newPaid = (invoice.amount_paid_cents || 0) + amountCents
  const newBalance = invoice.total_amount_cents - newPaid
  const surplus = newBalance < 0 ? Math.abs(newBalance) : 0

  // Determine new invoice status
  let newStatus: string
  if (newBalance <= 0) newStatus = "paid"
  else if (newPaid > 0) newStatus = "partial"
  else newStatus = "open"

  // Create payment record
  const receiptNumber = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      lease_id: invoice.lease_id,
      tenant_id: invoice.tenant_id,
      amount_cents: amountCents,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      reference,
      receipt_number: receiptNumber,
      recorded_by: userId,
      surplus_cents: surplus,
      surplus_disposition: surplus > 0 ? "pending" : null,
      allocated_invoices: [{ invoice_id: invoiceId, amount_cents: Math.min(amountCents, currentBalance) }],
      notes: formData.get("notes") as string || null,
    })
    .select("id")
    .single()

  if (error || !payment) return { error: error?.message || "Failed to record payment" }

  // Update invoice
  await db.from("rent_invoices").update({
    amount_paid_cents: newPaid,
    balance_cents: Math.max(0, newBalance),
    status: newStatus,
    paid_at: newStatus === "paid" ? new Date().toISOString() : null,
  }).eq("id", invoiceId)

  // Trust transaction — confirm the credit
  const currentMonth = new Date()
  currentMonth.setDate(1)

  await db.from("trust_transactions").insert({
    org_id: orgId,
    property_id: null,
    unit_id: invoice.unit_id,
    lease_id: invoice.lease_id,
    transaction_type: "rent_received",
    direction: "credit",
    amount_cents: amountCents,
    description: `Payment received — ${paymentMethod.toUpperCase()}${reference ? ` ref: ${reference}` : ""}`,
    reference: receiptNumber,
    invoice_id: invoiceId,
    statement_month: currentMonth.toISOString().split("T")[0],
    created_by: userId,
  })

  // Allocate payment: interest first, then rent (lease clause 6.6)
  if (invoice.lease_id) {
    await allocatePayment(payment.id, invoice.lease_id, amountCents)
  }

  // Audit
  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "payments",
    record_id: payment.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { amount_cents: amountCents, method: paymentMethod, invoice_id: invoiceId },
  })

  revalidatePath("/payments")
  return { success: true, receiptNumber }
}
