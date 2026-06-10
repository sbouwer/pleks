/**
 * app/(dashboard)/leases/[leaseId]/deposit/page.tsx — deposit reconciliation detail page
 *
 * Route:  /leases/[leaseId]/deposit
 * Auth:   Supabase session (createClient auth check)
 * Data:   deposit_reconciliations, deposit_deduction_items, deposit_charges, deposit_timers,
 *         deposit_transactions (interest), leases, arrears_cases, rent_invoices via createClient
 * Notes:  ADDENDUM_63B: fetches deposit_charges and suggestion data (open arrears cases,
 *         unpaid invoices) to populate DepositChargesEditor.
 */
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatZAR } from "@/lib/constants"
import { formatDateShort } from "@/lib/reports/periods"
import { DepositActions } from "./DepositActions"
import { DepositChargesEditor } from "./DepositChargesEditor"
import { DamageItemsEditor } from "./DamageItemsEditor"
import type { DepositCharge, ArrearssuggestionItem, InvoiceSuggestionItem } from "./DepositChargesEditor"
import { BackLink } from "@/components/ui/BackLink"

export default async function DepositReconPage({
  params,
}: {
  params: Promise<{ leaseId: string }>
}) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [
    { data: recon },
    { data: items },
    { data: charges },
    { data: timer },
    { data: lease },
    { data: interestTxns },
    { data: arrearsCases },
    { data: openInvoices },
  ] = await Promise.all([
    supabase.from("deposit_reconciliations").select("*").eq("lease_id", leaseId).single(),
    supabase.from("deposit_deduction_items").select("*").eq("lease_id", leaseId).order("created_at"),
    supabase.from("deposit_charges").select("id, charge_type, description, deduction_amount_cents, agent_confirmed, source_arrears_case_id, source_invoice_id, source_supplier_invoice_id, source_municipal_bill_id, source_lease_charge_id, notes").eq("lease_id", leaseId).order("created_at"),
    supabase.from("deposit_timers").select("deadline, status, return_days").eq("lease_id", leaseId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("leases").select("start_date, end_date, lease_type, units(unit_number, properties(name)), tenant_view(first_name, last_name)").eq("id", leaseId).single(),
    supabase.from("deposit_transactions").select("id, created_at, amount_cents, effective_rate_percent, description").eq("lease_id", leaseId).eq("transaction_type", "interest_accrued").order("created_at", { ascending: true }),
    // Suggestions: open arrears cases for this lease
    supabase.from("arrears_cases").select("id, total_arrears_cents").eq("lease_id", leaseId).neq("status", "resolved").gt("total_arrears_cents", 0),
    // Suggestions: open/partial/overdue rent invoices not yet fully paid
    supabase.from("rent_invoices").select("id, invoice_number, balance_cents, due_date").eq("lease_id", leaseId).in("status", ["open", "partial", "overdue"]).gt("balance_cents", 0),
  ])

  const unit = lease?.units as unknown as { unit_number: string; properties: { name: string } | null } | null
  const tenant = lease?.tenant_view as unknown as { first_name: string; last_name: string } | null
  const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}` : "Tenant"
  const propertyName = `${unit?.unit_number ?? ""}, ${unit?.properties?.name ?? ""}`

  const allItems = items ?? []
  const damageItems    = allItems.filter((i) => i.classification === "tenant_damage")
  const wearItems      = allItems.filter((i) => i.classification === "wear_and_tear" || i.classification === "pre_existing")
  const disputedItems  = allItems.filter((i) => i.tenant_disputed)

  const chargeList: DepositCharge[] = (charges ?? []).map((c) => ({
    id:                        c.id as string,
    charge_type:               c.charge_type as string,
    description:               c.description as string,
    deduction_amount_cents:    c.deduction_amount_cents as number,
    agent_confirmed:           c.agent_confirmed as boolean,
    source_arrears_case_id:    c.source_arrears_case_id as string | null,
    source_invoice_id:         c.source_invoice_id as string | null,
    source_supplier_invoice_id: c.source_supplier_invoice_id as string | null,
    source_municipal_bill_id:  c.source_municipal_bill_id as string | null,
    source_lease_charge_id:    c.source_lease_charge_id as string | null,
    notes:                     c.notes as string | null,
  }))

  // Build discovery suggestions — exclude arrears cases already linked to a charge
  const linkedArrearsCaseIds = new Set(chargeList.map((c) => c.source_arrears_case_id).filter(Boolean))
  const linkedInvoiceIds     = new Set(chargeList.map((c) => c.source_invoice_id).filter(Boolean))

  const arrearsSuggestions: ArrearssuggestionItem[] = (arrearsCases ?? [])
    .filter((ac) => !linkedArrearsCaseIds.has(ac.id))
    .map((ac) => ({
      arrears_case_id: ac.id as string,
      label:           ac.id.slice(0, 8).toUpperCase(),
      amount_cents:    ac.total_arrears_cents as number,
    }))

  const invoiceSuggestions: InvoiceSuggestionItem[] = (openInvoices ?? [])
    .filter((inv) => !linkedInvoiceIds.has(inv.id))
    .map((inv) => ({
      invoice_id:   inv.id as string,
      label:        `${inv.invoice_number} (due ${formatDateShort(new Date(inv.due_date as string))})`,
      amount_cents: inv.balance_cents as number,
    }))

  const hasUnconfirmedItems   = damageItems.some((i) => !i.agent_confirmed)
  const hasUnconfirmedCharges = chargeList.some((c) => !c.agent_confirmed)

  const now = new Date()
  const deadline = timer?.deadline ? new Date(timer.deadline) : null
  const daysRemaining = deadline ? Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  const isOverdue = daysRemaining !== null && daysRemaining < 0
  const timerBadgeVariant: "destructive" | "secondary" = (isOverdue || (daysRemaining !== null && daysRemaining <= 3)) ? "destructive" : "secondary"

  const statusColors: Record<string, string> = {
    draft:          "bg-gray-100 text-gray-700",
    pending_review: "bg-yellow-100 text-yellow-700",
    sent_to_tenant: "bg-blue-100 text-blue-700",
    disputed:       "bg-red-100 text-red-700",
    finalised:      "bg-green-100 text-green-700",
    refunded:       "bg-emerald-100 text-emerald-700",
    overdue:        "bg-red-100 text-red-700",
  }

  if (!recon) {
    return (
      <div>
        <BackLink href={`/leases/${leaseId}`} label="Back to lease" />
        <h1 className="font-heading text-2xl mb-4">Deposit Reconciliation</h1>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No deposit reconciliation has been started for this lease.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink href={`/leases/${leaseId}`} label="Back to lease" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Deposit Reconciliation</h1>
          <p className="text-sm text-muted-foreground">{propertyName} — {tenantName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={statusColors[recon.status] ?? ""}>
            {recon.status.replace(/_/g, " ")}
          </Badge>
          {timer && (
            <Badge variant={timerBadgeVariant}>
              {isOverdue
                ? `OVERDUE by ${Math.abs(daysRemaining!)}d`
                : `${daysRemaining}d remaining`
              }
            </Badge>
          )}
        </div>
      </div>

      {/* Deposit summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Deposit held</p>
            <p className="font-heading text-lg">{formatZAR(recon.deposit_held_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Interest accrued</p>
            <p className="font-heading text-lg">{formatZAR(recon.interest_accrued_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total deductions</p>
            <p className="font-heading text-lg text-red-600">{formatZAR(recon.total_deductions_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Refund to tenant</p>
            <p className="font-heading text-lg text-emerald-600">{formatZAR(recon.refund_to_tenant_cents)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tenant damage items */}
      {damageItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tenant Damage — Deductible ({damageItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <DamageItemsEditor leaseId={leaseId} items={damageItems} />
          </CardContent>
        </Card>
      )}

      {wearItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Wear &amp; Tear / Pre-existing — Not Deductible ({wearItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Room</th>
                  <th className="text-left py-2 pr-2">Description</th>
                  <th className="text-left py-2 px-2">Classification</th>
                  <th className="text-right py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {wearItems.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="py-2 pr-2">{item.room ?? "—"}</td>
                    <td className="py-2 pr-2">{item.item_description}</td>
                    <td className="py-2 px-2 capitalize text-xs">{item.classification.replace(/_/g, " ")}</td>
                    <td className="text-right py-2 text-muted-foreground">R 0</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {disputedItems.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-sm text-red-600">Disputed Items ({disputedItems.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {disputedItems.map((item) => (
              <div key={item.id} className="py-2 border-b border-border/50 last:border-0">
                <p className="text-sm font-medium">{item.room}: {item.item_description}</p>
                <p className="text-xs text-muted-foreground mt-1">Tenant notes: {item.dispute_notes ?? "No notes"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Non-damage charges (ADDENDUM_63B) */}
      <DepositChargesEditor
        leaseId={leaseId}
        charges={chargeList}
        arrearsSuggestions={arrearsSuggestions}
        invoiceSuggestions={invoiceSuggestions}
        reconStatus={recon.status as string}
      />

      {/* Interest accrual history — RHA s5(3)(d) */}
      {(interestTxns ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Interest Accrual History</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Period</th>
                  <th className="text-left py-2 pr-2">Description</th>
                  <th className="text-right py-2 px-2">Rate (p.a.)</th>
                  <th className="text-right py-2">Interest</th>
                </tr>
              </thead>
              <tbody>
                {(interestTxns ?? []).map((txn) => (
                  <tr key={txn.id} className="border-b border-border/50">
                    <td className="py-2 pr-2 text-xs">
                      {formatDateShort(new Date(txn.created_at))}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{txn.description ?? "Interest accrued"}</td>
                    <td className="text-right py-2 px-2 text-xs">
                      {txn.effective_rate_percent == null ? "—" : `${Number(txn.effective_rate_percent).toFixed(2)}%`}
                    </td>
                    <td className="text-right py-2 font-medium">{formatZAR(txn.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={3} className="pt-2">Total interest</td>
                  <td className="text-right pt-2">
                    {formatZAR((interestTxns ?? []).reduce((s, t) => s + t.amount_cents, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Return calculation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Return Calculation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Deposit + interest</span>
              <span>{formatZAR(recon.total_available_cents, true)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Less: deductions</span>
              <span>-{formatZAR(recon.total_deductions_cents, true)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold text-base">
              <span>Refund to tenant</span>
              <span className="text-emerald-600">{formatZAR(recon.refund_to_tenant_cents, true)}</span>
            </div>
          </div>
          {deadline && (
            <p className="text-xs text-muted-foreground mt-3">
              Return by: {formatDateShort(deadline)} ({timer?.return_days} days from vacation)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <DepositActions
        leaseId={leaseId}
        reconStatus={recon.status as string}
        hasUnconfirmedItems={hasUnconfirmedItems}
        hasUnconfirmedCharges={hasUnconfirmedCharges}
        timerOverdue={isOverdue || timer?.status === "overdue"}
      />
    </div>
  )
}
