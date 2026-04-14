"use client"

import Link from "next/link"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
import { getExpiryUrgency, getExpiryColor } from "@/lib/leases/expiringLogic"
import { formatZAR } from "@/lib/constants"

export interface SerializedLease {
  id: string
  status: string
  lease_type: string
  start_date: string | null
  end_date: string | null
  rent_amount_cents: number
  notice_period_days: number
  is_fixed_term: boolean
  cpa_applies: boolean
  auto_renewal_notice_sent_at: string | null
  debicheck_mandate_status: string | null
  escalation_review_date: string | null
  tenant_id: string
  tenant_view: {
    id: string
    first_name: string | null
    last_name: string | null
    company_name: string | null
    entity_type: string
  } | null
  units: {
    unit_number: string
    properties: {
      name: string
      suburb: string | null
      city: string | null
    }
  } | null
  lease_co_tenants: Array<{
    tenant_id: string
    tenants: {
      id: string
      contacts: {
        first_name: string | null
        last_name: string | null
        company_name: string | null
        entity_type: string
      } | null
    } | null
  }>
  hasArrears?: boolean
}

const STATUS_STYLES: Record<string, string> = {
  active:          "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  month_to_month:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  notice:          "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  draft:           "bg-muted text-muted-foreground",
  pending_signing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  expired:         "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  cancelled:       "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
}

const STATUS_LABELS: Record<string, string> = {
  active:          "Active",
  month_to_month:  "MTM",
  notice:          "Notice",
  draft:           "Draft",
  pending_signing: "Pending",
  expired:         "Expired",
  cancelled:       "Cancelled",
}

function Avatar({ initials, size = 30 }: { initials: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand/20 font-semibold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  )
}

export function LeaseRow({ lease }: { lease: SerializedLease }) {
  const tv = lease.tenant_view
  const primary = {
    id: tv?.id ?? lease.tenant_id,
    firstName: tv?.first_name,
    lastName: tv?.last_name,
    companyName: tv?.company_name,
    entityType: tv?.entity_type,
  }

  const coTenantInputs = lease.lease_co_tenants
    .filter((ct) => ct.tenants)
    .map((ct) => ({
      id: ct.tenants!.id,
      firstName: ct.tenants!.contacts?.first_name ?? null,
      lastName: ct.tenants!.contacts?.last_name ?? null,
      companyName: ct.tenants!.contacts?.company_name ?? null,
      entityType: ct.tenants!.contacts?.entity_type ?? "individual",
    }))

  const display = buildTenantDisplay(primary, coTenantInputs)
  const hasCoTenants = display.coTenants.length > 0

  const unit = lease.units
  const propertyLabel = unit
    ? `${unit.unit_number} — ${unit.properties.name}`
    : "No unit"
  const areaLabel = unit?.properties.suburb && unit.properties.city
    ? `${unit.properties.suburb}, ${unit.properties.city}`
    : unit?.properties.city ?? ""

  // Term column calculations
  const urgency = getExpiryUrgency(lease)
  const color = getExpiryColor(urgency)
  const now = new Date()
  let progressPct = 0
  let daysRemaining = 0
  let termLabel = "Month to month"

  if (lease.start_date && lease.end_date) {
    const start = new Date(lease.start_date)
    const end = new Date(lease.end_date)
    const total = Math.max(1, (end.getTime() - start.getTime()) / 86400000)
    const elapsed = Math.max(0, (now.getTime() - start.getTime()) / 86400000)
    progressPct = Math.min(100, Math.round((elapsed / total) * 100))
    daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000))
    const notStarted = now < start
    const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "2-digit" })
    termLabel = `${fmt(start)} → ${fmt(end)}`
    if (notStarted) {
      const daysUntilStart = Math.ceil((start.getTime() - now.getTime()) / 86400000)
      termLabel = `${fmt(start)} → ${fmt(end)} · starts in ${daysUntilStart}d`
    }
  }

  return (
    <Link
      href={`/leases/${lease.id}`}
      className="grid grid-cols-[2fr_3fr_1fr_1.5fr_auto] items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
    >
      {/* Col 1: Property / Unit */}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{propertyLabel}</p>
        {areaLabel && <p className="truncate text-xs text-muted-foreground">{areaLabel}</p>}
      </div>

      {/* Col 2: Tenants */}
      <div className="flex min-w-0 items-center gap-2.5">
        {/* Avatar: pill for multi-tenant, circle for single */}
        {hasCoTenants ? (
          <div
            className="flex shrink-0 flex-col overflow-hidden rounded-full bg-brand/20"
            style={{ width: 28, minHeight: 50 }}
          >
            <div className="flex flex-1 items-center justify-center text-[10px] font-semibold text-brand">
              {display.primary.initials}
            </div>
            <div className="mx-1.5 border-t border-brand/25" />
            <div className="flex flex-1 items-center justify-center text-[9px] font-semibold text-brand/70">
              {display.coTenants.length === 1 ? display.coTenants[0].initials : `+${display.coTenants.length}`}
            </div>
          </div>
        ) : (
          <Avatar initials={display.primary.initials} size={28} />
        )}

        <div className="min-w-0 flex-1">
          {/* Tenant name — clickable independently */}
          <button
            type="button"
            className="block w-full truncate text-left text-sm font-medium hover:underline"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              window.location.href = `/tenants/${display.primary.tenantId}`
            }}
          >
            {display.displayText}
          </button>
          <p className={`text-xs ${lease.hasArrears ? "text-red-500" : "text-muted-foreground"}`}>
            {hasCoTenants ? "Tenants" : "Tenant"}
            {lease.hasArrears ? " · Arrears" : ""}
          </p>
        </div>
      </div>

      {/* Col 3: Rent */}
      <div>
        <p className="text-[15px] font-medium">{formatZAR(lease.rent_amount_cents)}</p>
        <p className="text-xs text-muted-foreground">/mo</p>
      </div>

      {/* Col 4: Term */}
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{termLabel}</p>
        {lease.end_date && (
          <>
            <div className="my-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progressPct}%`, backgroundColor: color }}
              />
            </div>
            <p className="text-[11px] font-medium" style={{ color }}>
              {(() => {
                if (urgency === "expired") return "Expired"
                if (now < new Date(lease.start_date!)) return `${Math.round((new Date(lease.end_date).getTime() - new Date(lease.start_date!).getTime()) / 86400000)}d term`
                return `${daysRemaining}d remaining`
              })()}
            </p>
          </>
        )}
      </div>

      {/* Col 5: Status */}
      <div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[lease.status] ?? STATUS_STYLES.draft}`}>
          {STATUS_LABELS[lease.status] ?? lease.status}
        </span>
      </div>
    </Link>
  )
}
