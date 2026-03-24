"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { calculateVAT } from "@/lib/finance/vatCalculation"

export async function createSupplierInvoice(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const contractorId = formData.get("contractor_id") as string || null
  const amountExcl = Math.round(parseFloat(formData.get("amount_excl_vat") as string) * 100)
  const vatRegistered = formData.get("vat_registered") === "true"
  const vat = calculateVAT(amountExcl, vatRegistered)

  const currentMonth = new Date()
  currentMonth.setDate(1)

  const { data: invoice, error } = await supabase
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
      statement_month: currentMonth.toISOString().split("T")[0],
      statement_line_description: formData.get("description") as string,
      status: "submitted",
    })
    .select("id")
    .single()

  if (error || !invoice) {
    return { error: error?.message || "Failed to create invoice" }
  }

  await supabase.from("audit_log").insert({
    org_id: orgId,
    table_name: "supplier_invoices",
    record_id: invoice.id,
    action: "INSERT",
    changed_by: user.id,
    new_values: { amount: vat.inclVat, contractor_id: contractorId },
  })

  revalidatePath("/payments")
  return { success: true, id: invoice.id }
}

export async function approveInvoice(invoiceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("supplier_invoices")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)

  if (error) return { error: error.message }

  revalidatePath("/payments")
  return { success: true }
}

export async function markInvoicePaid(invoiceId: string, reference?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { data: invoice } = await supabase
    .from("supplier_invoices")
    .select("org_id, payment_source")
    .eq("id", invoiceId)
    .single()

  if (!invoice) return { error: "Invoice not found" }

  const newStatus = invoice.payment_source === "owner_direct" ? "owner_direct_recorded" : "paid"

  const { error } = await supabase
    .from("supplier_invoices")
    .update({
      status: newStatus,
      paid_at: new Date().toISOString(),
      paid_by: user.id,
      payment_reference: reference || null,
    })
    .eq("id", invoiceId)

  if (error) return { error: error.message }

  await supabase.from("audit_log").insert({
    org_id: invoice.org_id,
    table_name: "supplier_invoices",
    record_id: invoiceId,
    action: "UPDATE",
    changed_by: user.id,
    new_values: { status: newStatus, paid_at: new Date().toISOString() },
  })

  revalidatePath("/payments")
  return { success: true }
}

export async function rejectInvoice(invoiceId: string, reason: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const { error } = await supabase
    .from("supplier_invoices")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq("id", invoiceId)

  if (error) return { error: error.message }

  revalidatePath("/payments")
  return { success: true }
}
