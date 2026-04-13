"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { allocatePayment } from "@/lib/finance/paymentAllocation"

export type ParsedRow = {
  rowIndex: number
  date: string
  description: string
  reference: string | null
  amountCents: number
}

export type MatchedRow = ParsedRow & {
  matchedInvoiceId: string | null
  matchedInvoiceNumber: string | null
  matchedTenantName: string | null
  matchedLeaseId: string | null
  matchedTenantId: string | null
  matchedBalanceCents: number | null
  confidence: "exact" | "amount" | "none"
}

export type ConfirmedPayment = {
  invoiceId: string
  leaseId: string
  tenantId: string
  amountCents: number
  date: string
  reference: string | null
  description: string
}

function normalizeRef(s: string): string {
  return s.toUpperCase().replace(/[\s\-./]/g, "")
}

function matchByReference(
  row: ParsedRow,
  openInvoices: { id: string; invoice_number: string; balance_cents: number; lease_id: string; tenant_id: string; tenant_name: string }[],
): MatchedRow {
  if (row.reference) {
    const normRef = normalizeRef(row.reference)
    const exact = openInvoices.find((inv) => normalizeRef(inv.invoice_number) === normRef)
    if (exact) {
      return {
        ...row,
        matchedInvoiceId: exact.id,
        matchedInvoiceNumber: exact.invoice_number,
        matchedTenantName: exact.tenant_name,
        matchedLeaseId: exact.lease_id,
        matchedTenantId: exact.tenant_id,
        matchedBalanceCents: exact.balance_cents,
        confidence: "exact",
      }
    }
    // Also check description for invoice number
    const descNorm = normalizeRef(row.description)
    const descMatch = openInvoices.find((inv) => descNorm.includes(normalizeRef(inv.invoice_number)))
    if (descMatch) {
      return {
        ...row,
        matchedInvoiceId: descMatch.id,
        matchedInvoiceNumber: descMatch.invoice_number,
        matchedTenantName: descMatch.tenant_name,
        matchedLeaseId: descMatch.lease_id,
        matchedTenantId: descMatch.tenant_id,
        matchedBalanceCents: descMatch.balance_cents,
        confidence: "exact",
      }
    }
  }
  return matchByAmount(row, openInvoices)
}

function matchByAmount(
  row: ParsedRow,
  openInvoices: { id: string; invoice_number: string; balance_cents: number; lease_id: string; tenant_id: string; tenant_name: string }[],
): MatchedRow {
  const amountMatches = openInvoices.filter((inv) => inv.balance_cents === row.amountCents)
  if (amountMatches.length === 1) {
    const m = amountMatches[0]
    return {
      ...row,
      matchedInvoiceId: m.id,
      matchedInvoiceNumber: m.invoice_number,
      matchedTenantName: m.tenant_name,
      matchedLeaseId: m.lease_id,
      matchedTenantId: m.tenant_id,
      matchedBalanceCents: m.balance_cents,
      confidence: "amount",
    }
  }
  return {
    ...row,
    matchedInvoiceId: null,
    matchedInvoiceNumber: null,
    matchedTenantName: null,
    matchedLeaseId: null,
    matchedTenantId: null,
    matchedBalanceCents: null,
    confidence: "none",
  }
}

export async function matchCsvRows(rows: ParsedRow[]): Promise<{ matched: MatchedRow[]; error?: string }> {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: openInvoices, error } = await db
    .from("rent_invoices")
    .select("id, invoice_number, balance_cents, lease_id, tenant_id, tenant_view(first_name, last_name, company_name, entity_type)")
    .eq("org_id", orgId)
    .in("status", ["open", "partial", "overdue"])
    .gt("balance_cents", 0)

  if (error) return { matched: [], error: error.message }

  const invoices = (openInvoices ?? []).map((inv) => {
    const tv = (inv.tenant_view as unknown) as { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string | null } | null
    const tenantName = tv?.entity_type === "company"
      ? (tv.company_name ?? "")
      : [tv?.first_name, tv?.last_name].filter(Boolean).join(" ")
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      balance_cents: inv.balance_cents ?? 0,
      lease_id: inv.lease_id,
      tenant_id: inv.tenant_id,
      tenant_name: tenantName,
    }
  })

  const matched = rows.map((row) => matchByReference(row, invoices))
  return { matched }
}

import type { SupabaseClient } from "@supabase/supabase-js"

async function processOnePayment(db: SupabaseClient, p: ConfirmedPayment, receiptNumber: string, userId: string, orgId: string): Promise<boolean> {
  const { data: payment, error } = await db
    .from("payments")
    .insert({
      org_id: orgId,
      invoice_id: p.invoiceId,
      lease_id: p.leaseId,
      tenant_id: p.tenantId,
      amount_cents: p.amountCents,
      payment_date: p.date,
      payment_method: "eft",
      reference: p.reference,
      receipt_number: receiptNumber,
      recorded_by: userId,
      allocated_invoices: [{ invoice_id: p.invoiceId, amount_cents: p.amountCents }],
      recon_method: "manual",
    })
    .select("id")
    .single()

  if (error || !payment) return false

  const { data: inv } = await db
    .from("rent_invoices")
    .select("total_amount_cents, amount_paid_cents, unit_id")
    .eq("id", p.invoiceId)
    .single()

  if (inv) {
    const newPaid = (inv.amount_paid_cents ?? 0) + p.amountCents
    const newBalance = inv.total_amount_cents - newPaid
    let newStatus = "open"
    if (newBalance <= 0) newStatus = "paid"
    else if (newPaid > 0) newStatus = "partial"

    await db.from("rent_invoices").update({
      amount_paid_cents: newPaid,
      balance_cents: Math.max(0, newBalance),
      status: newStatus,
      paid_at: newStatus === "paid" ? new Date().toISOString() : null,
    }).eq("id", p.invoiceId)

    await db.from("trust_transactions").insert({
      org_id: orgId,
      unit_id: inv.unit_id,
      lease_id: p.leaseId,
      transaction_type: "rent_received",
      direction: "credit",
      amount_cents: p.amountCents,
      description: "Bulk import — " + (p.reference ?? p.description),
      reference: receiptNumber,
      invoice_id: p.invoiceId,
      statement_month: p.date.slice(0, 7) + "-01",
      created_by: userId,
    })

    if (p.leaseId) {
      await allocatePayment(payment.id, p.leaseId, p.amountCents)
    }
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "payments",
    record_id: payment.id,
    action: "INSERT",
    changed_by: userId,
    new_values: { amount_cents: p.amountCents, method: "eft", invoice_id: p.invoiceId, source: "bulk_import" },
  })

  return true
}

export async function confirmBulkPayments(payments: ConfirmedPayment[]): Promise<{ created: number; error?: string }> {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

  let created = 0
  for (const p of payments) {
    const receiptNumber = "REC-" + new Date(p.date).getFullYear() + "-" + Date.now().toString().slice(-5)
    const ok = await processOnePayment(db, p, receiptNumber, userId, orgId)
    if (ok) created++
  }

  revalidatePath("/payments")
  return { created }
}
