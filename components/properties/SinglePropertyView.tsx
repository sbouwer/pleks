import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Edit, Building2, MapPin, Phone, Mail } from "lucide-react"
import { EmptyState } from "@/components/shared/EmptyState"
import { BodyCorporateCard } from "./BodyCorporateCard"
import { OwnerMetrics } from "./PropertyMetrics"
import { OwnerUnitPanel } from "./OwnerUnitPanel"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { UpgradeCta } from "@/components/shared/UpgradeCta"
import { AskingRentCard } from "./AskingRentCard"
import { NoTenantCard } from "./NoTenantCard"
import { formatZAR } from "@/lib/constants"

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
    contact: { company_name: string | null } | null
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
      deposit_amount_cents?: number | null
      start_date: string
      end_date: string | null
      escalation_percent?: number | null
      escalation_review_date?: string | null
      tenant: {
        id: string
        contact: {
          first_name: string
          last_name: string
          primary_phone?: string | null
          primary_email?: string | null
        } | null
      } | null
    }[]
  }[]
}

export interface CurrentInvoice {
  total_amount_cents: number
  amount_paid_cents: number | null
  due_date: string
}

interface Props {
  readonly property: SinglePropertyData
  readonly currentInvoice?: CurrentInvoice | null
  readonly orgId?: string
}

// ── Quick action card ─────────────────────────────────────────────────────────

interface ActionCard {
  icon: string
  iconBg: string
  label: string
  sub: string
  href: string
  disabled?: boolean
}

function QuickActionCard({ action }: Readonly<{ action: ActionCard }>) {
  if (action.disabled) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-surface-elevated/60 px-4 py-3 opacity-50 cursor-not-allowed">
        <div className={`shrink-0 size-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${action.iconBg}`}>
          {action.icon}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-tight">{action.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">Coming soon</p>
        </div>
      </div>
    )
  }
  return (
    <Link href={action.href} className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface-elevated px-4 py-3 hover:border-brand/40 transition-colors">
      <div className={`shrink-0 size-7 rounded-lg flex items-center justify-center text-xs font-bold text-white ${action.iconBg}`}>
        {action.icon}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium leading-tight">{action.label}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{action.sub}</p>
      </div>
    </Link>
  )
}

// ── Tenant card ───────────────────────────────────────────────────────────────

function TenantCard({ lease }: Readonly<{
  lease: SinglePropertyData["units"][0]["leases"][0] | null
}>) {
  const tenant = lease?.tenant ?? null
  const contact = tenant?.contact ?? null

  if (!tenant || !contact) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>
        <p className="text-sm text-muted-foreground">No tenant assigned</p>
        <Link href="/tenants/new" className="text-sm text-brand hover:underline">
          Add a tenant →
        </Link>
      </div>
    )
  }

  const name = `${contact.first_name} ${contact.last_name}`.trim()
  const initials = [contact.first_name[0], contact.last_name[0]].filter(Boolean).join("").toUpperCase()
  const phone = contact.primary_phone
  const since = lease?.start_date
    ? new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
    : null

  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>
      <div className="flex items-center gap-3">
        <div className="size-9 rounded-full bg-brand/10 text-brand flex items-center justify-center text-sm font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm">{name}</p>
          {since && <p className="text-xs text-muted-foreground">Since {since}</p>}
        </div>
      </div>
      <div className="space-y-1">
        {phone && (
          <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Phone className="size-3 shrink-0" /> {phone}
          </a>
        )}
        {contact.primary_email && (
          <a href={`mailto:${contact.primary_email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Mail className="size-3 shrink-0" /> {contact.primary_email}
          </a>
        )}
      </div>
      <Link href={`/tenants/${tenant.id}`} className="text-xs text-brand hover:underline">
        View profile →
      </Link>
    </div>
  )
}

// ── Lease summary card ────────────────────────────────────────────────────────

function LeaseSummaryCard({ lease, unitId }: Readonly<{
  lease: SinglePropertyData["units"][0]["leases"][0] | null
  unitId: string
}>) {
  if (!lease) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Lease</p>
        <p className="text-sm text-muted-foreground">No active lease</p>
        <Link href={`/leases/new?unit=${unitId}`} className="text-sm text-brand hover:underline">
          Create a lease →
        </Link>
      </div>
    )
  }

  const start = new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })
  const end = lease.end_date
    ? new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })
    : "Month to month"

  // Next payment due: approximate as first of next month
  const now = new Date()
  const nextDue = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextDueLabel = nextDue.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })

  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Lease</p>
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Monthly rent</span>
          <span className="font-medium">{formatZAR(lease.rent_amount_cents)}</span>
        </div>
        {lease.deposit_amount_cents != null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deposit held</span>
            <span className="font-medium">{formatZAR(lease.deposit_amount_cents)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Period</span>
          <span className="font-medium">{start} – {end}</span>
        </div>
        {lease.escalation_percent != null && lease.escalation_review_date && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Escalation</span>
            <span className="font-medium">
              {lease.escalation_percent}% on{" "}
              {new Date(lease.escalation_review_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Next due</span>
          <span className="font-medium">{nextDueLabel}</span>
        </div>
      </div>
      <Link href={`/leases/${lease.id}`} className="text-xs text-brand hover:underline">
        View lease →
      </Link>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SinglePropertyView({ property, currentInvoice = null, orgId = "" }: Props) {
  const activeUnit = property.units.find(u => !u.is_archived) ?? null
  const activeLease = activeUnit?.leases.find(l => l.status === "active" || l.status === "notice") ?? null
  const leaseEndDate = activeLease?.end_date ?? null
  const unitStatus = activeUnit?.status ?? null
  const hasActiveLease = activeLease != null

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [property.address_line1, property.suburb, property.city, property.province].filter(Boolean).join(", ")
  )}`

  // Unit shape for UnitExpandPanel
  const unitForPanel = activeUnit ? {
    id: activeUnit.id,
    unit_number: activeUnit.unit_number ?? "Unit 1",
    status: activeUnit.status,
    bedrooms: activeUnit.bedrooms ?? null,
    bathrooms: activeUnit.bathrooms ?? null,
    size_m2: activeUnit.size_m2 ?? null,
    floor: activeUnit.floor ?? null,
    parking_bays: activeUnit.parking_bays ?? null,
    furnished: activeUnit.furnished ?? null,
    asking_rent_cents: activeUnit.asking_rent_cents ?? null,
    deposit_amount_cents: activeUnit.deposit_amount_cents ?? null,
    features: activeUnit.features ?? [],
    assigned_agent_id: activeUnit.assigned_agent_id ?? null,
  } : null

  // Quick actions — contextual
  const isOccupied = unitStatus === "occupied" || unitStatus === "notice"
  const occupiedActions: ActionCard[] = [
    { icon: "R", iconBg: "bg-green-500", label: "Record payment", sub: "Log this month's rent", href: "", disabled: true },
    { icon: "I", iconBg: "bg-blue-500", label: "Schedule inspection", sub: "Routine or move-out", href: `/inspections/new?unit=${activeUnit?.id ?? ""}` },
    { icon: "M", iconBg: "bg-amber-500", label: "Log maintenance", sub: "Report a problem", href: `/maintenance/new?unit=${activeUnit?.id ?? ""}` },
    { icon: "D", iconBg: "bg-purple-500", label: "View deposit", sub: activeLease?.deposit_amount_cents ? `${formatZAR(activeLease.deposit_amount_cents)} held` : "Deposit details", href: "", disabled: true },
    { icon: "S", iconBg: "bg-blue-400", label: "Send notice", sub: "Renewal or termination", href: "", disabled: true },
    { icon: "E", iconBg: "bg-green-400", label: "Export documents", sub: "Lease, statement, receipts", href: `/reports?property=${property.id}` },
  ]
  const vacantActions: ActionCard[] = [
    { icon: "I", iconBg: "bg-blue-500", label: "Schedule inspection", sub: "Pre-listing or move-in", href: `/inspections/new?unit=${activeUnit?.id ?? ""}` },
    { icon: "A", iconBg: "bg-amber-500", label: "Create listing", sub: "Advertise your unit", href: "", disabled: true },
    // "Set asking rent" rendered separately as AskingRentCard below
    { icon: "M", iconBg: "bg-amber-400", label: "Log maintenance", sub: "Report a problem", href: `/maintenance/new?unit=${activeUnit?.id ?? ""}` },
    { icon: "B", iconBg: "bg-green-500", label: "Update branding", sub: "Logo and document style", href: "/settings/branding" },
    { icon: "E", iconBg: "bg-green-400", label: "Edit property", sub: "Details and address", href: `/properties/${property.id}/edit` },
  ]
  const quickActions = isOccupied ? occupiedActions : vacantActions

  const STATUS_MAP: Record<string, "active" | "pending" | "open"> = { occupied: "active", notice: "pending", vacant: "open" }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="font-heading text-3xl">My property</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <span>{property.name}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{property.address_line1}, {property.city}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="capitalize">{property.type}</span>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-brand transition-colors">
              <MapPin className="size-3.5" />
            </a>
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href={`/properties/${property.id}/edit`} />}>
          <Edit className="size-3.5 mr-1.5" /> Edit property
        </Button>
      </div>

      {/* Metrics strip — 3 cards */}
      <OwnerMetrics
        unitStatus={unitStatus}
        leaseEndDate={leaseEndDate}
        currentInvoice={currentInvoice}
      />

      {/* Body corporate */}
      {property.is_sectional_title && (
        <div className="mb-4">
          <BodyCorporateCard
            schemeName={property.managing_scheme?.contact?.company_name ?? null}
            managingAgentCompany={null}
            schemeId={property.managing_scheme?.id ?? null}
            levyCents={property.levy_amount_cents ?? null}
            levyAccount={property.levy_account_number ?? null}
          />
        </div>
      )}

      {/* Your unit — always expanded */}
      {unitForPanel && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Your unit</p>
          <div className="rounded-xl border border-border/60 bg-surface-elevated overflow-hidden">
            {/* Unit header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm">{unitForPanel.unit_number}</span>
                <StatusBadge status={STATUS_MAP[unitForPanel.status] ?? "open"} />
                {unitForPanel.bedrooms != null && (
                  <span className="text-xs text-muted-foreground">
                    {unitForPanel.bedrooms} bed · {unitForPanel.bathrooms ?? "—"} bath
                    {unitForPanel.size_m2 != null && ` · ${unitForPanel.size_m2} m²`}
                  </span>
                )}
              </div>
            </div>
            {/* Always-expanded panel */}
            <OwnerUnitPanel
              unit={unitForPanel}
              propertyId={property.id}
              propertyType={property.type ?? "residential"}
              hasActiveLease={hasActiveLease}
            />
          </div>
        </div>
      )}

      {/* Tenant + Lease summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {activeLease ? (
          <TenantCard lease={activeLease} />
        ) : (
          <NoTenantCard unitId={activeUnit?.id ?? ""} orgId={orgId} />
        )}
        <LeaseSummaryCard lease={activeLease} unitId={activeUnit?.id ?? ""} />
      </div>

      {/* Quick actions — 2×3 contextual grid */}
      <div className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Quick actions</p>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map(action => (
            <QuickActionCard key={action.label} action={action} />
          ))}
          {!isOccupied && activeUnit && (
            <AskingRentCard
              unitId={activeUnit.id}
              currentRentCents={activeUnit.asking_rent_cents ?? null}
            />
          )}
        </div>
      </div>

      {/* Upgrade CTA — compact horizontal bar */}
      <UpgradeCta
        title="Managing more properties?"
        description="Upgrade to Steward for up to 20 units."
        dismissKey="owner-upgrade-cta"
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
