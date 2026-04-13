import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { getPropertyPnL } from "@/lib/finance/propertyPnL"

const PERIOD_PRESETS = [
  { label: "This month", value: "this_month" },
  { label: "Last month", value: "last_month" },
  { label: "This quarter", value: "this_quarter" },
  { label: "This tax year", value: "tax_year" },
]

function getLastMonth(now: Date) {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from, to, label: from.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) }
}

function getThisQuarter(now: Date) {
  const q = Math.floor(now.getMonth() / 3)
  const from = new Date(now.getFullYear(), q * 3, 1)
  const to = new Date(now.getFullYear(), q * 3 + 3, 0)
  return { from, to, label: `Q${q + 1} ${now.getFullYear()}` }
}

function getTaxYear(now: Date) {
  // SA tax year: March 1 to Feb 28
  const year = now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear()
  const from = new Date(year, 2, 1)
  const to = new Date(year + 1, 1, 28)
  return { from, to, label: `Tax year ${year}/${year + 1 - 2000}` }
}

function getPeriod(preset?: string): { from: Date; to: Date; label: string } {
  const now = new Date()
  if (preset === "last_month") return getLastMonth(now)
  if (preset === "this_quarter") return getThisQuarter(now)
  if (preset === "tax_year") return getTaxYear(now)
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from, to, label: from.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) }
}

export default async function PropertyFinancialsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>
  searchParams: Promise<{ period?: string }>
}>) {
  const { id: propertyId } = await params
  const { period: periodPreset } = await searchParams
  const { from, to, label: periodLabel } = getPeriod(periodPreset)

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const { data: property } = await service
    .from("properties")
    .select("id, name, address_line1, suburb")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single()
  if (!property) notFound()

  const pnl = await getPropertyPnL(service, orgId, propertyId, from, to)
  const { incomeLines, expenseLines, totalRentCents, totalExpensesCents, totalFeesCents, totalNetCents, depositHeldCents } = pnl

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <Link href={`/properties/${propertyId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {property.name}
        </Link>
        <h1 className="font-heading text-2xl">Property Financials</h1>
        <p className="text-sm text-muted-foreground">{property.name}{property.suburb ? ` · ${property.suburb}` : ""}</p>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {PERIOD_PRESETS.map((p) => (
          <Link
            key={p.value}
            href={`/properties/${propertyId}/financials?period=${p.value}`}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
              (periodPreset ?? "this_month") === p.value
                ? "bg-foreground text-background border-foreground"
                : "border-border hover:border-foreground/50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* Summary */}
      <div className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold mb-4">{periodLabel}</h2>

        {/* Income */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Income</h3>
          {incomeLines.length > 0 ? (
            <div className="space-y-1">
              {incomeLines.map((l) => (
                <div key={`${l.description}-${l.amount_cents}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{l.description}{l.date ? ` · ${l.date}` : ""}</span>
                  <span className="tabular-nums font-medium">{formatZAR(l.amount_cents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No income recorded for this period.</p>
          )}
          <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-2">
            <span>Total income</span>
            <span className="tabular-nums">{formatZAR(totalRentCents)}</span>
          </div>
        </div>

        {/* Expenses */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Expenses</h3>
          {expenseLines.length > 0 ? (
            <div className="space-y-1">
              {expenseLines.map((l) => (
                <div key={`${l.description}-${l.amount_cents}`} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {l.description}
                    {l.sars_code && <span className="text-[10px] text-muted-foreground/60 ml-1">§{l.sars_code}</span>}
                  </span>
                  <span className="tabular-nums font-medium text-red-600">{formatZAR(l.amount_cents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No expenses recorded for this period.</p>
          )}
          <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-2">
            <span>Total expenses</span>
            <span className="tabular-nums text-red-600">{formatZAR(totalExpensesCents + totalFeesCents)}</span>
          </div>
        </div>

        {/* Net */}
        <div className="rounded-lg bg-muted/40 p-3 flex justify-between items-center">
          <span className="text-sm font-semibold">Net to owner</span>
          <span className="font-heading text-xl tabular-nums text-emerald-600">{formatZAR(totalNetCents)}</span>
        </div>
      </div>

      {/* Deposit held */}
      {depositHeldCents > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-3">Deposit</h2>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deposit held in trust</span>
            <span className="tabular-nums font-medium">{formatZAR(depositHeldCents)}</span>
          </div>
        </div>
      )}

      {incomeLines.length === 0 && expenseLines.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No owner statements generated for this period.</p>
      )}
    </div>
  )
}
