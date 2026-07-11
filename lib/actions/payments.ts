"use server"

/**
 * lib/actions/payments.ts — record a rent payment against an invoice
 *
 * Auth:   requireAgentWriteAccess("record_payment") + finance capability
 * Data:   record_payment_atomic() RPC writes payments + trust_transactions AND runs the clause-6.6
 *         allocation (interest-first, then oldest rent) in ONE transaction. Everything after is a
 *         post-commit side effect (receipt path, email, audit) allowed to fail independently.
 * Notes:  Allocation is folded INTO the RPC (allocate_payment_atomic). The old post-commit
 *         allocatePayment() call was REMOVED — it re-applied the amount the RPC had already credited,
 *         double-counting on any payment with interest, an older invoice, or a partial target. The
 *         selected invoice is advisory; money follows clause 6.6. BUILD_63 Phase 7 (F2): fires
 *         rent.payment_received comm after the RPC.
 */

import * as React from "react"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { revalidatePath } from "next/cache"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { PaymentReceivedEmail } from "@/lib/comms/templates/tenant/rent/payment-received"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateLongZA } from "@/lib/dates"
import { formatZAR } from "@/lib/constants"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function recordPayment(formData: FormData) {
  const gw = await requireAgentWriteAccess("record_payment")
  if (!(await hasCapability(gw, "finance"))) throw new Error("Finance capability required to record payments")
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

  // Kept only for the payment-received email's outstanding-balance fallback below (the email re-reads
  // the live invoice balance); the authoritative paid/balance/status write happens inside the RPC.
  const newPaid = (invoice.amount_paid_cents || 0) + amountCents
  const newBalance = invoice.total_amount_cents - newPaid

  const receiptNumber = `REC-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`

  // Atomic money+trust write (ADDENDUM_TRUST_RPC_ATOMICITY step 1): payment + target-invoice status +
  // trust rent_received credit commit together or not at all. The old sequence .catch()-swallowed the
  // trust insert, leaving a payment with no matching trust credit — a D-TRUST-01 ledger imbalance.
  const { data: paymentId, error } = await db.rpc("record_payment_atomic", {
    p_org_id: orgId,
    p_invoice_id: invoiceId,
    p_amount_cents: amountCents,
    p_payment_date: paymentDate,
    p_method: paymentMethod,
    p_reference: reference,
    p_recorded_by: userId,
    p_receipt_number: receiptNumber,
    p_notes: (formData.get("notes") as string) || null,
  })

  if (error || !paymentId) {
    console.error("recordPayment record_payment_atomic failed:", error?.message)
    return { error: error?.message || "Failed to record payment" }
  }

  // ── Post-commit side effects — allowed to fail/retry independently, so NOT in the transaction ──

  // Receipt path — deterministic + regenerable (on-demand generation at /api/payments/[id]/receipt).
  const { error: receiptErr } = await db.from("payments")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- freshly-created own row: paymentId is returned by record_payment_atomic (called above with p_org_id: orgId; the RPC RAISEs if the invoice isn't in the org), so it can't be a foreign id
    .update({ receipt_path: `/api/payments/${paymentId}/receipt` })
    .eq("id", paymentId)
  if (receiptErr) console.error("recordPayment receipt_path update failed:", receiptErr.message)

  // Allocation (interest-first, then oldest rent per clause 6.6) now happens INSIDE
  // record_payment_atomic above — one atomic write. No separate post-commit allocatePayment().

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
          return formatZAR(cents, true)
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
            paymentDate:              fmtDateLongZA(paymentDate),
            paymentMethod:            paymentMethod.toUpperCase(),
            amountDisplay:            fmt(amountCents),
            outstandingBalanceDisplay: fmt(outstandingBalance),
            invoiceNumber,
          }),
          entityType:       "payment",
          entityId:         paymentId,
          triggerEventType: "payment_recorded",
          triggerEventId:   paymentId,
          triggeredBy:      userId,
          toneVariant:      "n/a",
        })
      }
    } catch (err) {
      console.error("[recordPayment] comm failed for payment", paymentId, err)
    }
  }

  // Audit
  await recordAudit(db, { orgId: orgId, table: "payments", recordId: paymentId, action: "INSERT", actorId: userId, after: { amount_cents: amountCents, method: paymentMethod, invoice_id: invoiceId } })

  revalidatePath("/billing")
  return { success: true, receiptNumber }
}
