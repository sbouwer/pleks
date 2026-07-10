/**
 * app/(dashboard)/landlords/[id]/ledger/page.tsx — Owner ledger: running balance of rent collected, disbursements, and fees per landlord
 *
 * Route:  /landlords/[id]/ledger
 * Auth:   createClient + user_orgs membership check (redirects to /login or /onboarding)
 * Data:   getOwnerLedger — owner_statements + trust_transactions filtered by landlord_id
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { InlineLink } from "@/components/ui/actions"
import { formatZAR } from "@/lib/constants"
import { getOwnerLedger, type OwnerLedgerEntry } from "@/lib/finance/ownerLedger"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { fmtDateZA } from "@/lib/dates"

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

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("OwnerLedgerPage user_orgs", membershipError)
  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  const { data: landlord, error: landlordError } = await service
    .from("landlord_view")
    .select("id, first_name, last_name, company_name, entity_type")
    .eq("id", landlordId)
    .eq("org_id", orgId)
    .single()
    logQueryError("OwnerLedgerPage landlord_view", landlordError)
  if (!landlord) notFound()

  const displayName = landlord.company_name
    || `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim()
    || "Landlord"

  const { entries: ledgerEntries, propertyCount, statementCount } = await getOwnerLedger(service, orgId, landlordId)

  if (propertyCount === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="mb-2">
          <InlineLink href={`/landlords/${landlordId}`}>← Back to {displayName}</InlineLink>
        </div>
        <h1 className="font-heading text-2xl">Owner Ledger</h1>
        <p className="text-sm text-muted-foreground">No properties linked to this owner.</p>
      </div>
    )
  }

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
        <div className="mb-2">
          <InlineLink href={`/landlords/${landlordId}`}>← Back to {displayName}</InlineLink>
        </div>
        <h1 className="font-heading text-2xl">Owner Ledger</h1>
        <p className="text-sm text-muted-foreground">{displayName} · {propertyCount} {propertyCount === 1 ? "property" : "properties"}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total rent collected", value: formatZAR(totalIn), accent: false },
          { label: "Total disbursed", value: formatZAR(totalOut), accent: false },
          { label: "Balance owing to owner", value: formatZAR(currentBalance), accent: currentBalance > 0 },
          { label: "Statements", value: String(statementCount), accent: false },
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
                      {fmtDateZA(e.date)}
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
