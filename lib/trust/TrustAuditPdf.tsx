/**
 * lib/trust/TrustAuditPdf.tsx — EAAB/PPRA trust audit export PDF component
 *
 * Data:   TrustAuditData passed as props from lib/trust/audit-export.ts
 * Notes:  Server-side only — rendered via renderToBuffer. Helvetica (WinAnsiEncoding)
 *         throughout; all strings must be sanitised before rendering.
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"
import type { OutstandingItem } from "@/lib/trust/close"

// ─── Shared data types ────────────────────────────────────────────────────────

export interface TrustTxnRow {
  id: string
  date: string
  transaction_type: string
  direction: "credit" | "debit"
  description: string
  reference: string | null
  amount_cents: number
  running_balance_cents: number
}

export interface DepositHeldRow {
  leaseId: string
  tenantName: string
  leaseStart: string
  propertyLabel: string
  depositHeldCents: number
  interestAccruedCents: number
}

export interface ManagementFeeRow {
  id: string
  propertyLabel: string
  periodMonth: string
  feeAmountCents: number
  vatCents: number
  totalCents: number
}

export interface TrustAuditData {
  orgName: string
  orgTradingAs: string | null
  ffc: string | null
  ffcExpiry: string | null
  bankName: string
  bankAccountMasked: string
  periodStart: string
  periodEnd: string
  bankClosingBalanceCents: number
  ledgerClosingBalanceCents: number
  reconComputedClosingCents: number
  varianceCents: number
  varianceAcknowledged: boolean
  outstandingItems: OutstandingItem[]
  signedOffAt: string
  signedOffByEmail: string
  signedOffIp: string | null
  signedOffNotes: string | null
  openingBalanceCents: number
  transactions: TrustTxnRow[]
  depositsHeld: DepositHeldRow[]
  managementFees: ManagementFeeRow[]
  manifestHash: string
  generatedAt: string
}

interface Totals {
  credits: number
  debits: number
  depositsHeld: number
  interest: number
  mgmtFees: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sp(s: string | null | undefined): string {
  if (!s) return ""
  return s
    .replaceAll("—", "-").replaceAll("–", "-")
    .replaceAll("‘", "'").replaceAll("’", "'")
    .replaceAll("“", '"').replaceAll("”", '"')
    .replaceAll("…", "...").replaceAll(" ", " ")
    .replaceAll(/[^\x20-\xFF]/g, "")
}

function fmtZAR(cents: number): string {
  const formatted = (Math.abs(cents) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return cents < 0 ? `-R ${formatted}` : `R ${formatted}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function fmtPeriod(start: string): string {
  return new Date(start).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
}

function fmtTxnType(t: string): string {
  return t.replaceAll("_", " ").replaceAll(/\b\w/g, c => c.toUpperCase())
}

function computeTotals(d: TrustAuditData): Totals {
  return {
    credits:      d.transactions.filter(t => t.direction === "credit").reduce((s, t) => s + t.amount_cents, 0),
    debits:       d.transactions.filter(t => t.direction === "debit").reduce((s, t) => s + t.amount_cents, 0),
    depositsHeld: d.depositsHeld.reduce((s, r) => s + r.depositHeldCents, 0),
    interest:     d.depositsHeld.reduce((s, r) => s + r.interestAccruedCents, 0),
    mgmtFees:     d.managementFees.reduce((s, r) => s + r.totalCents, 0),
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:        { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  h2:          { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 16, color: "#1a3a5c" },
  h3:          { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 12 },
  label:       { color: "#666", minWidth: 160, fontFamily: "Helvetica-Bold", fontSize: 8 },
  value:       { flex: 1, fontSize: 9 },
  metaRow:     { flexDirection: "row", marginBottom: 4 },
  divider:     { borderBottomWidth: 1, borderBottomColor: "#e0e0e0", marginVertical: 8 },
  tableHead:   { flexDirection: "row", backgroundColor: "#f0f4f8", paddingHorizontal: 6, paddingVertical: 4, marginBottom: 2 },
  tableRow:    { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  tableRowAlt: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eee", backgroundColor: "#fafafa" },
  sumRow:      { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  sumTotal:    { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1.5, borderTopColor: "#333", marginTop: 4 },
  thBold:      { fontFamily: "Helvetica-Bold", fontSize: 8 },
  warning:     { backgroundColor: "#fff8e7", padding: 8, borderRadius: 4, borderLeftWidth: 3, borderLeftColor: "#f59e0b", marginTop: 8 },
  legend:      { marginTop: 16, padding: 10, backgroundColor: "#f0f7ff", borderRadius: 4, fontSize: 8, color: "#1a3a5c", lineHeight: 1.6 },
  footer:      { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#999" },
})

// ─── Primitives ───────────────────────────────────────────────────────────────

function Footer({ orgName, page }: Readonly<{ orgName: string; page: number }>) {
  return (
    <View style={S.footer}>
      <Text>{sp(orgName)} — Trust Audit Export</Text>
      <Text>Page {page}</Text>
    </View>
  )
}

function MetaRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <View style={S.metaRow}>
      <Text style={S.label}>{label}</Text>
      <Text style={S.value}>{value}</Text>
    </View>
  )
}

function SumRow({ label, value, bold }: Readonly<{ label: string; value: string; bold?: boolean }>) {
  const rowStyle = bold ? S.sumTotal : S.sumRow
  const textStyle = bold ? S.thBold : undefined
  return (
    <View style={rowStyle}>
      <Text style={textStyle}>{sp(label)}</Text>
      <Text style={textStyle}>{sp(value)}</Text>
    </View>
  )
}

function OutstandingItemsList({ items }: Readonly<{ items: OutstandingItem[] }>) {
  if (items.length === 0) return null
  return (
    <>
      <Text style={S.h3}>Outstanding items at period-end ({items.length})</Text>
      {items.map((item, i) => {
        const rowStyle = i % 2 === 0 ? S.tableRow : S.tableRowAlt
        const itemKey = `${item.description}-${item.expected_clear_date}`
        return (
          <View key={itemKey} style={rowStyle}>
            <Text style={{ flex: 1, fontSize: 8 }}>{sp(item.description)}</Text>
            <Text style={{ width: 120, fontSize: 8, color: "#666" }}>
              {sp(item.item_type.replaceAll("_", " "))}
            </Text>
            <Text style={{ width: 80, fontSize: 8, textAlign: "right" }}>
              {fmtZAR(item.amount_cents)}
            </Text>
            <Text style={{ width: 90, fontSize: 8, textAlign: "right", color: "#666" }}>
              exp {sp(item.expected_clear_date)}
            </Text>
          </View>
        )
      })}
    </>
  )
}

// ─── Page sub-components ──────────────────────────────────────────────────────

function CoverPage({ d, periodLabel, displayName }: Readonly<{ d: TrustAuditData; periodLabel: string; displayName: string }>) {
  return (
    <Page size="A4" style={S.page}>
      <Text style={{ fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>{displayName}</Text>
      <Text style={{ fontSize: 12, color: "#444", marginBottom: 24 }}>
        Trust Account Audit Export — {sp(periodLabel)}
      </Text>

      <MetaRow label="Agency name" value={sp(d.orgName)} />
      <MetaRow label="PPRA FFC number" value={sp(d.ffc) || "—"} />
      <MetaRow label="FFC expiry" value={d.ffcExpiry ? fmtDate(d.ffcExpiry) : "—"} />
      <MetaRow label="Trust account" value={`${sp(d.bankName)} ${sp(d.bankAccountMasked)}`} />
      <MetaRow label="Period covered" value={`${fmtDate(d.periodStart)} to ${fmtDate(d.periodEnd)}`} />

      <View style={[S.divider, { marginTop: 20 }]} />
      <Text style={S.h3}>Sign-off record</Text>
      <MetaRow label="Signed off by" value={sp(d.signedOffByEmail)} />
      <MetaRow label="Date" value={fmtDate(d.signedOffAt)} />
      <MetaRow label="IP address" value={sp(d.signedOffIp) || "—"} />
      {d.signedOffNotes ? <MetaRow label="Notes" value={sp(d.signedOffNotes)} /> : null}

      <View style={S.divider} />
      <Text style={S.h3}>Document integrity</Text>
      <MetaRow label="Generated at" value={new Date(d.generatedAt).toLocaleString("en-ZA")} />
      <MetaRow label="Manifest hash (SHA-256)" value={d.manifestHash} />

      <View style={S.legend}>
        <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Important notice</Text>
        <Text>
          This document was generated by Pleks. Pleks is a trust account management platform.
          Pleks is not the trustee. The trustee is {displayName}. All trust funds are held in
          the agency{"'"}s own Section 86 trust account. Pleks does not hold, custody, or
          control any client funds.
        </Text>
      </View>

      <Footer orgName={d.orgName} page={1} />
    </Page>
  )
}

function SummaryPage({ d, totals, periodLabel }: Readonly<{ d: TrustAuditData; totals: Totals; periodLabel: string }>) {
  const varianceLabel = d.varianceCents === 0 ? "Variance (none)" : "Variance"
  const ackLabel = d.varianceAcknowledged ? "Variance acknowledged at sign-off" : "Unacknowledged variance"

  return (
    <Page size="A4" style={S.page}>
      <Text style={S.h2}>RECONCILIATION SUMMARY — {sp(periodLabel.toUpperCase())}</Text>

      <Text style={S.h3}>Balance movements</Text>
      <SumRow label="Opening balance" value={fmtZAR(d.openingBalanceCents)} />
      <SumRow label="Total credits (money in)" value={fmtZAR(totals.credits)} />
      <SumRow label="Total debits (money out)" value={fmtZAR(totals.debits)} />
      <SumRow label="Ledger closing balance" value={fmtZAR(d.ledgerClosingBalanceCents)} bold />

      <Text style={S.h3}>Three-balance comparison</Text>
      <SumRow label="Bank statement closing balance" value={fmtZAR(d.bankClosingBalanceCents)} />
      <SumRow label="Pleks ledger closing balance" value={fmtZAR(d.ledgerClosingBalanceCents)} />
      <SumRow label="Recon-computed closing balance" value={fmtZAR(d.reconComputedClosingCents)} />
      <SumRow label={varianceLabel} value={fmtZAR(d.varianceCents)} bold />

      {d.varianceCents === 0 ? null : (
        <View style={S.warning}>
          <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>{ackLabel}</Text>
          {d.signedOffNotes ? <Text>{sp(d.signedOffNotes)}</Text> : null}
        </View>
      )}

      <OutstandingItemsList items={d.outstandingItems} />

      <Text style={S.h3}>Period summary</Text>
      <SumRow label="Transactions in period" value={String(d.transactions.length)} />
      <SumRow label="Deposits held at period-end" value={fmtZAR(totals.depositsHeld + totals.interest)} />
      <SumRow label="Management fees extracted" value={fmtZAR(totals.mgmtFees)} />

      <Footer orgName={d.orgName} page={2} />
    </Page>
  )
}

function TransactionPage({ d, periodLabel }: Readonly<{ d: TrustAuditData; periodLabel: string }>) {
  return (
    <Page size="A4" style={S.page}>
      <Text style={S.h2}>TRANSACTION REGISTER</Text>
      <Text style={{ fontSize: 8, color: "#666", marginBottom: 8 }}>
        All trust transactions for {sp(periodLabel)} in chronological order
      </Text>

      <View style={S.tableHead}>
        <Text style={[S.thBold, { width: 70 }]}>Date</Text>
        <Text style={[S.thBold, { width: 95 }]}>Type</Text>
        <Text style={[S.thBold, { width: 35 }]}>Dir.</Text>
        <Text style={[S.thBold, { flex: 1 }]}>Description</Text>
        <Text style={[S.thBold, { width: 80, textAlign: "right" }]}>Amount</Text>
        <Text style={[S.thBold, { width: 80, textAlign: "right" }]}>Balance</Text>
      </View>

      {d.transactions.length === 0
        ? (
          <View style={S.tableRow}>
            <Text style={{ color: "#666", fontSize: 8 }}>No transactions recorded for this period.</Text>
          </View>
        )
        : d.transactions.map((txn, i) => {
          const rowStyle = i % 2 === 0 ? S.tableRow : S.tableRowAlt
          const amountColor = txn.direction === "credit" ? "#166534" : "#991b1b"
          const dirLabel = txn.direction === "credit" ? "CR" : "DR"
          const amountPrefix = txn.direction === "debit" ? "-" : ""
          return (
            <View key={txn.id} style={rowStyle} wrap={false}>
              <Text style={{ width: 70, fontSize: 8 }}>{sp(txn.date ? fmtDate(txn.date) : "")}</Text>
              <Text style={{ width: 95, fontSize: 8 }}>{sp(fmtTxnType(txn.transaction_type))}</Text>
              <Text style={{ width: 35, fontSize: 8, color: amountColor }}>{dirLabel}</Text>
              <Text style={{ flex: 1, fontSize: 8 }}>{sp(txn.description)}</Text>
              <Text style={{ width: 80, fontSize: 8, textAlign: "right", color: amountColor }}>
                {amountPrefix}{fmtZAR(txn.amount_cents)}
              </Text>
              <Text style={{ width: 80, fontSize: 8, textAlign: "right" }}>
                {fmtZAR(txn.running_balance_cents)}
              </Text>
            </View>
          )
        })}

      <Footer orgName={d.orgName} page={3} />
    </Page>
  )
}

function DepositsPage({ d, totals }: Readonly<{ d: TrustAuditData; totals: Totals }>) {
  return (
    <Page size="A4" style={S.page}>
      <Text style={S.h2}>DEPOSITS HELD AT PERIOD-END</Text>
      <Text style={{ fontSize: 8, color: "#666", marginBottom: 8 }}>
        Per-tenant deposit holdings as at {fmtDate(d.periodEnd)}.
        Total held: {fmtZAR(totals.depositsHeld + totals.interest)}
      </Text>

      <View style={S.tableHead}>
        <Text style={[S.thBold, { flex: 1 }]}>Tenant</Text>
        <Text style={[S.thBold, { width: 100 }]}>Property</Text>
        <Text style={[S.thBold, { width: 70 }]}>Lease start</Text>
        <Text style={[S.thBold, { width: 75, textAlign: "right" }]}>Deposit</Text>
        <Text style={[S.thBold, { width: 65, textAlign: "right" }]}>Interest</Text>
        <Text style={[S.thBold, { width: 75, textAlign: "right" }]}>Total</Text>
      </View>

      {d.depositsHeld.map((dep, i) => {
        const rowStyle = i % 2 === 0 ? S.tableRow : S.tableRowAlt
        return (
          <View key={dep.leaseId} style={rowStyle} wrap={false}>
            <Text style={{ flex: 1, fontSize: 8 }}>{sp(dep.tenantName)}</Text>
            <Text style={{ width: 100, fontSize: 8 }}>{sp(dep.propertyLabel)}</Text>
            <Text style={{ width: 70, fontSize: 8 }}>{sp(dep.leaseStart ? fmtDate(dep.leaseStart) : "")}</Text>
            <Text style={{ width: 75, fontSize: 8, textAlign: "right" }}>{fmtZAR(dep.depositHeldCents)}</Text>
            <Text style={{ width: 65, fontSize: 8, textAlign: "right" }}>{fmtZAR(dep.interestAccruedCents)}</Text>
            <Text style={{ width: 75, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
              {fmtZAR(dep.depositHeldCents + dep.interestAccruedCents)}
            </Text>
          </View>
        )
      })}

      <View style={S.sumTotal}>
        <Text style={[S.thBold, { flex: 1 }]}>Total</Text>
        <Text style={{ width: 100, fontSize: 8 }} />
        <Text style={{ width: 70, fontSize: 8 }} />
        <Text style={[S.thBold, { width: 75, textAlign: "right" }]}>{fmtZAR(totals.depositsHeld)}</Text>
        <Text style={[S.thBold, { width: 65, textAlign: "right" }]}>{fmtZAR(totals.interest)}</Text>
        <Text style={[S.thBold, { width: 75, textAlign: "right" }]}>{fmtZAR(totals.depositsHeld + totals.interest)}</Text>
      </View>

      <Footer orgName={d.orgName} page={4} />
    </Page>
  )
}

function FeesPage({ d, totals, pageNum }: Readonly<{ d: TrustAuditData; totals: Totals; pageNum: number }>) {
  return (
    <Page size="A4" style={S.page}>
      <Text style={S.h2}>MANAGEMENT FEES EXTRACTED</Text>

      <View style={S.tableHead}>
        <Text style={[S.thBold, { flex: 1 }]}>Property</Text>
        <Text style={[S.thBold, { width: 80 }]}>Period</Text>
        <Text style={[S.thBold, { width: 80, textAlign: "right" }]}>Fee</Text>
        <Text style={[S.thBold, { width: 60, textAlign: "right" }]}>VAT</Text>
        <Text style={[S.thBold, { width: 80, textAlign: "right" }]}>Total</Text>
      </View>

      {d.managementFees.map((fee, i) => {
        const rowStyle = i % 2 === 0 ? S.tableRow : S.tableRowAlt
        return (
          <View key={fee.id} style={rowStyle} wrap={false}>
            <Text style={{ flex: 1, fontSize: 8 }}>{sp(fee.propertyLabel)}</Text>
            <Text style={{ width: 80, fontSize: 8 }}>{sp(fee.periodMonth)}</Text>
            <Text style={{ width: 80, fontSize: 8, textAlign: "right" }}>{fmtZAR(fee.feeAmountCents)}</Text>
            <Text style={{ width: 60, fontSize: 8, textAlign: "right" }}>{fmtZAR(fee.vatCents)}</Text>
            <Text style={{ width: 80, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
              {fmtZAR(fee.totalCents)}
            </Text>
          </View>
        )
      })}

      <View style={S.sumTotal}>
        <Text style={[S.thBold, { flex: 1 }]}>Total</Text>
        <Text style={{ width: 80, fontSize: 8 }} />
        <Text style={{ width: 80, fontSize: 8 }} />
        <Text style={{ width: 60, fontSize: 8 }} />
        <Text style={[S.thBold, { width: 80, textAlign: "right" }]}>{fmtZAR(totals.mgmtFees)}</Text>
      </View>

      <Footer orgName={d.orgName} page={pageNum} />
    </Page>
  )
}

function AttestationPage({ d, periodLabel, displayName, pageNum }: Readonly<{
  d: TrustAuditData
  periodLabel: string
  displayName: string
  pageNum: number
}>) {
  return (
    <Page size="A4" style={S.page}>
      <Text style={S.h2}>ATTESTATION</Text>

      <Text style={{ lineHeight: 1.6, marginBottom: 12 }}>
        I, {sp(d.signedOffByEmail)}, hereby certify that the trust account reconciliation
        for {sp(periodLabel)} is accurate and complete to the best of my knowledge.
        All trust transactions for this period have been recorded and reconciled against
        the bank statement for {sp(d.bankName)} {sp(d.bankAccountMasked)}.
      </Text>

      {d.varianceCents === 0 ? null : (
        <Text style={{ lineHeight: 1.6, marginBottom: 12, color: "#92400e" }}>
          A variance of {fmtZAR(d.varianceCents)} was acknowledged at sign-off.
          {d.signedOffNotes ? ` Explanation: ${sp(d.signedOffNotes)}` : ""}
        </Text>
      )}

      <MetaRow label="Signed off by" value={sp(d.signedOffByEmail)} />
      <MetaRow label="Date and time" value={new Date(d.signedOffAt).toLocaleString("en-ZA")} />
      <MetaRow label="IP address" value={sp(d.signedOffIp) || "—"} />

      <View style={[S.divider, { marginTop: 24 }]} />

      <View style={S.legend}>
        <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Document integrity</Text>
        <Text>Generated by Pleks on {new Date(d.generatedAt).toLocaleString("en-ZA")}</Text>
        <Text style={{ fontFamily: "Helvetica-Oblique", marginTop: 2 }}>
          Manifest hash (SHA-256): {d.manifestHash}
        </Text>
        <Text style={{ marginTop: 6 }}>
          Pleks is a trust account management platform. Pleks is not the trustee.
          The trustee is {displayName}. All client funds are held in the agency{"'"}s own
          Section 86 trust account. Pleks does not hold, custody, or control any client funds.
        </Text>
      </View>

      <Footer orgName={d.orgName} page={pageNum} />
    </Page>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TrustAuditPdf({ d }: Readonly<{ d: TrustAuditData }>) {
  const periodLabel = fmtPeriod(d.periodStart)
  const displayName = sp(d.orgTradingAs ?? d.orgName)
  const totals = computeTotals(d)
  const hasDeposits = d.depositsHeld.length > 0
  const hasFees = d.managementFees.length > 0
  const lastPage = 3 + (hasDeposits ? 1 : 0) + (hasFees ? 1 : 0) + 1
  const feesPageNum = hasDeposits ? 5 : 4

  return (
    <Document title={`Trust Audit Export — ${periodLabel}`} author="Pleks">
      <CoverPage d={d} periodLabel={periodLabel} displayName={displayName} />
      <SummaryPage d={d} totals={totals} periodLabel={periodLabel} />
      <TransactionPage d={d} periodLabel={periodLabel} />
      {hasDeposits ? <DepositsPage d={d} totals={totals} /> : null}
      {hasFees ? <FeesPage d={d} totals={totals} pageNum={feesPageNum} /> : null}
      <AttestationPage d={d} periodLabel={periodLabel} displayName={displayName} pageNum={lastPage} />
    </Document>
  )
}
