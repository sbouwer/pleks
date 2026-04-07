import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Edit, Building2 } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { UpgradeCta } from "@/components/shared/UpgradeCta"
import { BodyCorporateCard } from "./BodyCorporateCard"
import { OwnerMetrics } from "./PropertyMetrics"
import { PropertyUnitsSection } from "./PropertyUnitsSection"
import { QuickActionsCard } from "./QuickActionsCard"
import type { AttentionItem } from "@/lib/dashboard/attentionItems"
import type { ActivityItem } from "@/lib/dashboard/activityFeed"
import { relativeTime } from "@/lib/dashboard/activityFeed"
import { cn } from "@/lib/utils"
import { PropertyMap } from "@/components/map/PropertyMap"

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
  managing_agent_id?: string | null
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
    bedrooms?: number | null
    bathrooms?: number | null
    size_m2?: number | null
    floor?: number | null
    parking_bays?: number | null
    furnished?: boolean | null
    asking_rent_cents?: number | null
    deposit_amount_cents?: number | null
    features?: string[]
    assigned_agent_id?: string | null
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
  readonly property: SinglePropertyData
  readonly attentionItems: AttentionItem[]
  readonly recentActivity: ActivityItem[]
  readonly tier?: string
  readonly orgId?: string
  readonly tenantByUnit?: Record<string, { tenantId: string; contactId: string; name: string; initials: string }>
}

export function SinglePropertyView({ property, attentionItems, recentActivity, tier = "owner", orgId = "", tenantByUnit = {} }: Props) {
  const activeUnits = property.units.filter(u => !u.is_archived)
  const archivedUnits = property.units.filter(u => u.is_archived)

  // For the metrics strip, derive from first active unit's active lease
  const activeUnit = activeUnits[0] ?? null
  const activeLease = activeUnit?.leases.find(l => l.status === "active") ?? null
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

  // Cast units to the shape PropertyUnitsSection expects
  type UnitForSection = {
    id: string; unit_number: string; status: string; is_archived: boolean
    bedrooms: number | null; bathrooms: number | null; size_m2: number | null
    floor: number | null; parking_bays: number | null; furnished: boolean | null
    asking_rent_cents: number | null; deposit_amount_cents: number | null
    features: string[]; assigned_agent_id: string | null
  }
  const unitsForSection: UnitForSection[] = activeUnits.map(u => ({
    id: u.id,
    unit_number: u.unit_number ?? "Unit 1",
    status: u.status,
    is_archived: u.is_archived,
    bedrooms: u.bedrooms ?? null,
    bathrooms: u.bathrooms ?? null,
    size_m2: u.size_m2 ?? null,
    floor: u.floor ?? null,
    parking_bays: u.parking_bays ?? null,
    furnished: u.furnished ?? null,
    asking_rent_cents: u.asking_rent_cents ?? null,
    deposit_amount_cents: u.deposit_amount_cents ?? null,
    features: u.features ?? [],
    assigned_agent_id: u.assigned_agent_id ?? null,
  }))
  const archivedForSection: UnitForSection[] = archivedUnits.map(u => ({
    id: u.id,
    unit_number: u.unit_number ?? "Unit 1",
    status: u.status,
    is_archived: u.is_archived,
    bedrooms: u.bedrooms ?? null,
    bathrooms: u.bathrooms ?? null,
    size_m2: u.size_m2 ?? null,
    floor: u.floor ?? null,
    parking_bays: u.parking_bays ?? null,
    furnished: u.furnished ?? null,
    asking_rent_cents: u.asking_rent_cents ?? null,
    deposit_amount_cents: u.deposit_amount_cents ?? null,
    features: u.features ?? [],
    assigned_agent_id: u.assigned_agent_id ?? null,
  }))

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
        </div>

        <PropertyMap
          street={property.address_line1}
          city={property.city}
          province={property.province}
          className="rounded-xl border border-border/60 overflow-hidden min-h-44"
        />
      </div>

      {/* Body corporate */}
      {property.is_sectional_title && (
        <div className="mb-4">
          <BodyCorporateCard
            schemeName={property.managing_scheme?.company_name ?? null}
            managingAgentCompany={null}
            schemeId={property.managing_scheme?.id ?? null}
            levyCents={property.levy_amount_cents ?? null}
            levyAccount={property.levy_account_number ?? null}
          />
        </div>
      )}

      {/* Units — inline expandable panels */}
      <div className="mb-4">
        <PropertyUnitsSection
          units={unitsForSection}
          archivedUnits={archivedForSection}
          propertyId={property.id}
          propertyType={property.type ?? "residential"}
          tier={tier}
          managingAgentId={property.managing_agent_id ?? null}
          agentMap={{}}
          tenantByUnit={tenantByUnit}
          maintenanceByUnit={{}}
          orgId={orgId}
        />
      </div>

      {/* Quick actions */}
      <div className="mb-4">
        <QuickActionsCard
          propertyId={property.id}
          tier={tier}
          maintenanceCount={0}
        />
      </div>

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
