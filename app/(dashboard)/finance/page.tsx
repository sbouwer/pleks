import { redirect } from "next/navigation"
import Link from "next/link"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getFinanceHubData } from "@/lib/finance/financeHub"
import { formatZAR } from "@/lib/constants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function StatusBadge({ status }: { status: "clear" | "owing" | "arrears" }) {
  if (status === "clear") return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">Clear</Badge>
  if (status === "owing") return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Owing</Badge>
  return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50">Arrears</Badge>
}

export default async function FinancePage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const { orgId, tier } = gw
  const isSteward = tier === "steward" || tier === "portfolio" || tier === "firm"
  const data = await getFinanceHubData(orgId)

  const totalTenantBalance = data.tenantBalances.reduce((s, t) => s + t.balance_cents, 0)
  const totalOwed = data.ownerBalances.reduce((s, o) => s + o.owed_to_owner_cents, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Finance</h1>

      {/* Trust Account Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Trust Account</CardTitle>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/finance/trust-ledger" />}>
                View trust ledger →
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/payments/reconciliation" />}>
                Upload statement →
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Total in trust</div>
              <div className="text-base font-semibold">{formatZAR(data.trust.total_in_trust_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Deposits held</div>
              <div className="text-base font-semibold">{formatZAR(data.trust.deposits_held_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Rent undisbursed</div>
              <div className="text-base font-semibold">{formatZAR(data.trust.rent_collected_undisbursed_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Fees pending</div>
              <div className="text-base font-semibold">{formatZAR(data.trust.management_fees_pending_cents)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Last reconciled</div>
              <div className="text-base font-semibold">
                {data.trust.last_recon_date ? (
                  <span>{formatDate(data.trust.last_recon_date)} <span className="text-green-600">✓</span></span>
                ) : (
                  <span className="text-muted-foreground">Never</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tenant Balances */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Tenant Balances</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/tenants" />}>
              View all tenants →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {data.tenantBalances.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All tenants are up to date</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Tenant</th>
                  <th className="text-left py-2 pr-3">Property / Unit</th>
                  <th className="text-right py-2 pr-3">Balance</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.tenantBalances.map((t) => (
                  <tr key={t.tenant_id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium">{t.tenant_name}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{t.property_name} / {t.unit_number}</td>
                    <td className="py-2 pr-3 text-right font-medium">{formatZAR(t.balance_cents)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                    <td className="py-2 text-right">
                      <Link href={`/tenants/${t.tenant_id}/ledger`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Ledger →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="pt-3 text-xs text-muted-foreground">Total outstanding</td>
                  <td className="pt-3 text-right font-semibold">{formatZAR(totalTenantBalance)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Owner Balances — steward+ only */}
      {isSteward && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Owner Balances</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/landlords" />}>
                View all landlords →
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto pt-0">
            {data.ownerBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No pending owner payouts this month</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3">Owner</th>
                    <th className="text-left py-2 pr-3">Properties</th>
                    <th className="text-right py-2 pr-3">Owed to owner</th>
                    <th className="text-left py-2 pr-3">Payout status</th>
                    <th className="text-right py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.ownerBalances.map((o) => (
                    <tr key={o.landlord_id} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium">{o.owner_name}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{o.property_count}</td>
                      <td className="py-2 pr-3 text-right font-medium">{formatZAR(o.owed_to_owner_cents)}</td>
                      <td className="py-2 pr-3 capitalize text-xs">{o.payout_status}</td>
                      <td className="py-2 text-right">
                        <Link href={`/landlords/${o.landlord_id}/ledger`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Ledger →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="pt-3 text-xs text-muted-foreground">Total pending</td>
                    <td className="pt-3 text-right font-semibold">{formatZAR(totalOwed)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            )}
            <div className="mt-3 text-right">
              <Button variant="outline" size="sm" className="h-7 text-xs" render={<Link href="/statements" />}>
                Generate statements →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Property Performance */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Property Performance — {new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/properties" />}>
              View all properties →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {data.propertyPerformance.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No statements generated yet this month</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Property</th>
                  <th className="text-right py-2 pr-3">Income</th>
                  <th className="text-right py-2 pr-3">Expenses</th>
                  <th className="text-right py-2 pr-3">Net</th>
                  <th className="text-right py-2 pr-3">Occupancy</th>
                  <th className="text-right py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.propertyPerformance.map((p) => (
                  <tr key={p.property_id} className="border-b border-border/50">
                    <td className="py-2 pr-3 font-medium">{p.property_name}</td>
                    <td className="py-2 pr-3 text-right">{formatZAR(p.income_cents)}</td>
                    <td className="py-2 pr-3 text-right">{formatZAR(p.expenses_cents)}</td>
                    <td className="py-2 pr-3 text-right font-medium">{formatZAR(p.net_cents)}</td>
                    <td className="py-2 pr-3 text-right text-xs">{p.unit_count > 0 ? `${p.occupancy_percent}%` : "—"}</td>
                    <td className="py-2 text-right">
                      <Link href={`/properties/${p.property_id}/financials`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        P&L →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-3 text-xs text-muted-foreground">Total</td>
                  <td className="pt-3 text-right font-semibold">{formatZAR(data.propertyPerformance.reduce((s, p) => s + p.income_cents, 0))}</td>
                  <td className="pt-3 text-right font-semibold">{formatZAR(data.propertyPerformance.reduce((s, p) => s + p.expenses_cents, 0))}</td>
                  <td className="pt-3 text-right font-semibold">{formatZAR(data.propertyPerformance.reduce((s, p) => s + p.net_cents, 0))}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Unmatched Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Unmatched Transactions</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" render={<Link href="/payments/reconciliation" />}>
              Go to reconciliation →
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto pt-0">
          {data.unmatchedLines.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No unmatched transactions</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3">Date</th>
                    <th className="text-left py-2 pr-3">Description</th>
                    <th className="text-right py-2 pr-3">Amount</th>
                    <th className="text-right py-2 pr-3">Age</th>
                    <th className="text-left py-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {data.unmatchedLines.map((l) => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 text-xs">{formatDate(l.transaction_date)}</td>
                      <td className="py-2 pr-3 text-xs max-w-[240px] truncate">{l.description_clean}</td>
                      <td className="py-2 pr-3 text-right">{formatZAR(l.amount_cents)}</td>
                      <td className="py-2 pr-3 text-right text-xs text-muted-foreground">{l.age_days}d</td>
                      <td className="py-2 text-xs text-muted-foreground">{l.import_source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">{data.unmatchedLines.length} transaction{data.unmatchedLines.length !== 1 ? "s" : ""} need matching</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<Link href="/payments" />}>Record payment</Button>
        <Button variant="outline" size="sm" render={<Link href="/payments/reconciliation" />}>Upload statement</Button>
        <Button variant="outline" size="sm" render={<Link href="/statements" />}>Generate statements</Button>
        <Button variant="outline" size="sm" render={<Link href="/finance/deposits" />}>View deposits</Button>
        <Button variant="outline" size="sm" render={<Link href="/reports" />}>View reports</Button>
      </div>
    </div>
  )
}
