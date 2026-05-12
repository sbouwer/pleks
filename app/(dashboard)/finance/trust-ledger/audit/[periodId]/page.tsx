/**
 * app/(dashboard)/finance/trust-ledger/audit/[periodId]/page.tsx — Signed-off period audit view
 *
 * Route:  /finance/trust-ledger/audit/[periodId]
 * Auth:   gatewaySSR (dashboard layout guards the route)
 * Data:   trust_reconciliation_periods + trust_audit_exports + bank_accounts via service-role
 * Notes:  Read-only. Export generation wired in Phase 3 (lib/trust/audit-export.ts).
 */

import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { formatZAR } from "@/lib/constants"
import { InlineLink } from "@/components/ui/actions"
import { CheckCircle2, FileText, AlertTriangle } from "lucide-react"
import type { OutstandingItem } from "@/lib/trust/close"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

function formatPeriod(start: string, _end: string) {
  return new Date(start).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
}

function maskAccount(num: string | null | undefined) {
  if (!num || num.length < 4) return num ?? "—"
  return "****" + num.slice(-4)
}

export default async function TrustAuditPage({ params }: { params: Promise<{ periodId: string }> }) {
  const { periodId } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: period, error: periodErr } = await db
    .from("trust_reconciliation_periods")
    .select("*")
    .eq("id", periodId)
    .eq("org_id", orgId)
    .single()

  if (periodErr || !period) redirect("/finance/trust-ledger")

  const [bankAcctResult, exportsResult] = await Promise.all([
    db.from("bank_accounts")
      .select("bank_name, account_number")
      .eq("id", period.bank_account_id)
      .single(),
    db.from("trust_audit_exports")
      .select("id, pdf_storage_path, csv_storage_path, manifest_hash, generated_at, generated_by, regeneration_reason")
      .eq("period_id", periodId)
      .eq("org_id", orgId)
      .order("generated_at", { ascending: false }),
  ])
  const bankAccount = bankAcctResult.data
  const auditExports = exportsResult.data

  const periodLabel = formatPeriod(period.period_start, period.period_end)
  const outstandingItems = (period.outstanding_items ?? []) as OutstandingItem[]
  const varianceSign = period.variance_cents > 0 ? "+" : "–"
  const varianceLabel = period.variance_cents === 0
    ? formatZAR(0)
    : varianceSign + formatZAR(Math.abs(period.variance_cents))

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <div className="mb-2"><InlineLink href="/finance/trust-ledger">← Trust Account Ledger</InlineLink></div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl">Trust reconciliation — {periodLabel}</h1>
            {bankAccount && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {bankAccount.bank_name} {maskAccount(bankAccount.account_number)}
              </p>
            )}
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            period.status === "signed_off"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}>
            {period.status === "signed_off" ? "Signed off" : period.status}
          </span>
        </div>
      </div>

      {/* Three-balance summary */}
      <div className="rounded-xl border bg-card divide-y">
        <div className="flex items-center justify-between px-5 py-3.5 text-sm">
          <span className="text-muted-foreground">Bank statement closing</span>
          <span className="font-mono font-medium tabular-nums">{formatZAR(period.bank_closing_balance_cents)}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 text-sm">
          <span className="text-muted-foreground">Pleks ledger closing</span>
          <span className="font-mono font-medium tabular-nums">{formatZAR(period.ledger_closing_balance_cents)}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 text-sm">
          <span className="text-muted-foreground">Recon-computed closing</span>
          <span className="font-mono font-medium tabular-nums">{formatZAR(period.recon_computed_closing_cents)}</span>
        </div>
        <div className="flex items-center justify-between px-5 py-3 bg-muted/30">
          <span className="text-sm font-medium">Variance</span>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm font-semibold tabular-nums ${period.variance_cents !== 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {varianceLabel}
            </span>
            {period.variance_cents === 0
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />}
          </div>
        </div>
      </div>

      {/* Variance acknowledgement note */}
      {period.variance_cents !== 0 && period.variance_acknowledged && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Variance acknowledged at sign-off</p>
          {period.signed_off_notes && <p className="mt-1 text-xs whitespace-pre-wrap">{period.signed_off_notes}</p>}
        </div>
      )}

      {/* Outstanding items */}
      {outstandingItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Outstanding items at period-end ({outstandingItems.length})</h2>
          <div className="rounded-xl border bg-card divide-y">
            {outstandingItems.map((item, i) => (
              <div key={i} className="px-4 py-3 text-sm">
                <p className="font-medium">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  {item.item_type.replace(/_/g, " ")} · {formatZAR(item.amount_cents)} · expected {item.expected_clear_date}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sign-off details */}
      {period.signed_off_at && (
        <div className="rounded-xl border bg-card px-5 py-4 space-y-2">
          <h2 className="text-sm font-semibold">Sign-off record</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatDate(period.signed_off_at)}</dd>
            <dt className="text-muted-foreground">IP address</dt>
            <dd className="font-mono text-xs">{period.signed_off_ip ?? "—"}</dd>
            {period.signed_off_notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{period.signed_off_notes}</dd>
              </>
            )}
          </dl>
        </div>
      )}

      {/* Audit exports */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Audit exports</h2>
        </div>

        {!auditExports || auditExports.length === 0 ? (
          <div className="rounded-xl border bg-card px-5 py-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No audit export generated yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Audit export generation will be available in a future release.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card divide-y">
            {auditExports.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {exp.regeneration_reason ? "Regenerated export" : "Audit export"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(exp.generated_at)}
                    {exp.regeneration_reason && ` · ${exp.regeneration_reason}`}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    Hash: {exp.manifest_hash.slice(0, 16)}…
                  </p>
                </div>
                <div className="flex gap-2">
                  <InlineLink href={`/api/trust/audit-export/${exp.id}/pdf`}>PDF</InlineLink>
                  <InlineLink href={`/api/trust/audit-export/${exp.id}/xlsx`}>XLSX</InlineLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sovereign notice */}
      <p className="text-xs text-muted-foreground border-t pt-4">
        This document was generated by Pleks. Pleks is a trust account management platform. Pleks is not the trustee.
      </p>
    </div>
  )
}
