"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { runMatchingPipeline } from "@/lib/recon/matchingEngine"

export async function createBankImport(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, orgId } = gw

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

  const { error: uploadError } = await db.storage
    .from("bank-statements")
    .upload(filename, buffer, { contentType: "application/pdf" })

  if (uploadError) return { error: uploadError.message }

  const { data: importRecord, error } = await db
    .from("bank_statement_imports")
    .insert({
      org_id: orgId,
      bank_account_id: bankAccountId,
      original_filename: file.name,
      storage_path: filename,
      file_size_bytes: file.size,
      extraction_status: "pending",
      created_by: userId,
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
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId } = gw

  const updates: Record<string, unknown> = {
    resolved_by: userId,
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

  const { error } = await db
    .from("bank_statement_lines")
    .update(updates)
    .eq("id", lineId)

  if (error) return { error: error.message }

  revalidatePath("/payments/reconciliation")
  return { success: true }
}

export async function runAutoMatch(importId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { data: lines } = await db
    .from("bank_statement_lines")
    .select("id, reference_clean, description_clean, amount_cents, direction, transaction_date")
    .eq("import_id", importId)
    .eq("match_status", "unmatched")

  if (!lines?.length) return { matched: 0 }

  const ctx = { db, orgId }
  let matched = 0

  for (const line of lines) {
    const result = await runMatchingPipeline(
      {
        reference_clean: line.reference_clean as string | null,
        description_clean: line.description_clean as string | null,
        amount_cents: line.amount_cents as number,
        direction: line.direction as "credit" | "debit",
        transaction_date: line.transaction_date as string,
      },
      ctx
    )

    if (!result) continue

    await db
      .from("bank_statement_lines")
      .update({
        match_status: result.matchType,
        match_confidence: result.confidence,
        matched_invoice_id: result.invoiceId ?? null,
        matched_supplier_inv_id: result.supplierInvoiceId ?? null,
      })
      .eq("id", line.id)

    matched++
  }

  // Refresh import counters
  const { data: counts } = await db
    .from("bank_statement_lines")
    .select("match_status")
    .eq("import_id", importId)

  const total = counts?.length ?? 0
  const matchedCount = counts?.filter((l) => l.match_status !== "unmatched" && l.match_status !== "ignored").length ?? 0
  const unmatchedCount = counts?.filter((l) => l.match_status === "unmatched").length ?? 0

  await db
    .from("bank_statement_imports")
    .update({ transaction_count: total, matched_count: matchedCount, unmatched_count: unmatchedCount })
    .eq("id", importId)

  revalidatePath("/payments/reconciliation")
  return { matched }
}

export async function signOffReconciliation(importId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, userId } = gw

  // Check all lines are matched or ignored
  const { data: unmatched } = await db
    .from("bank_statement_lines")
    .select("id")
    .eq("import_id", importId)
    .eq("match_status", "unmatched")
    .limit(1)

  if (unmatched && unmatched.length > 0) {
    return { error: "All transactions must be matched or ignored before sign-off" }
  }

  const { error } = await db
    .from("bank_statement_imports")
    .update({
      reconciled: true,
      reconciled_by: userId,
      reconciled_at: new Date().toISOString(),
      extraction_status: "complete",
    })
    .eq("id", importId)

  if (error) return { error: error.message }

  // Get org_id for audit
  const { data: imp } = await db
    .from("bank_statement_imports")
    .select("org_id")
    .eq("id", importId)
    .single()

  if (imp) {
    await db.from("audit_log").insert({
      org_id: imp.org_id,
      table_name: "bank_statement_imports",
      record_id: importId,
      action: "UPDATE",
      changed_by: userId,
      new_values: { reconciled: true },
    })
  }

  revalidatePath("/payments/reconciliation")
  return { success: true }
}
