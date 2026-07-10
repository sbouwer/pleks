"use server"

/**
 * lib/actions/recon.ts — bank-statement import, auto-match + manual resolve, reconciliation sign-off
 *
 * Auth:   requireAgentWriteAccess("sign_off_recon") on the mutating actions.
 * Data:   bank_statement_imports + bank_statement_lines + rent_invoices/payments via the gateway db; audited.
 * Notes:  recomputeDiscrepancy() maintains bank_statement_imports.balance_discrepancy_cents after every match
 *         change (F-5 part 1) — the figure the reconciliation page shows. The sign-off-on-zero gate (F-5 part 2)
 *         builds on this; don't gate until the field is maintained (it now is, here).
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { revalidatePath } from "next/cache"
import { runMatchingPipeline } from "@/lib/recon/matchingEngine"
import { parseOFX } from "@/lib/recon/ofxParser"
import { parseQIF } from "@/lib/recon/qifParser"
import { parseCSVBank } from "@/lib/recon/csvBankParser"
import type { ParsedTransaction } from "@/lib/recon/ofxParser"
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { saTodayISO } from "@/lib/dates"

type ImportSource = "upload" | "ofx" | "csv" | "qif" | "yodlee"


function detectFormat(filename: string, mime: string): "pdf" | "ofx" | "qif" | "csv" | null {
  const ext = filename.split(".").pop()?.toLowerCase()
  if (ext === "pdf" || mime === "application/pdf") return "pdf"
  if (ext === "ofx" || ext === "qfx") return "ofx"
  if (ext === "qif") return "qif"
  if (ext === "csv") return "csv"
  // Fallback on MIME
  if (mime.includes("pdf")) return "pdf"
  if (mime.includes("csv") || mime.includes("excel")) return "csv"
  return null
}

async function insertStatementLines(
  db: SupabaseClient,
  orgId: string,
  importId: string,
  transactions: ParsedTransaction[],
): Promise<number> {
  const rows = transactions.map((t, i) => ({
    org_id: orgId,
    import_id: importId,
    external_id: t.externalId,
    transaction_date: t.date,
    description_raw: t.descriptionRaw,
    description_clean: t.descriptionClean,
    reference_raw: t.referenceRaw,
    reference_clean: t.referenceClean,
    amount_cents: t.amountCents,
    debit_cents: t.direction === "debit" ? Math.abs(t.amountCents) : 0,
    credit_cents: t.direction === "credit" ? Math.abs(t.amountCents) : 0,
    direction: t.direction,
    match_status: "unmatched",
    line_sequence: i + 1,
  }))

  // Upsert — skip duplicates (dedup by external_id via unique index)
  const { data: inserted, error } = await db
    .from("bank_statement_lines")
    .upsert(rows, { onConflict: "org_id,external_id", ignoreDuplicates: true })
    .select("id")

  if (error) throw new Error(error.message)
  return inserted?.length ?? 0
}

/**
 * Compute + store the reconciliation discrepancy (F-5 part 1). pleks_calculated_closing = opening_balance +
 * Σ(matched credits − matched debits); balance_discrepancy_cents = statement_closing − pleks_calculated_closing.
 * "Matched" = any line not unmatched/ignored (same set as matched_count). Surfaces "your statement doesn't
 * reconcile to zero" so the agent can investigate before sign-off. No-op until both statement balances are known.
 */
async function recomputeDiscrepancy(db: SupabaseClient, orgId: string, importId: string): Promise<void> {
  const { data: imp, error: impErr } = await db
    .from("bank_statement_imports")
    .select("opening_balance_cents, closing_balance_cents")
    .eq("id", importId)
    .eq("org_id", orgId)
    .single()
  logQueryError("recomputeDiscrepancy bank_statement_imports", impErr)
  if (imp?.opening_balance_cents == null || imp?.closing_balance_cents == null) return

  const { data: lines, error: linesErr } = await db
    .from("bank_statement_lines")
    .select("amount_cents, direction, match_status")
    .eq("import_id", importId)
    .eq("org_id", orgId)
  logQueryError("recomputeDiscrepancy bank_statement_lines", linesErr)

  let matchedNet = 0
  for (const l of lines ?? []) {
    if (l.match_status === "unmatched" || l.match_status === "ignored") continue
    matchedNet += l.direction === "credit" ? l.amount_cents : -l.amount_cents
  }
  const discrepancy = imp.closing_balance_cents - (imp.opening_balance_cents + matchedNet)

  await db.from("bank_statement_imports").update({ balance_discrepancy_cents: discrepancy }).eq("id", importId).eq("org_id", orgId)
}

async function autoMatchLines(
  db: SupabaseClient,
  orgId: string,
  importId: string,
): Promise<number> {
  const { data: lines, error } = await db
    .from("bank_statement_lines")
    .select("id, reference_clean, description_clean, amount_cents, direction, transaction_date")
    .eq("import_id", importId)
    .eq("org_id", orgId)
    .eq("match_status", "unmatched")

  if (error || !lines?.length) return 0

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
      ctx,
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
      .eq("org_id", orgId)
    matched++
  }

  // Refresh import counters
  const { data: counts, error: countsError } = await db
    .from("bank_statement_lines")
    .select("match_status")
    .eq("import_id", importId)
    .eq("org_id", orgId)
    logQueryError("autoMatchLines bank_statement_lines", countsError)

  const total = counts?.length ?? 0
  const matchedCount = counts?.filter((l) => l.match_status !== "unmatched" && l.match_status !== "ignored").length ?? 0
  const unmatchedCount = counts?.filter((l) => l.match_status === "unmatched").length ?? 0

  await db
    .from("bank_statement_imports")
    .update({ transaction_count: total, matched_count: matchedCount, unmatched_count: unmatchedCount })
    .eq("id", importId)
    .eq("org_id", orgId)

  await recomputeDiscrepancy(db, orgId, importId)
  return matched
}

export async function createBankImport(formData: FormData): Promise<{
  error?: string
  success?: boolean
  importId?: string
  matched?: number
  total?: number
  source?: ImportSource
}> {
  const gw = await requireAgentWriteAccess("create_bank_import")
  const { db, userId, orgId } = gw

  const bankAccountId = formData.get("bank_account_id") as string
  const file = formData.get("file") as File

  if (!file) return { error: "No file provided" }

  const format = detectFormat(file.name, file.type)
  if (!format) return { error: "Unsupported file format. Use PDF, OFX, QIF, or CSV." }

  if (file.size > 20 * 1024 * 1024) return { error: "File too large (max 20MB)" }

  const safeFilename = file.name.replaceAll(/[^a-zA-Z0-9.-]/g, "_")
  const storagePath = `${orgId}/${bankAccountId}/${Date.now()}-${safeFilename}`
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from("bank-statements")
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" })

  if (uploadError) return { error: uploadError.message }

  const source: ImportSource = format === "pdf" ? "upload" : format

  const { data: importRecord, error: insertError } = await db
    .from("bank_statement_imports")
    .insert({
      org_id: orgId,
      bank_account_id: bankAccountId,
      original_filename: file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      import_source: source,
      extraction_status: format === "pdf" ? "pending" : "extracting",
      created_by: userId,
    })
    .select("id")
    .single()

  if (insertError || !importRecord) return { error: insertError?.message || "Failed to create import" }

  const importId = importRecord.id

  // PDF: queue for AI extraction (existing flow), return early
  if (format === "pdf") {
    revalidatePath("/billing/reconciliation")
    return { success: true, importId, source: "upload" }
  }

  // Structured formats: parse immediately
  const text = new TextDecoder().decode(buffer)
  let transactions: ParsedTransaction[] = []
  let detectedBank: string | null = null
  let parseError: string | undefined

  if (format === "ofx") {
    const result = parseOFX(text)
    transactions = result.transactions
    parseError = result.error
    // Update import with period/account info
    if (result.periodFrom || result.accountNumber) {
      await db.from("bank_statement_imports").update({
        statement_period_from: result.periodFrom ?? null,
        statement_period_to: result.periodTo ?? null,
        statement_account_number: result.accountNumber ?? null,
        closing_balance_cents: result.closingBalanceCents ?? null,
      }).eq("id", importId).eq("org_id", orgId) // org-scope guard (caller-ID census)
    }
  } else if (format === "qif") {
    const result = parseQIF(text)
    transactions = result.transactions
    parseError = result.error
  } else if (format === "csv") {
    const result = parseCSVBank(text)
    transactions = result.transactions
    detectedBank = result.detectedBank
    parseError = result.error
    if (detectedBank && detectedBank !== "unknown") {
      await db.from("bank_statement_imports").update({ detected_bank: detectedBank }).eq("id", importId).eq("org_id", orgId)
    }
  }

  if (parseError && transactions.length === 0) {
    await db.from("bank_statement_imports")
      .update({ extraction_status: "failed" })
      .eq("id", importId)
      .eq("org_id", orgId)
    return { error: `Parse error: ${parseError}` }
  }

  // Insert lines
  let insertedCount = 0
  try {
    insertedCount = await insertStatementLines(db, orgId, importId, transactions)
  } catch (err) {
    await db.from("bank_statement_imports").update({ extraction_status: "failed" }).eq("id", importId).eq("org_id", orgId)
    return { error: String(err) }
  }

  await db.from("bank_statement_imports").update({
    extraction_status: "matching",
    transaction_count: insertedCount,
  }).eq("id", importId).eq("org_id", orgId)

  // Auto-match
  const matched = await autoMatchLines(db, orgId, importId)

  await db.from("bank_statement_imports").update({
    extraction_status: "complete",
    extracted_at: new Date().toISOString(),
    matched_at: new Date().toISOString(),
  }).eq("id", importId).eq("org_id", orgId)

  revalidatePath("/billing/reconciliation")
  return { success: true, importId, matched, total: insertedCount, source }
}

export async function resolveStatementLine(
  lineId: string,
  action: "match_manual" | "ignore",
  matchData?: { invoiceId?: string; supplierInvoiceId?: string; reason?: string }
) {
  const gw = await requireAgentWriteAccess("sign_off_recon")
  const { db, userId, orgId } = gw

  const updates: Record<string, unknown> = {
    resolved_by: userId,
    resolved_at: new Date().toISOString(),
  }

  if (action === "ignore") {
    updates.match_status = "ignored"
    updates.ignore_reason = matchData?.reason || "bank_fee"
  } else {
    updates.match_status = "matched_manual"
    updates.match_confidence = 1
    if (matchData?.invoiceId) updates.matched_invoice_id = matchData.invoiceId
    if (matchData?.supplierInvoiceId) updates.matched_supplier_inv_id = matchData.supplierInvoiceId
  }

  // Org-scope the line update (caller-ID census) — a foreign lineId matches nothing.
  const { data: updated, error } = await db.from("bank_statement_lines").update(updates).eq("id", lineId).eq("org_id", orgId).select("import_id").single()
  if (error) return { error: error.message }

  if (updated?.import_id) await recomputeDiscrepancy(db, orgId, updated.import_id as string)
  revalidatePath("/billing/reconciliation")
  return { success: true }
}

/**
 * F-5: confirm or reject a fuzzy (±R50) suggested match. Confirm promotes it to a verified manual match
 * (keeping the suggested invoice); reject clears the suggestion back to unmatched for re-resolution. Either
 * way the line leaves the matched_fuzzy state that blocks sign-off. Audited via resolved_by/at.
 */
export async function resolveFuzzyMatch(lineId: string, decision: "confirm" | "reject") {
  const gw = await requireAgentWriteAccess("sign_off_recon")
  const { db, userId, orgId } = gw

  const updates: Record<string, unknown> = { resolved_by: userId, resolved_at: new Date().toISOString() }
  if (decision === "confirm") {
    updates.match_status = "matched_manual"
    updates.match_confidence = 1
  } else {
    updates.match_status = "unmatched"
    updates.match_confidence = null
    updates.matched_invoice_id = null
    updates.matched_supplier_inv_id = null
  }

  const { data: updated, error } = await db
    .from("bank_statement_lines")
    .update(updates)
    .eq("id", lineId)
    .eq("org_id", orgId)
    .eq("match_status", "matched_fuzzy")   // only act on an un-confirmed fuzzy suggestion (idempotent)
    .select("import_id")
    .maybeSingle()
  if (error) return { error: error.message }

  if (updated?.import_id) await recomputeDiscrepancy(db, orgId, updated.import_id as string)
  revalidatePath("/billing/reconciliation")
  return { success: true }
}

export async function runAutoMatch(importId: string): Promise<{ matched: number } | { error: string }> {
  const gw = await requireAgentWriteAccess("sign_off_recon")
  const { db, orgId } = gw

  const matched = await autoMatchLines(db, orgId, importId)
  revalidatePath("/billing/reconciliation")
  return { matched }
}

export async function signOffReconciliation(importId: string, acceptVariance?: { reason: string }) {
  const gw = await requireAgentWriteAccess("sign_off_recon")
  const { db, userId, orgId } = gw

  const { data: unmatched, error: unmatchedError } = await db
    .from("bank_statement_lines")
    .select("id")
    .eq("import_id", importId)
    .eq("org_id", orgId)
    .eq("match_status", "unmatched")
    .limit(1)
    logQueryError("signOffReconciliation bank_statement_lines", unmatchedError)

  if (unmatched && unmatched.length > 0) {
    return { error: "All transactions must be matched or ignored before sign-off" }
  }

  // F-5: a fuzzy (±R50) auto-match is a SUGGESTION, not a confirmed match — block sign-off until an agent
  // confirms or rejects each one, so a reconciliation can't close on amounts nobody verified.
  const { data: fuzzy, error: fuzzyError } = await db
    .from("bank_statement_lines")
    .select("id")
    .eq("import_id", importId)
    .eq("org_id", orgId)
    .eq("match_status", "matched_fuzzy")
    .limit(1)
    logQueryError("signOffReconciliation fuzzy check", fuzzyError)

  if (fuzzy && fuzzy.length > 0) {
    return { error: "Confirm or reject every fuzzy (±R50) suggested match before sign-off" }
  }

  // F-5 part 2: don't let a reconciliation close with an unexplained discrepancy. Require it to net to zero, or
  // an explicit accept-variance with a reason (audited). Reads the maintained field from F-5 part 1.
  const { data: imp, error: impError } = await db
    .from("bank_statement_imports")
    .select("org_id, balance_discrepancy_cents")
    .eq("id", importId)
    .eq("org_id", orgId)
    .single()
    logQueryError("signOffReconciliation bank_statement_imports", impError)

  const discrepancy = imp?.balance_discrepancy_cents ?? 0
  if (discrepancy !== 0 && !acceptVariance?.reason?.trim()) {
    return {
      error: `This statement doesn't reconcile to zero (R${(discrepancy / 100).toFixed(2)} unaccounted). Resolve the matches, or sign off with an accepted-variance reason.`,
      needsVariance: true,
      discrepancyCents: discrepancy,
    }
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
    .eq("org_id", orgId)

  if (error) return { error: error.message }

  if (imp) {
    await db.from("audit_log").insert({
      org_id: imp.org_id,
      table_name: "bank_statement_imports",
      record_id: importId,
      action: "UPDATE",
      changed_by: userId,
      new_values: {
        reconciled: true,
        ...(discrepancy !== 0 ? { variance_accepted_cents: discrepancy, variance_reason: acceptVariance?.reason?.trim() } : {}),
      },
    })
  }

  revalidatePath("/billing/reconciliation")
  return { success: true }
}

/** Called by Yodlee sync (cron + on-demand). Inserts transactions and auto-matches. */
export async function syncYodleeTransactions(
  orgId: string,
  connectionId: string,
  bankAccountId: string,
  transactions: ParsedTransaction[],
  db: SupabaseClient,
): Promise<{ inserted: number; matched: number; error?: string }> {
  // Create a synthetic import record for this sync batch
  const { data: importRecord, error: impErr } = await db
    .from("bank_statement_imports")
    .insert({
      org_id: orgId,
      bank_account_id: bankAccountId,
      original_filename: `yodlee-sync-${saTodayISO()}.json`,
      storage_path: "",
      file_size_bytes: 0,
      import_source: "yodlee",
      extraction_status: "extracting",
      created_by: "00000000-0000-0000-0000-000000000000",
    })
    .select("id")
    .single()

  if (impErr || !importRecord) return { inserted: 0, matched: 0, error: impErr?.message }

  const importId = importRecord.id

  let inserted = 0
  try {
    inserted = await insertStatementLines(db, orgId, importId, transactions)
  } catch (err) {
    return { inserted: 0, matched: 0, error: String(err) }
  }

  const matched = await autoMatchLines(db, orgId, importId)

  await db.from("bank_statement_imports").update({
    extraction_status: "complete",
    transaction_count: inserted,
    extracted_at: new Date().toISOString(),
    matched_at: new Date().toISOString(),
  }).eq("id", importId)

  // Update connection sync state
  await db.from("bank_feed_connections").update({
    last_synced_at: new Date().toISOString(),
    last_sync_status: "success",
    last_sync_txn_count: inserted,
    last_sync_matched_count: matched,
    last_sync_error: null,
  }).eq("id", connectionId)

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "bank_feed_connections",
    record_id: connectionId,
    action: "SYNC",
    changed_by: "system",
    new_values: { inserted, matched },
  })

  return { inserted, matched }
}
