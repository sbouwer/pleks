"use server"

/**
 * lib/actions/payments.ts — record a rent payment against an invoice
 *
 * Auth:   gateway (agent session)
 * Data:   rent_invoices, payments, trust_transactions, audit_log via gateway db
 * Notes:  allocatePayment() handles interest-first allocation (lease clause 6.6).
 *         BUILD_63 Phase 7 (F2): fires rent.payment_received comm after allocation.
 */

import * as React from "react"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { allocatePayment } from "@/lib/finance/paymentAllocation"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { PaymentReceivedEmail } from "@/lib/comms/templates/tenant/rent/payment-received"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function recordPayment(formData: FormData) {
  const gw = await requireAgentWriteAccess("record_payment")
  const { db, userId, orgId } = gw

  const invoiceId = formData.get("invoice_id") as string
  const amountCents = Math.round(parseFloat(formData.get("amount") as string) * 100)
  const paymentDate = formData.get("payment_date") as string
  const paymentMethod = formData.get("payment_method") as string
  const reference = formData.get("reference") as string || null

  // Get invoice details
  const { data: invoice, error: invoiceError } = await db
    .from("rent_invoices")
    .select("id, lease_id, tenant_id, total_amount_cents, amount_paid_cents, balance_cents, org_id, unit_id")
    .eq("id", invoiceId)
    .single()
    logQueryError("recordPayment rent_invoices", invoiceError)

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

  // Store receipt path — on-demand generation at /api/payments/[id]/receipt. Awaited + error-checked
  // (CRITICAL table — not swallowed); the path is deterministic so a failure is logged, not fatal.
  const { error: receiptErr } = await db.from("payments")
    .update({ receipt_path: `/api/payments/${payment.id}/receipt` })
    .eq("id", payment.id)
  if (receiptErr) console.error("recordPayment receipt_path update failed:", receiptErr.message)

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
    await allocatePayment(payment.id, invoice.lease_id, amountCents, userId)
  }

  // BUILD_63 Phase 7 (F2) — fire rent.payment_received comm if tenant has an email
  if (invoice.tenant_id) {
    try {
      const { data: tenant, error: tenantError } = await db
        .from("tenant_view")
        .select("first_name, last_name, email, phone")
        .eq("id", invoice.tenant_id)
        .single()
        logQueryError("recordPayment tenant_view", tenantError)

      if (tenant?.email) {
        const orgSettings = await fetchOrgSettings(orgId)
        const branding = buildBranding(orgSettings)
        const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
        const { data: inv, error: invError } = await db
          .from("rent_invoices")
          .select("invoice_number, balance_cents")
          .eq("id", invoiceId)
          .single()
        logQueryError("recordPayment rent_invoices", invError)
        const invoiceNumber = (inv?.invoice_number as string | null) ?? invoiceId.slice(0, 8).toUpperCase()
        const outstandingBalance = (inv?.balance_cents as number | null) ?? Math.max(0, newBalance)

        function fmt(cents: number) {
          return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
        }

        await routeAndSend({
          orgId,
          tenantId:    invoice.tenant_id as string,
          templateKey: "rent.payment_received",
          to: { email: tenant.email as string, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
          subject: `Payment received — ${receiptNumber}`,
          emailElement: React.createElement(PaymentReceivedEmail, {
            branding,
            tenantName,
            propertyLabel: "your property",
            receiptNumber,
            paymentDate:              new Date(paymentDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
            paymentMethod:            paymentMethod.toUpperCase(),
            amountDisplay:            fmt(amountCents),
            outstandingBalanceDisplay: fmt(outstandingBalance),
            invoiceNumber,
          }),
          entityType:       "payment",
          entityId:         payment.id,
          triggerEventType: "payment_recorded",
          triggerEventId:   payment.id,
          triggeredBy:      userId,
          toneVariant:      "n/a",
        })
      }
    } catch (err) {
      console.error("[recordPayment] comm failed for payment", payment.id, err)
    }
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

  revalidatePath("/billing")
  return { success: true, receiptNumber }
}
