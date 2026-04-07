import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Edit, Building2 } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { UpgradeCta } from "@/components/shared/UpgradeCta"
import { BodyCorporateCard } from "./BodyCorporateCard"
import { OwnerMetrics } from "./PropertyMetrics"
import { formatZAR } from "@/lib/constants"
import type { AttentionItem } from "@/lib/dashboard/attentionItems"
import type { ActivityItem } from "@/lib/dashboard/activityFeed"
import { relativeTime } from "@/lib/dashboard/activityFeed"
import { cn } from "@/lib/utils"

export interface SinglePropertyData {
  id: string
  name: string
  type: string
  address_line1: string
  address_line2: string | null
  suburb: string | null
  city: string
  province: string
  postal_code: string | null
  is_sectional_title?: boolean | null
  levy_amount_cents?: number | null
  levy_account_number?: string | null
  managing_scheme?: {
    id: string
    company_name: string
  } | null
  units: {
    id: string
    unit_number: string | null
    status: string
    is_archived: boolean
    leases: {
      id: string
      status: string
      rent_amount_cents: number
      start_date: string
      end_date: string | null
      tenant: {
        id: string
        contact: { first_name: string; last_name: string } | null
      } | null
    }[]
  }[]
}

interface Props {
  property: SinglePropertyData
  attentionItems: AttentionItem[]
  recentActivity: ActivityItem[]
}

export function SinglePropertyView({ property, attentionItems, recentActivity }: Props) {
  const activeUnit = property.units.find(u => !u.is_archived) ?? null
  const activeLease = activeUnit?.leases.find(l => l.status === "active") ?? null
  const tenant = activeLease?.tenant ?? null
  const tenantName = tenant?.contact
    ? `${tenant.contact.first_name} ${tenant.contact.last_name}`
    : null

  const statusLabel = activeUnit?.status ?? null
  const rentCents = activeLease?.rent_amount_cents ?? null
  const leaseEndDate = activeLease?.end_date ?? null

  const fullAddress = [
    property.address_line1,
    property.address_line2,
    property.suburb,
    property.city,
    property.province,
    property.postal_code,
  ].filter(Boolean).join(", ")

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-heading text-3xl">My property</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {property.name} &middot; {property.address_line1}, {property.city}
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/properties/${property.id}/edit`} />}>
          <Edit className="size-3.5 mr-1.5" /> Edit property
        </Button>
      </div>

      {/* Metrics strip */}
      <OwnerMetrics
        unitStatus={statusLabel}
        rentCents={rentCents}
        leaseEndDate={leaseEndDate}
        collectionPct={null}
      />

      {/* Property detail + map */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 mb-4">
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{property.name}</h2>
              <span className="text-xs capitalize text-muted-foreground border border-border/60 px-1.5 py-0.5 rounded">
                {property.type}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{fullAddress}</p>
          </div>

          {/* Unit row */}
          {activeUnit && (
            <div className="border-t border-border/40 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Unit</p>
              <div className="flex items-center gap-4 text-sm">
                <span className="font-medium">{activeUnit.unit_number ?? "Unit 1"}</span>
                {tenantName && tenant?.id ? (
                  <Link href={`/tenants/${tenant.id}`} className="text-brand hover:underline underline-offset-2">
                    {tenantName}
                  </Link>
                ) : tenantName ? (
                  <span className="text-muted-foreground">{tenantName}</span>
                ) : (
                  <span className="text-muted-foreground">Vacant</span>
                )}
                {rentCents != null && rentCents > 0 && (
                  <span className="text-muted-foreground">{formatZAR(rentCents)}</span>
                )}
                {activeUnit.status && (
                  <span className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded",
                    activeUnit.status === "occupied" ? "bg-green-500/10 text-green-600"
                    : activeUnit.status === "notice" ? "bg-amber-500/10 text-amber-600"
                    : "bg-red-500/10 text-red-600"
                  )}>
                    {activeUnit.status === "occupied" ? "Occupied"
                      : activeUnit.status === "notice" ? "Notice given"
                      : "Vacant"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Map placeholder */}
        <div className="rounded-xl border border-border/60 bg-muted/20 flex items-center justify-center min-h-44">
          <p className="text-xs text-muted-foreground">Map</p>
        </div>
      </div>

      {/* Body corporate */}
      {property.is_sectional_title && (
        <div className="mb-4">
          <BodyCorporateCard
            schemeName={property.managing_scheme?.company_name ?? null}
            managingAgentCompany={null}
            schemeId={property.managing_scheme?.id ?? null}
            levyCents={property.levy_amount_cents}
            levyAccount={property.levy_account_number}
          />
        </div>
      )}

      {/* Needs attention */}
      {attentionItems.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
            Needs attention
          </p>
          <div className="space-y-2">
            {attentionItems.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-start gap-2.5 text-sm">
                <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", item.dotColor)} />
                <div>
                  <Link href={item.href} className="hover:text-brand transition-colors">
                    {item.title}
                  </Link>
                  {item.subtitle && <p className="text-xs text-muted-foreground">{item.subtitle}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
            Recent activity
          </p>
          <div className="space-y-2">
            {recentActivity.slice(0, 5).map(item => (
              <div key={item.id} className="flex items-start gap-2.5 text-sm">
                <span className={cn("mt-1.5 size-1.5 rounded-full shrink-0", item.dotColor)} />
                <div className="flex-1 min-w-0">
                  <span>{item.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {relativeTime(new Date(item.timestamp))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upgrade CTA */}
      <UpgradeCta
        title="Managing more than one property?"
        description="Upgrade to Steward to manage up to 20 units with digital signing, bank reconciliation, and more."
        dismissKey="upgrade-cta-owner-properties"
      />
    </div>
  )
}

// ── Empty state when owner has no property yet ────────────────────────────────

export function NoPropertyYet() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">My property</h1>
        <Button render={<Link href="/properties/new" />}>
          <Building2 className="size-4 mr-1.5" /> Add your property
        </Button>
      </div>
      <EmptyState
        icon={<Building2 className="h-8 w-8 text-muted-foreground" />}
        title="No property yet"
        description="Add your property to get started."
      />
    </div>
  )
}
