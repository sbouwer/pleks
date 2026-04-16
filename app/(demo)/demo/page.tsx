"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useDemoData } from "@/lib/demo/DemoContext"
import { formatZAR } from "@/lib/constants"
import {
  AlertTriangle, Clock, Building2, AlertCircle,
  TrendingUp, Wallet, ShieldCheck, ArrowRight,
} from "lucide-react"
import Link from "next/link"

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
}

function daysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

// ── Attention items ───────────────────────────────────────────────────────────

interface AttentionItem {
  id: string
  type: "arrears" | "expiry" | "vacant"
  severity: "critical" | "warning" | "info"
  label: string
  detail: string
  href: string
  action: string
}

function useAttentionItems() {
  const { data } = useDemoData()

  const items: AttentionItem[] = []

  for (const ac of data.arrears_cases.filter((a) => a.status === "open")) {
    items.push({
      id: ac.id,
      type: "arrears",
      severity: "critical",
      label: `${ac.tenant_name} — ${formatZAR(ac.total_arrears_cents)} arrears (${ac.days_overdue} days)`,
      detail: `${ac.property_name} · ${ac.unit_number}`,
      href: "/demo/finance/billing",
      action: "View",
    })
  }

  for (const lease of data.leases) {
    const days = daysLeft(lease.end_date)
    if (days > 0 && days <= 80 && !lease.cpa_notice_sent) {
      const tenant = data.tenants.find((t) => t.id === lease.tenant_id)
      items.push({
        id: lease.id,
        type: "expiry",
        severity: "warning",
        label: `${tenant?.full_name ?? "Tenant"} lease expires in ${days} days — CPA notice due`,
        detail: `${lease.property_name} · ${lease.unit_number}`,
        href: "/demo/leases",
        action: "Action",
      })
    }
  }

  for (const unit of data.units.filter((u) => u.status === "vacant")) {
    const property = data.properties.find((p) => p.id === unit.property_id)
    items.push({
      id: unit.id,
      type: "vacant",
      severity: "info",
      label: `${property?.name ?? "Property"} ${unit.unit_number} — vacant (${formatZAR(unit.monthly_rental_cents)}/mo lost)`,
      detail: "No active listing",
      href: "/demo/properties",
      action: "List unit",
    })
  }

  return items
}

const SEVERITY_ICON: Record<string, React.ElementType> = {
  critical: AlertTriangle,
  warning:  AlertCircle,
  info:     Building2,
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-danger",
  warning:  "text-amber-500",
  info:     "text-muted-foreground",
}

// ── Upcoming events ───────────────────────────────────────────────────────────

function useUpcomingEvents() {
  const { data } = useDemoData()

  const events: Array<{ date: string; label: string; href: string }> = []

  for (const ins of data.inspections) {
    if (ins.status === "scheduled") {
      const days = daysLeft(ins.scheduled_date)
      if (days >= 0 && days <= 14) {
        events.push({
          date: ins.scheduled_date,
          label: `${ins.inspection_type.replace("_", " ")} inspection — ${ins.property_name} ${ins.unit_number}`,
          href: "/demo/inspections",
        })
      }
    }
  }

  for (const lease of data.leases) {
    const days = daysLeft(lease.end_date)
    if (days >= 0 && days <= 14) {
      const tenant = data.tenants.find((t) => t.id === lease.tenant_id)
      events.push({
        date: lease.end_date,
        label: `Lease ends — ${tenant?.full_name ?? "Tenant"}, ${lease.unit_number}`,
        href: "/demo/leases",
      })
    }
  }

  // Rent collection day: 1st of next month
  const today = new Date()
  const firstNext = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const daysToFirst = Math.ceil((firstNext.getTime() - today.getTime()) / 86400000)
  if (daysToFirst <= 14) {
    const rentTotal = data.leases.reduce((s, l) => s + l.rent_amount_cents, 0)
    events.push({
      date: firstNext.toISOString().slice(0, 10),
      label: `Rent collection day (${data.leases.length} invoices, ${formatZAR(rentTotal)})`,
      href: "/demo/finance/billing",
    })
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

// ── Recent activity ───────────────────────────────────────────────────────────

function useRecentActivity() {
  const { data } = useDemoData()

  const items: Array<{ label: string; date: string; href: string }> = []

  const recent = [...data.payments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  for (const p of recent) {
    items.push({
      label: `Payment received — ${p.tenant_name} ${formatZAR(p.amount_cents)} (${p.method})`,
      date: p.date,
      href: "/demo/finance/billing",
    })
  }

  const resolved = data.maintenance.filter((m) => m.status === "resolved")
  for (const m of resolved) {
    if (m.resolved_date) {
      items.push({
        label: `Maintenance completed — ${m.title}, ${m.property_name}`,
        date: m.resolved_date,
        href: "/demo/maintenance",
      })
    }
  }

  const upcoming = data.inspections.filter((i) => i.status === "scheduled")
  for (const i of upcoming) {
    items.push({
      label: `Inspection scheduled — ${i.property_name} ${i.unit_number}, ${formatShortDate(i.scheduled_date)} (${i.inspection_type.replace("_", " ")})`,
      date: i.scheduled_date,
      href: "/demo/inspections",
    })
  }

  return items
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DemoDashboard() {
  const { data } = useDemoData()
  const [now] = useState(() => Date.now())

  const attentionItems = useAttentionItems()
  const upcomingEvents = useUpcomingEvents()
  const recentActivity = useRecentActivity()

  const occupiedUnits = data.units.filter((u) => u.status === "occupied").length
  const expectedRent = data.leases.reduce((s, l) => s + l.rent_amount_cents, 0)
  const collectedRent = data.invoices
    .filter((inv) => {
      if (inv.status !== "paid" || !inv.paid_date) return false
      const paidAt = new Date(inv.paid_date).getTime()
      return now - paidAt < 35 * 86400000
    })
    .reduce((s, inv) => s + inv.amount_cents, 0)
  const occupancyPct = Math.round((occupiedUnits / data.units.length) * 100)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-2xl">{greeting()}, demo!</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what needs your attention today.</p>
      </div>

      {/* Attention queue */}
      {attentionItems.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-600">
              Attention needed ({attentionItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionItems.map((item) => {
              const Icon = SEVERITY_ICON[item.severity]
              const color = SEVERITY_COLOR[item.severity]
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start justify-between gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-surface-elevated transition-colors"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className={`size-4 shrink-0 mt-0.5 ${color}`} />
                    <div className="min-w-0">
                      <p className="text-sm leading-tight">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                  <span className="text-xs text-brand shrink-0 font-medium">{item.action}</span>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Portfolio snapshot */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">Portfolio snapshot</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Units",      value: String(data.units.length),          sub: `${occupiedUnits} occupied (${occupancyPct}%)` },
            { label: "Expected",   value: formatZAR(expectedRent),            sub: "this month" },
            { label: "Collected",  value: formatZAR(collectedRent),           sub: "last 30 days" },
            { label: "Arrears",    value: formatZAR(data.financials.arrears_cents), sub: "outstanding", danger: data.financials.arrears_cents > 0 },
          ].map(({ label, value, sub, danger }) => (
            <Card key={label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`font-heading text-xl ${danger ? "text-danger" : ""}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Financial summary */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">Financial summary</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/demo/finance">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="size-4 text-brand" />
                  <div>
                    <p className="text-xs text-muted-foreground">Trust balance</p>
                    <p className="font-heading text-lg text-brand">{formatZAR(data.financials.trust_balance_cents)}</p>
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/demo/finance/deposits">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Deposits held</p>
                    <p className="font-heading text-lg">{formatZAR(data.financials.total_deposits_held_cents)}</p>
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href="/demo/finance/billing">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-green-500" />
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly income</p>
                    <p className="font-heading text-lg text-green-600">{formatZAR(data.financials.monthly_rental_income_cents)}</p>
                  </div>
                </div>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Two-column: recent activity + upcoming */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {recentActivity.map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-surface-elevated transition-colors"
              >
                <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                <p className="text-xs text-muted-foreground leading-snug">{item.label}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Upcoming (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcomingEvents.length === 0 && (
              <p className="text-xs text-muted-foreground">Nothing scheduled.</p>
            )}
            {upcomingEvents.map((ev, i) => (
              <Link
                key={i}
                href={ev.href}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-surface-elevated transition-colors"
              >
                <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">
                  {formatShortDate(ev.date)}
                </Badge>
                <p className="text-xs text-muted-foreground leading-snug">{ev.label}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
