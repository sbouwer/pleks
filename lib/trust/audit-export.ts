/**
 * lib/trust/audit-export.ts — Trust period audit export generator
 *
 * Auth:   service-role (called from closeTrustPeriod or a regenerate action)
 * Data:   trust_reconciliation_periods, trust_transactions, organisations,
 *         bank_accounts, deposit_transactions, management_fee_invoices
 * Notes:  Generates PDF + XLSX bundle, hashes jointly (SHA-256), uploads to
 *         trust-audit-exports bucket, inserts trust_audit_exports row.
 *         Non-fatal from close.ts — export can be regenerated from audit page.
 */

import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import ExcelJS from "exceljs"
import { createHash } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import {
  TrustAuditPdf,
  type TrustAuditData,
  type TrustTxnRow,
  type DepositHeldRow,
  type ManagementFeeRow,
} from "./TrustAuditPdf"
import type { OutstandingItem } from "./close"
import { SA_TIMEZONE, fmtZA } from "@/lib/dates"

export interface GenerateAuditExportParams {
  periodId: string
  orgId: string
  userId: string
  regenerationReason?: string
}

export interface GenerateAuditExportResult {
  exportId: string
}

export async function generateAuditExport(
  params: GenerateAuditExportParams,
): Promise<GenerateAuditExportResult> {
  const db = await createServiceClient()

  // ── 1. Fetch period ──────────────────────────────────────────────────────
  const { data: period, error: periodErr } = await db
    .from("trust_reconciliation_periods")
    .select("*")
    .eq("id", params.periodId)
    .eq("org_id", params.orgId)
    .single()

  if (periodErr || !period) {
    throw new Error(`[generateAuditExport] period not found: ${periodErr?.message ?? "unknown"}`)
  }

  // ── 2. Fetch org ─────────────────────────────────────────────────────────
  const { data: org, error: orgErr } = await db
    .from("organisations")
    .select("name, trading_as, ppra_ffc_number, ppra_ffc_expiry_date")
    .eq("id", params.orgId)
    .single()

  if (orgErr || !org) {
    throw new Error(`[generateAuditExport] org not found: ${orgErr?.message ?? "unknown"}`)
  }

  // ── 3. Fetch bank account ─────────────────────────────────────────────────
  const { data: bankAccount, error: bankAccountErr } = await db
    .from("bank_accounts")
    .select("bank_name, account_number")
    .eq("id", period.bank_account_id)
    .single()
  if (bankAccountErr) console.error("[generateAuditExport] bank_accounts query failed:", bankAccountErr.message)

  const bankAccountMasked = maskAccount(bankAccount?.account_number)
  const bankName = bankAccount?.bank_name ?? "Trust Account"

  // ── 4. Fetch signer email ─────────────────────────────────────────────────
  let signedOffByEmail = period.signed_off_by ?? params.userId
  if (period.signed_off_by) {
    const { data: userData } = await db.auth.admin.getUserById(period.signed_off_by)
    signedOffByEmail = userData.user?.email ?? period.signed_off_by
  }

  // ── 5. Fetch trust transactions for period ────────────────────────────────
  const { data: rawTxns, error: txnErr } = await db
    .from("trust_transactions")
    .select("id, statement_month, transaction_type, direction, amount_cents, description, reference, created_at")
    .eq("org_id", params.orgId)
    .gte("statement_month", period.period_start)
    .lte("statement_month", period.period_end)
    .order("created_at", { ascending: true })

  if (txnErr) {
    console.error("[generateAuditExport] txn query failed:", txnErr.message)
  }

  // ── 6. Fetch prior period for opening balance ─────────────────────────────
  const { data: priorPeriod, error: priorPeriodErr } = await db
    .from("trust_reconciliation_periods")
    .select("ledger_closing_balance_cents")
    .eq("org_id", params.orgId)
    .eq("bank_account_id", period.bank_account_id)
    .eq("status", "signed_off")
    .lt("period_end", period.period_start)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (priorPeriodErr) console.error("[generateAuditExport] prior period query failed:", priorPeriodErr.message)

  const openingBalanceCents = priorPeriod?.ledger_closing_balance_cents ?? 0

  // Build transaction rows with running balance
  let runningBalance = openingBalanceCents
  const transactions: TrustTxnRow[] = (rawTxns ?? []).map(txn => {
    const delta = txn.direction === "credit" ? txn.amount_cents : -txn.amount_cents
    runningBalance += delta
    return {
      id: txn.id,
      date: txn.statement_month ?? txn.created_at,
      transaction_type: txn.transaction_type,
      direction: txn.direction as "credit" | "debit",
      description: txn.description,
      reference: txn.reference ?? null,
      amount_cents: txn.amount_cents,
      running_balance_cents: runningBalance,
    }
  })

  // ── 7. Fetch deposits held at period-end ──────────────────────────────────
  const depositsHeld = await fetchDepositsHeld(db, params.orgId, period.period_end)

  // ── 8. Fetch management fees for period ───────────────────────────────────
  const managementFees = await fetchManagementFees(db, params.orgId, period.period_start, period.period_end)

  // ── 9. Version number (existing exports count + 1) ───────────────────────
  const { count } = await db
    .from("trust_audit_exports")
    .select("id", { count: "exact", head: true })
    .eq("period_id", params.periodId)

  const version = (count ?? 0) + 1

  // ── 10. Build audit data object ───────────────────────────────────────────
  const generatedAt = new Date().toISOString()
  const ffc = org.ppra_ffc_number ?? null

  const auditData: TrustAuditData = {
    orgName: org.name,
    orgTradingAs: org.trading_as ?? null,
    ffc,
    ffcExpiry: org.ppra_ffc_expiry_date ?? null,
    bankName,
    bankAccountMasked,
    periodStart: period.period_start,
    periodEnd: period.period_end,
    bankClosingBalanceCents: period.bank_closing_balance_cents,
    ledgerClosingBalanceCents: period.ledger_closing_balance_cents,
    reconComputedClosingCents: period.recon_computed_closing_cents,
    varianceCents: period.variance_cents,
    varianceAcknowledged: period.variance_acknowledged,
    outstandingItems: (period.outstanding_items ?? []) as OutstandingItem[],
    signedOffAt: period.signed_off_at ?? generatedAt,
    signedOffByEmail,
    signedOffIp: period.signed_off_ip ?? null,
    signedOffNotes: period.signed_off_notes ?? null,
    openingBalanceCents,
    transactions,
    depositsHeld,
    managementFees,
    manifestHash: "pending",
    generatedAt,
  }

  // ── 11. Generate PDF ──────────────────────────────────────────────────────
  const pdfEl = createElement(TrustAuditPdf, { d: auditData })
  const pdfBuffer = Buffer.from(
    await renderToBuffer(pdfEl as unknown as Parameters<typeof renderToBuffer>[0])
  )

  // ── 12. Generate XLSX ─────────────────────────────────────────────────────
  const xlsxBuffer = await buildXlsx(auditData)

  // ── 13. Compute manifest hash ─────────────────────────────────────────────
  const hash = createHash("sha256")
  hash.update(pdfBuffer)
  hash.update(xlsxBuffer)
  hash.update(ffc ?? "")
  hash.update(period.signed_off_at ?? "")
  const manifestHash = hash.digest("hex")

  // Regenerate PDF with real hash
  auditData.manifestHash = manifestHash
  const pdfElFinal = createElement(TrustAuditPdf, { d: auditData })
  const pdfBufferFinal = Buffer.from(
    await renderToBuffer(pdfElFinal as unknown as Parameters<typeof renderToBuffer>[0])
  )

  // ── 14. Upload to storage ─────────────────────────────────────────────────
  const basePath = `${params.orgId}/${params.periodId}/export-v${version}`
  const pdfPath = `${basePath}.pdf`
  const xlsxPath = `${basePath}.xlsx`

  const { error: pdfUploadErr } = await db.storage
    .from("trust-audit-exports")
    .upload(pdfPath, pdfBufferFinal, { contentType: "application/pdf", upsert: false })

  if (pdfUploadErr) {
    throw new Error(`[generateAuditExport] PDF upload failed: ${pdfUploadErr.message}`)
  }

  const { error: xlsxUploadErr } = await db.storage
    .from("trust-audit-exports")
    .upload(xlsxPath, xlsxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    })

  if (xlsxUploadErr) {
    throw new Error(`[generateAuditExport] XLSX upload failed: ${xlsxUploadErr.message}`)
  }

  // ── 15. Insert trust_audit_exports row ────────────────────────────────────
  const { data: exportRow, error: exportErr } = await db
    .from("trust_audit_exports")
    .insert({
      org_id:               params.orgId,
      period_id:            params.periodId,
      pdf_storage_path:     pdfPath,
      xlsx_storage_path:    xlsxPath,
      manifest_hash:        manifestHash,
      ffc_at_generation:    ffc ?? "",
      generated_by:         params.userId,
      generated_at:         generatedAt,
      regeneration_reason:  params.regenerationReason ?? null,
    })
    .select("id")
    .single()

  if (exportErr || !exportRow) {
    throw new Error(`[generateAuditExport] export insert failed: ${exportErr?.message ?? "unknown"}`)
  }

  // ── 16. Update period's audit_export_id (first generation only) ───────────
  if (!params.regenerationReason) {
    const { error: periodUpdateErr } = await db
      .from("trust_reconciliation_periods")
      .update({ audit_export_id: exportRow.id })
      .eq("id", params.periodId)
      .eq("org_id", params.orgId)

    if (periodUpdateErr) {
      console.error("[generateAuditExport] period audit_export_id update failed:", periodUpdateErr.message)
    }
  }

  return { exportId: exportRow.id }
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function maskAccount(num: string | null | undefined): string {
  if (!num || num.length < 4) return num ?? "—"
  return `****${num.slice(-4)}`
}

async function fetchDepositsHeld(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  periodEnd: string,
): Promise<DepositHeldRow[]> {
  // Sum deposit_transactions per lease up to period-end
  const { data: txns, error } = await db
    .from("deposit_transactions")
    .select("lease_id, tenant_id, direction, amount_cents, transaction_type")
    .eq("org_id", orgId)
    .lte("created_at", `${periodEnd}T23:59:59Z`)

  if (error) {
    console.error("[generateAuditExport] deposit_transactions query failed:", error.message)
    return []
  }

  // Aggregate net balance per lease
  const byLease = new Map<string, { tenantId: string; held: number; interest: number }>()
  for (const txn of txns ?? []) {
    const cur = byLease.get(txn.lease_id) ?? { tenantId: txn.tenant_id, held: 0, interest: 0 }
    const delta = txn.direction === "credit" ? txn.amount_cents : -txn.amount_cents
    const interestDelta = txn.transaction_type === "interest_accrued" ? txn.amount_cents : 0
    byLease.set(txn.lease_id, {
      tenantId: txn.tenant_id,
      held: cur.held + delta,
      interest: cur.interest + interestDelta,
    })
  }

  const activeLeaseIds = [...byLease.entries()]
    .filter(([, v]) => v.held > 0)
    .map(([id]) => id)

  if (activeLeaseIds.length === 0) return []

  // Fetch leases for property + date
  const { data: leases, error: leaseErr } = await db
    .from("leases")
    .select("id, start_date, property_id, tenant_id")
    .in("id", activeLeaseIds)

  if (leaseErr) {
    console.error("[generateAuditExport] leases query failed:", leaseErr.message)
    return []
  }

  const propertyIds = [...new Set((leases ?? []).map(l => l.property_id).filter(Boolean))]
  const tenantIds = [...new Set((leases ?? []).map(l => l.tenant_id).filter(Boolean))]

  // Fetch properties
  const { data: properties, error: propertiesErr } = await db
    .from("properties")
    .select("id, address_line1, suburb")
    .in("id", propertyIds)
  if (propertiesErr) console.error("[generateAuditExport] deposit properties query failed:", propertiesErr.message)

  const propMap = new Map((properties ?? []).map(p => [p.id, p]))

  // Fetch tenants → contacts for names
  const { data: tenants, error: tenantsErr } = await db
    .from("tenants")
    .select("id, contact_id")
    .in("id", tenantIds)
  if (tenantsErr) console.error("[generateAuditExport] tenants query failed:", tenantsErr.message)

  const contactIds = [...new Set((tenants ?? []).map(t => t.contact_id).filter(Boolean))]
  const tenantContactMap = new Map((tenants ?? []).map(t => [t.id, t.contact_id]))

  const { data: contacts, error: contactsErr } = await db
    .from("contacts")
    .select("id, first_name, last_name, company_name")
    .in("id", contactIds)
  if (contactsErr) console.error("[generateAuditExport] contacts query failed:", contactsErr.message)

  const contactNameMap = new Map((contacts ?? []).map(c =>
    [c.id, c.company_name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null]))

  return (leases ?? [])
    .map(lease => {
      const bal = byLease.get(lease.id)
      if (!bal || bal.held <= 0) return null

      const prop = propMap.get(lease.property_id ?? "")
      const propertyLabel = prop
        ? [prop.address_line1, prop.suburb].filter(Boolean).join(", ")
        : "Unknown property"

      const contactId = tenantContactMap.get(lease.tenant_id ?? "")
      const tenantName = contactId ? (contactNameMap.get(contactId) ?? "Unknown tenant") : "Unknown tenant"

      return {
        leaseId: lease.id,
        tenantName,
        leaseStart: lease.start_date ?? "",
        propertyLabel,
        depositHeldCents: bal.held,
        interestAccruedCents: bal.interest,
      } satisfies DepositHeldRow
    })
    .filter((r): r is DepositHeldRow => r !== null)
}

async function fetchManagementFees(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ManagementFeeRow[]> {
  const { data: fees, error } = await db
    .from("management_fee_invoices")
    .select("id, property_id, period_month, fee_amount_cents, vat_amount_cents, total_cents")
    .eq("org_id", orgId)
    .gte("period_month", periodStart)
    .lte("period_month", periodEnd)
    .order("period_month", { ascending: true })

  if (error) {
    console.error("[generateAuditExport] management_fee_invoices query failed:", error.message)
    return []
  }

  if (!fees || fees.length === 0) return []

  const propertyIds = [...new Set(fees.map(f => f.property_id).filter(Boolean))]
  const { data: properties, error: propertiesErr } = await db
    .from("properties")
    .select("id, address_line1, suburb")
    .in("id", propertyIds)
  if (propertiesErr) console.error("[generateAuditExport] fee properties query failed:", propertiesErr.message)

  const propMap = new Map((properties ?? []).map(p => [p.id, p]))

  return fees.map(fee => {
    const prop = propMap.get(fee.property_id ?? "")
    const propertyLabel = prop
      ? [prop.address_line1, prop.suburb].filter(Boolean).join(", ")
      : "Unknown property"
    const periodMonth = fee.period_month
      ? fmtZA(fee.period_month, { month: "long", year: "numeric" })
      : ""

    return {
      id: fee.id,
      propertyLabel,
      periodMonth,
      feeAmountCents: fee.fee_amount_cents,
      vatCents: fee.vat_amount_cents ?? 0,
      totalCents: fee.total_cents,
    } satisfies ManagementFeeRow
  })
}

// ─── XLSX builder ─────────────────────────────────────────────────────────────

async function buildXlsx(d: TrustAuditData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "Pleks"
  wb.created = new Date()

  // Sheet 1: Transactions
  const ws1 = wb.addWorksheet("Transactions")
  ws1.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Type", key: "type", width: 22 },
    { header: "Direction", key: "dir", width: 10 },
    { header: "Description", key: "desc", width: 40 },
    { header: "Reference", key: "ref", width: 18 },
    { header: "Amount (R)", key: "amount", width: 14 },
    { header: "Running balance (R)", key: "balance", width: 20 },
  ]
  ws1.getRow(1).font = { bold: true }

  for (const txn of d.transactions) {
    const sign = txn.direction === "debit" ? -1 : 1
    ws1.addRow({
      date: txn.date ? new Date(txn.date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) : "",
      type: txn.transaction_type.replaceAll("_", " "),
      dir: txn.direction.toUpperCase(),
      desc: txn.description,
      ref: txn.reference ?? "",
      amount: (sign * txn.amount_cents) / 100,
      balance: txn.running_balance_cents / 100,
    })
  }

  // Sheet 2: Deposits held
  const ws2 = wb.addWorksheet("Deposits Held")
  ws2.columns = [
    { header: "Tenant", key: "tenant", width: 28 },
    { header: "Property", key: "property", width: 36 },
    { header: "Lease start", key: "leaseStart", width: 14 },
    { header: "Deposit held (R)", key: "deposit", width: 18 },
    { header: "Interest accrued (R)", key: "interest", width: 20 },
    { header: "Total (R)", key: "total", width: 14 },
  ]
  ws2.getRow(1).font = { bold: true }

  for (const dep of d.depositsHeld) {
    ws2.addRow({
      tenant: dep.tenantName,
      property: dep.propertyLabel,
      leaseStart: dep.leaseStart ? new Date(dep.leaseStart).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) : "",
      deposit: dep.depositHeldCents / 100,
      interest: dep.interestAccruedCents / 100,
      total: (dep.depositHeldCents + dep.interestAccruedCents) / 100,
    })
  }

  // Sheet 3: Reconciliation summary
  const ws3 = wb.addWorksheet("Reconciliation")
  const addKV = (label: string, value: string | number) => {
    const row = ws3.addRow([label, value])
    row.getCell(1).font = { bold: true }
  }

  addKV("Period", `${d.periodStart} to ${d.periodEnd}`)
  addKV("Agency", d.orgName)
  addKV("PPRA FFC", d.ffc ?? "—")
  addKV("Bank account", `${d.bankName} ${d.bankAccountMasked}`)
  ws3.addRow([])
  addKV("Opening balance (R)", d.openingBalanceCents / 100)
  addKV("Bank closing balance (R)", d.bankClosingBalanceCents / 100)
  addKV("Ledger closing balance (R)", d.ledgerClosingBalanceCents / 100)
  addKV("Recon-computed closing (R)", d.reconComputedClosingCents / 100)
  addKV("Variance (R)", d.varianceCents / 100)
  addKV("Variance acknowledged", d.varianceAcknowledged ? "Yes" : "No")
  ws3.addRow([])
  addKV("Signed off by", d.signedOffByEmail)
  addKV("Signed off at", new Date(d.signedOffAt).toLocaleString("en-ZA", { timeZone: SA_TIMEZONE }))
  addKV("IP address", d.signedOffIp ?? "—")
  ws3.addRow([])
  addKV("Manifest hash (SHA-256)", d.manifestHash)
  addKV("Generated at", new Date(d.generatedAt).toLocaleString("en-ZA", { timeZone: SA_TIMEZONE }))
  addKV("Generated by Pleks", "Pleks is not the trustee.")

  ws3.getColumn(1).width = 30
  ws3.getColumn(2).width = 50

  const rawBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(rawBuffer)
}
