/**
 * app/(dashboard)/dashboard/PortfolioHealthPanel.tsx — agent-facing operations panel (replaces Financials)
 *
 * Route:  /dashboard (embedded)
 * Auth:   gateway-protected dashboard layout
 * Data:   PortfolioHealth (lease term · vacancy · maintenance hotspot · lead→lease) + arrears (from
 *         CollectionRateData) + TrustBalanceSummary, all from the server page.
 * Notes:  3×2 grid. Every tile carries border-b + border-r border-border; the container's overflow-hidden
 *         clips the edge borders, so the internal lines stay clean at both grid-cols-2 and md:grid-cols-3
 *         (avoids the Tailwind-v4 divide-* currentColor pitfall).
 */
import Link from "next/link"
import { InlineLink } from "@/components/ui/actions"
import { formatZAR, formatZARAbbrev } from "@/lib/constants"
import type { CollectionRateData } from "@/lib/dashboard/collectionRate"
import type { TrustBalanceSummary } from "@/lib/dashboard/trustBalance"
import type { PortfolioHealth } from "@/lib/dashboard/portfolioHealth"

function Tile({
  label, value, sub, valueClass, href,
}: Readonly<{ label: string; value: string; sub?: string; valueClass?: string; href?: string }>) {
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-heading text-lg ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
    </>
  )
  const cls = "flex flex-col justify-center border-b border-r border-border p-4"
  return href
    ? <Link href={href} className={`${cls} block transition-colors hover:bg-muted/30`}>{body}</Link>
    : <div className={cls}>{body}</div>
}

export function PortfolioHealthPanel({
  collection, trustBalance, health,
}: Readonly<{ collection: CollectionRateData; trustBalance: TrustBalanceSummary; health: PortfolioHealth }>) {
  const outstanding = collection.totalExpected - collection.totalCollected
  const hotspot = health.maintenanceHotspot
  const leaseTerm = health.avgLeaseTermMonths == null ? "—" : `${health.avgLeaseTermMonths} mo`
  const vacancy = health.avgVacancyDays == null ? "—" : `${health.avgVacancyDays} days`
  const leadToLease = health.leadToLeaseDays == null ? "—" : `${health.leadToLeaseDays} days`
  let hotspotSub = "no requests"
  if (hotspot) hotspotSub = `${hotspot.count} request${hotspot.count === 1 ? "" : "s"}`

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="inline-block h-0.5 w-4 shrink-0 bg-amber-400" />
          Portfolio health
        </h2>
        <InlineLink href="/reports" withArrow>Reports</InlineLink>
      </div>

      <div className="-mb-px -mr-px grid flex-1 auto-rows-fr grid-cols-2 md:grid-cols-3">
        <Tile label="Avg lease term" value={leaseTerm} sub="across leases" />
        <Tile label="Avg vacancy" value={vacancy} sub="between leases" />
        <Tile label="Lead → lease" value={leadToLease} sub="advert to signed" />
        <Tile
          label="Maintenance hotspot"
          value={hotspot ? hotspot.name : "None"}
          sub={hotspotSub}
          href={hotspot ? `/properties/${hotspot.propertyId}` : undefined}
        />
        <Tile
          label="Outstanding arrears"
          value={formatZAR(outstanding)}
          valueClass={outstanding > 0 ? "text-red-600" : "text-muted-foreground"}
          sub="this month"
          href={outstanding > 0 ? "/billing/arrears" : undefined}
        />
        <Tile label="Trust balance" value={formatZARAbbrev(trustBalance.total_in_trust_cents)} sub={`Deposits ${formatZARAbbrev(trustBalance.deposits_held_cents)}`} />
      </div>
    </div>
  )
}
