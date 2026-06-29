/**
 * app/(landlord)/landlord/trust-summary/page.tsx — Landlord view of deposits held in trust
 *
 * Route:  /landlord/trust-summary
 * Auth:   getLandlordSession — redirects to /login if unauthenticated or suspended
 * Data:   deposit_transactions aggregated per lease, joined via properties → leases
 * Notes:  Shows only this landlord's properties. Never shows bank account details,
 *         total trust balance, or other landlords' deposits (D-TRUST-14).
 *         Pleks is not the trustee — the agency is. See brief/legal/TRUST_ACCOUNT_POSITIONING.md.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { formatZAR } from "@/lib/constants"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { ShieldCheck } from "lucide-react"

interface DepositRow {
  leaseId: string
  tenantName: string
  leaseStart: string
  depositHeldCents: number
  interestAccruedCents: number
}

interface PropertyGroup {
  id: string
  name: string
  address: string
  deposits: DepositRow[]
}

async function fetchData(landlordId: string, orgId: string) {
  const db = await createServiceClient()

  const { data: properties, error: propErr } = await db
    .from("properties")
    .select("id, name, address_line1, suburb, city")
    .eq("landlord_id", landlordId)
    .is("deleted_at", null)
    .order("name")

  if (propErr) {
    console.error("[trust-summary] properties fetch failed:", propErr.message)
    return { groups: [], lastReconDate: null }
  }

  const propertyIds = (properties ?? []).map((p) => p.id)

  const [leasesResult, reconResult] = await Promise.all([
    propertyIds.length > 0
      ? db
          .from("leases")
          .select(`
            id,
            property_id,
            start_date,
            tenants ( contacts ( first_name, last_name, company_name ) )
          `)
          .in("property_id", propertyIds)
          .in("status", ["active", "notice", "month_to_month"])
          .is("deleted_at", null)
      : { data: [], error: null },
    db
      .from("trust_reconciliation_periods")
      .select("period_end, signed_off_at")
      .eq("org_id", orgId)
      .eq("status", "signed_off")
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (leasesResult.error) {
    console.error("[trust-summary] leases fetch failed:", leasesResult.error.message)
  }

  const leases = leasesResult.data ?? []
  const leaseIds = leases.map((l) => l.id)

  const { data: txns, error: txnErr } = leaseIds.length > 0
    ? await db
        .from("deposit_transactions")
        .select("lease_id, transaction_type, direction, amount_cents")
        .in("lease_id", leaseIds)
        .eq("org_id", orgId)
    : { data: [], error: null }

  if (txnErr) {
    console.error("[trust-summary] deposit_transactions fetch failed:", txnErr.message)
  }

  // Aggregate per lease: deposits held = deposit_received credits - deposit_returned debits - deductions
  const heldByLease: Record<string, number> = {}
  const interestByLease: Record<string, number> = {}

  for (const t of txns ?? []) {
    const sign = t.direction === "credit" ? 1 : -1
    if (t.transaction_type === "interest_accrued") {
      interestByLease[t.lease_id] = (interestByLease[t.lease_id] ?? 0) + sign * t.amount_cents
    } else {
      heldByLease[t.lease_id] = (heldByLease[t.lease_id] ?? 0) + sign * t.amount_cents
    }
  }

  // Build property groups
  const propMap = Object.fromEntries(
    (properties ?? []).map((p) => [p.id, p])
  )
  const leasesByProp: Record<string, typeof leases> = {}
  for (const l of leases) {
    leasesByProp[l.property_id] = leasesByProp[l.property_id] ?? []
    leasesByProp[l.property_id].push(l)
  }

  const groups: PropertyGroup[] = propertyIds
    .filter((id) => (leasesByProp[id]?.length ?? 0) > 0)
    .map((propId) => {
      const prop = propMap[propId]
      const address = [prop.address_line1, prop.suburb, prop.city].filter(Boolean).join(", ")
      const deposits: DepositRow[] = (leasesByProp[propId] ?? []).map((l) => {
        const tenant = l.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null } | null } | null
        const c = tenant?.contacts
        const fullName = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()
        const tenantName = c?.company_name ?? (fullName || "Tenant")
        return {
          leaseId: l.id,
          tenantName,
          leaseStart: l.start_date,
          depositHeldCents: Math.max(0, heldByLease[l.id] ?? 0),
          interestAccruedCents: Math.max(0, interestByLease[l.id] ?? 0),
        }
      })
      return { id: propId, name: prop.name, address, deposits }
    })

  const lastReconDate = reconResult.data?.period_end ?? null

  return { groups, lastReconDate }
}

export default async function LandlordTrustSummaryPage() {
  const session = await getLandlordSession()
  const { groups, lastReconDate } = await fetchData(session.landlordId, session.orgId)

  const totalDeposits = groups.flatMap((g) => g.deposits).reduce((s, d) => s + d.depositHeldCents, 0)
  const totalInterest = groups.flatMap((g) => g.deposits).reduce((s, d) => s + d.interestAccruedCents, 0)
  const hasAnyDeposit = groups.some((g) => g.deposits.length > 0)

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Landlord" title="Deposits held in trust" headline="Deposits your agency holds on your behalf" />

      {/* Sovereign notice */}
      <div className="flex gap-3 rounded-[var(--r-button)] border border-border bg-card px-4 py-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Your agency holds these deposits in trust</p>
          <p>Your deposits are held in your agency&apos;s Section 86 trust account. Pleks is the management software — Pleks does not hold your funds.</p>
          {lastReconDate && (
            <p className="mt-1">
              Last reconciliation signed off:{" "}
              <span className="font-medium text-foreground">
                {new Date(lastReconDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </p>
          )}
        </div>
      </div>

      {!hasAnyDeposit && (
        <p className="text-sm text-muted-foreground">No active deposits on record for your properties.</p>
      )}

      {groups.map((group) => {
        const groupTotal = group.deposits.reduce((s, d) => s + d.depositHeldCents + d.interestAccruedCents, 0)
        return (
          <DetailCard key={group.id} title={group.name}>
            {group.address && <p className="mb-2 text-xs text-muted-foreground">{group.address}</p>}
            <div className="divide-y divide-border">
              {group.deposits.map((d) => (
                <div key={d.leaseId} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">{d.tenantName}</span>
                    <span className="font-semibold tabular-nums text-foreground">{formatZAR(d.depositHeldCents + d.interestAccruedCents)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Lease from {new Date(d.leaseStart).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}</span>
                    <span>Deposit held: {formatZAR(d.depositHeldCents)}</span>
                    {d.interestAccruedCents > 0 && (
                      <span>Interest: {formatZAR(d.interestAccruedCents)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {group.deposits.length > 1 && (
              <div className="flex justify-between border-t border-border pt-2 text-sm font-medium text-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatZAR(groupTotal)}</span>
              </div>
            )}
          </DetailCard>
        )
      })}

      {hasAnyDeposit && (
        <div className="flex items-center justify-between rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card px-5 py-4">
          <div>
            <p className="font-semibold text-foreground">Total held on your behalf</p>
            <p className="text-xs text-muted-foreground">
              Deposit principal: {formatZAR(totalDeposits)}
              {totalInterest > 0 && ` · Interest: ${formatZAR(totalInterest)}`}
            </p>
          </div>
          <p className="text-xl font-bold tabular-nums text-foreground">{formatZAR(totalDeposits + totalInterest)}</p>
        </div>
      )}
    </div>
  )
}
