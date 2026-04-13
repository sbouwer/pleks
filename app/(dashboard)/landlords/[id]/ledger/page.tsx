import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { formatZAR } from "@/lib/constants"

interface OwnerLedgerEntry {
  id: string
  date: string
  ref: string | null
  type: string
  property_name: string
  in_cents: number
  out_cents: number
}

function BalancePill({ cents }: Readonly<{ cents: number }>) {
  return (
    <span className={`font-medium tabular-nums ${cents < 0 ? "text-red-600" : "text-emerald-600"}`}>
      {cents < 0 ? "" : "CR "}{formatZAR(Math.abs(cents))}
    </span>
  )
}

export default async function OwnerLedgerPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id: landlordId } = await params

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

  const { data: landlord } = await service
    .from("landlord_view")
    .select("id, first_name, last_name, company_name, entity_type")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .single()
  if (!landlord) notFound()

  const displayName = landlord.company_name
    || `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim()
    || "Landlord"

  // Get all properties for this landlord
  const { data: properties } = await service
    .from("properties")
    .select("id, name")
    .eq("landlord_id", landlordId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
  const propertyIds = (properties ?? []).map((p) => p.id)
  const propertyNames: Record<string, string> = {}
  for (const p of properties ?? []) { propertyNames[p.id] = p.name }

  if (propertyIds.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <Link href={`/landlords/${landlordId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {displayName}
        </Link>
        <h1 className="font-heading text-2xl">Owner Ledger</h1>
        <p className="text-sm text-muted-foreground">No properties linked to this owner.</p>
      </div>
    )
  }

  // Fetch owner statements — the authoritative owner financial record
  const { data: statements, error: stmtErr } = await service
    .from("owner_statements")
    .select("id, period_month, period_from, period_to, gross_income_cents, total_expenses_cents, management_fee_cents, management_fee_vat_cents, net_to_owner_cents, owner_payment_status, owner_payment_date, property_id")
    .eq("org_id", orgId)
    .in("property_id", propertyIds)
    .order("period_from", { ascending: true })

  if (stmtErr) console.error("owner_statements:", stmtErr.message)

  // Build ledger entries from statements
  const ledgerEntries: OwnerLedgerEntry[] = []
  for (const s of statements ?? []) {
    const propName = propertyNames[s.property_id] ?? "Unknown"
    const period = s.period_from ? s.period_from.slice(0, 7) : s.period_month?.slice(0, 7) ?? ""

    // Income row
    if (s.gross_income_cents > 0) {
      ledgerEntries.push({
        id: `inc-${s.id}`,
        date: s.period_from ?? s.period_month ?? "",
        ref: null,
        type: "Rent collected",
        property_name: propName,
        in_cents: s.gross_income_cents,
        out_cents: 0,
      })
    }
    // Expenses row
    const totalExpenses = (s.total_expenses_cents ?? 0) + (s.management_fee_cents ?? 0) + (s.management_fee_vat_cents ?? 0)
    if (totalExpenses > 0) {
      ledgerEntries.push({
        id: `exp-${s.id}`,
        date: s.period_from ?? s.period_month ?? "",
        ref: null,
        type: "Expenses & fees",
        property_name: propName,
        in_cents: 0,
        out_cents: totalExpenses,
      })
    }
    // Payout row
    if (s.owner_payment_status === "paid" && s.net_to_owner_cents > 0) {
      ledgerEntries.push({
        id: `pay-${s.id}`,
        date: s.owner_payment_date ?? s.period_from ?? "",
        ref: `STMT-${period}`,
        type: "Owner payout",
        property_name: propName,
        in_cents: 0,
        out_cents: s.net_to_owner_cents,
      })
    }
  }

  ledgerEntries.sort((a, b) => a.date.localeCompare(b.date))

  // Running balance = money agency owes the owner (positive = owing)
  const entriesWithBalance = ledgerEntries.reduce<Array<OwnerLedgerEntry & { balance: number }>>(
    (acc, e) => {
      const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0
      return [...acc, { ...e, balance: prev + e.in_cents - e.out_cents }]
    },
    [],
  )

  const totalIn = ledgerEntries.reduce((s, e) => s + e.in_cents, 0)
  const totalOut = ledgerEntries.reduce((s, e) => s + e.out_cents, 0)
  const currentBalance = totalIn - totalOut

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <Link href={`/landlords/${landlordId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {displayName}
        </Link>
        <h1 className="font-heading text-2xl">Owner Ledger</h1>
        <p className="text-sm text-muted-foreground">{displayName} · {(properties ?? []).length} {(properties ?? []).length === 1 ? "property" : "properties"}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total rent collected", value: formatZAR(totalIn), accent: false },
          { label: "Total disbursed", value: formatZAR(totalOut), accent: false },
          { label: "Balance owing to owner", value: formatZAR(currentBalance), accent: currentBalance > 0 },
          { label: "Statements", value: String(statements?.length ?? 0), accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 font-heading text-xl tabular-nums ${accent ? "text-emerald-600" : ""}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Ledger */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Owner Financial History</h2>
        </div>
        {entriesWithBalance.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">No statements generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {["Date", "Type", "Property", "Ref", "In", "Out", "Balance"].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {entriesWithBalance.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-muted font-medium">{e.type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{e.property_name}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.ref ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.in_cents > 0 ? <span className="text-emerald-600">{formatZAR(e.in_cents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {e.out_cents > 0 ? <span className="text-red-500">{formatZAR(e.out_cents)}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <BalancePill cents={e.balance} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
