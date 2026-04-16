"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import {
  Wallet, ShieldCheck, TrendingUp, Settings, AlertCircle,
  ArrowRight, Send,
} from "lucide-react"
import Link from "next/link"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

export default function DemoFinancePage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()
  const f = data.financials

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Finance Overview</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Trust account, deposits &amp; owner balances</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Trust balance",    value: f.trust_balance_cents,        icon: Wallet,      color: "text-brand" },
          { label: "Deposits held",    value: f.total_deposits_held_cents,  icon: ShieldCheck, color: "text-blue-500" },
          { label: "Monthly income",   value: f.monthly_rental_income_cents,icon: TrendingUp,  color: "text-green-600" },
          { label: "Management fees",  value: f.management_fee_cents,       icon: Settings,    color: "text-muted-foreground" },
          { label: "Outstanding",      value: f.outstanding_cents,          icon: AlertCircle, color: "text-danger" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <div className="rounded-md bg-surface-elevated p-1.5 mt-0.5">
                  <Icon className={`size-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-heading text-xl ${color}`}>{formatZAR(value)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sub-section links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/demo/finance/deposits">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-blue-500" />
                <div>
                  <p className="font-medium text-sm">Deposit Register</p>
                  <p className="text-xs text-muted-foreground">{data.deposits.length} deposits · {formatZAR(f.total_deposits_held_cents)} held</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/demo/finance/trust">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="size-5 text-brand" />
                <div>
                  <p className="font-medium text-sm">Trust Ledger</p>
                  <p className="text-xs text-muted-foreground">{data.trust_transactions.length} transactions · balance {formatZAR(f.trust_balance_cents)}</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/demo/finance/billing">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="size-5 text-danger" />
                <div>
                  <p className="font-medium text-sm">Billing &amp; Arrears</p>
                  <p className="text-xs text-muted-foreground">{data.invoices.length} invoices · {formatZAR(f.arrears_cents)} arrears</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
        <Link href="/demo/finance/reports">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="pt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="size-5 text-green-500" />
                <div>
                  <p className="font-medium text-sm">Reports</p>
                  <p className="text-xs text-muted-foreground">{data.reports.available} reports available</p>
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Owner statements */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Owner Statements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Net payout</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {data.owner_statements.map((stmt) => (
                  <tr
                    key={stmt.id}
                    className="border-b last:border-0 hover:bg-surface-elevated transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{stmt.owner}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{stmt.property}</td>
                    <td className="px-4 py-3 text-muted-foreground">{stmt.period}</td>
                    <td className="px-4 py-3 font-medium text-green-600">{formatZAR(stmt.net_cents)}</td>
                    <td className="px-4 py-3">
                      {stmt.status === "sent" ? (
                        <Badge className="bg-green-500/10 text-green-600 border-0">
                          Sent {stmt.sent_date ? formatDate(stmt.sent_date) : ""}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Draft</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={showDemoToast}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Send className="size-3" />
                        {stmt.status === "draft" ? "Send" : "Resend"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
