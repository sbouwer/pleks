"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

export async function createBankImport(formData: FormData) {
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

  const bankAccountId = formData.get("bank_account_id") as string
  const file = formData.get("file") as File

  if (!file || file.type !== "application/pdf") {
    return { error: "PDF files only" }
  }

  if (file.size > 20 * 1024 * 1024) {
    return { error: "File too large (max 20MB)" }
  }

  // Store in Supabase Storage
  const filename = `${orgId}/${bankAccountId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from("bank-statements")
    .upload(filename, buffer, { contentType: "application/pdf" })

  if (uploadError) return { error: uploadError.message }

  const { data: importRecord, error } = await supabase
    .from("bank_statement_imports")
    .insert({
      org_id: orgId,
      bank_account_id: bankAccountId,
      original_filename: file.name,
      storage_path: filename,
      file_size_bytes: file.size,
      extraction_status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single()

  if (error || !importRecord) return { error: error?.message || "Failed to create import" }

  // TODO: Trigger extraction via Edge Function
  // For now, mark as pending — extraction happens when API is wired

  revalidatePath("/payments/reconciliation")
  return { success: true, importId: importRecord.id }
}

export async function resolveStatementLine(
  lineId: string,
  action: "match_manual" | "ignore",
  matchData?: { invoiceId?: string; supplierInvoiceId?: string; reason?: string }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const updates: Record<string, unknown> = {
    resolved_by: user.id,
    resolved_at: new Date().toISOString(),
  }

  if (action === "ignore") {
    updates.match_status = "ignored"
    updates.ignore_reason = matchData?.reason || "bank_fee"
  } else {
    updates.match_status = "matched_manual"
    updates.match_confidence = 1.0
    if (matchData?.invoiceId) updates.matched_invoice_id = matchData.invoiceId
    if (matchData?.supplierInvoiceId) updates.matched_supplier_inv_id = matchData.supplierInvoiceId
  }

  const { error } = await supabase
    .from("bank_statement_lines")
    .update(updates)
    .eq("id", lineId)

  if (error) return { error: error.message }

  revalidatePath("/payments/reconciliation")
  return { success: true }
}

export async function signOffReconciliation(importId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  // Check all lines are matched or ignored
  const { data: unmatched } = await supabase
    .from("bank_statement_lines")
    .select("id")
    .eq("import_id", importId)
    .eq("match_status", "unmatched")
    .limit(1)

  if (unmatched && unmatched.length > 0) {
    return { error: "All transactions must be matched or ignored before sign-off" }
  }

  const { error } = await supabase
    .from("bank_statement_imports")
    .update({
      reconciled: true,
      reconciled_by: user.id,
      reconciled_at: new Date().toISOString(),
      extraction_status: "complete",
    })
    .eq("id", importId)

  if (error) return { error: error.message }

  // Get org_id for audit
  const { data: imp } = await supabase
    .from("bank_statement_imports")
    .select("org_id")
    .eq("id", importId)
    .single()

  if (imp) {
    await supabase.from("audit_log").insert({
      org_id: imp.org_id,
      table_name: "bank_statement_imports",
      record_id: importId,
      action: "UPDATE",
      changed_by: user.id,
      new_values: { reconciled: true },
    })
  }

  revalidatePath("/payments/reconciliation")
  return { success: true }
}
