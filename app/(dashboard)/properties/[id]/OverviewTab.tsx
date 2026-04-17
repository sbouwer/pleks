import { Card, CardContent } from "@/components/ui/card"
import { ContactCard } from "@/components/contacts/ContactCard"
import { formatZAR } from "@/lib/constants"
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverviewLandlord {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  entity_type?: string | null
  email?: string | null
  phone?: string | null
  registration_number?: string | null
}

export interface OverviewUnit {
  id: string
  status: string
  asking_rent_cents: number | null
  vacant_since?: string | null
}

export interface RecentActivityItem {
  id: string
  colour: "green" | "red" | "blue" | "amber" | "purple"
  label: string
  sub?: string | null
  date: string
}

interface OverviewTabProps {
  propertyId: string
  property: {
    type: string | null
    erf_number: string | null
    sectional_title_number: string | null
    is_sectional_title: boolean | null
    levy_amount_cents: number | null
    description: string | null
    insurance_provider: string | null
    insurance_renewal_date: string | null
  }
  landlord: OverviewLandlord | null
  activeUnits: OverviewUnit[]
  buildingCount: number
  arrearsCents: number
  arrearsCount: number
  mapsQuery: string
  googleMapsUrl: string
  managingAgentName: string | null
  activity: RecentActivityItem[]
  managingScheme: string | null
  hasManagingScheme: boolean
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, valueClass }: Readonly<{
  label: string; value: string; sub?: string | null; valueClass?: string
}>) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={cn("font-heading text-xl font-bold", valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function KvRow({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  )
}

const DOT_COLOUR: Record<RecentActivityItem["colour"], string> = {
  green:  "bg-emerald-500",
  red:    "bg-red-500",
  blue:   "bg-blue-500",
  amber:  "bg-amber-500",
  purple: "bg-violet-500",
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function buildingSubLabel(count: number): string {
  if (count > 1)    return `${count} buildings`
  if (count === 1)  return "1 building"
  return "No buildings"
}

function sectionalTitleLabel(isSectional: boolean | null, titleNumber: string | null): string {
  if (!isSectional)  return "No"
  if (titleNumber)   return `Yes · ${titleNumber}`
  return "Yes"
}

function occupancySubLabel(vacantUnits: OverviewUnit[]): string {
  if (vacantUnits.length === 0) return "Fully occupied"
  const longestDays = vacantUnits.reduce(
    (max, u) => (u.vacant_since ? Math.max(max, daysSince(u.vacant_since)) : max),
    0,
  )
  const suffix = longestDays > 0 ? ` · ${longestDays}d longest` : ""
  return `${vacantUnits.length} vacant${suffix}`
}

function landlordDisplayInfo(landlord: OverviewLandlord | null) {
  if (!landlord) return { name: null, subtitle: "", idOrRegLabel: "ID number", idOrRegNumber: null }
  const name = landlord.company_name?.trim()
    || [landlord.first_name, landlord.last_name].filter(Boolean).join(" ")
    || "Unknown"
  const isJuristic = landlord.entity_type === "juristic"
  return {
    name,
    subtitle:       isJuristic ? "Company / Trust" : "Individual",
    idOrRegLabel:   isJuristic ? "Reg. number" : "ID number",
    idOrRegNumber:  landlord.registration_number ?? null,
  }
}

const TYPE_LABELS: Record<string, string> = {
  residential: "Residential", commercial: "Commercial", mixed: "Mixed use",
}

// ── Main component ────────────────────────────────────────────────────────────

export function OverviewTab({
  propertyId,
  property,
  landlord,
  activeUnits,
  buildingCount,
  arrearsCents,
  arrearsCount,
  mapsQuery,
  googleMapsUrl,
  managingAgentName,
  activity,
  managingScheme,
  hasManagingScheme,
}: Readonly<OverviewTabProps>) {
  const totalUnits    = activeUnits.length
  const occupied      = activeUnits.filter((u) => u.status === "occupied").length
  const vacantUnits   = activeUnits.filter((u) => u.status === "vacant")
  const rentRollCents = activeUnits.reduce((s, u) => s + (u.asking_rent_cents ?? 0), 0)

  const occupancySub = occupancySubLabel(vacantUnits)
  const buildingSub  = buildingSubLabel(buildingCount)

  const { name: landlordName, subtitle: landlordSubtitle, idOrRegLabel, idOrRegNumber } =
    landlordDisplayInfo(landlord)

  const arrearsSuffix    = arrearsCount === 1 ? "" : "s"
  const arrearsTenantSub = arrearsCount > 0 ? `${arrearsCount} tenant${arrearsSuffix}` : undefined

  const sectionalTitleValue = sectionalTitleLabel(
    property.is_sectional_title,
    property.sectional_title_number,
  )

  const insuranceRenewalDate = property.insurance_renewal_date
    ? new Date(property.insurance_renewal_date).toLocaleDateString("en-ZA", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null
  const insurancePeekLabel = insuranceRenewalDate
    ? `${property.insurance_provider} · renews ${insuranceRenewalDate}`
    : (property.insurance_provider ?? null)

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total units"
          value={String(totalUnits)}
          sub={buildingSub}
        />
        <StatCard
          label="Occupancy"
          value={`${occupied}/${totalUnits}`}
          sub={occupancySub}
          valueClass={vacantUnits.length > 0 ? "text-warning" : undefined}
        />
        <StatCard
          label="Monthly rent roll"
          value={formatZAR(rentRollCents)}
        />
        <StatCard
          label="Arrears"
          value={arrearsCents > 0 ? formatZAR(arrearsCents) : "—"}
          sub={arrearsTenantSub}
          valueClass={arrearsCents > 0 ? "text-danger" : undefined}
        />
      </div>

      {/* Two-column cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Owner / Landlord */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Owner / Landlord</span>
            {managingAgentName && (
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Managed by {managingAgentName}
              </span>
            )}
          </div>
          <div className="p-4">
            {landlordName ? (
              <ContactCard
                name={landlordName}
                subtitle={landlordSubtitle}
                avatarVariant="blue"
                email={landlord?.email ?? null}
                phone={landlord?.phone ?? null}
                showInfo
                entityType={landlord?.entity_type ?? null}
                idOrRegLabel={idOrRegLabel}
                idOrRegNumber={idOrRegNumber}
                profileHref={landlord ? `/contacts/${landlord.id}` : undefined}
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No landlord assigned.</p>
                <Link
                  href={`/properties/${propertyId}?tab=overview`}
                  className="text-xs text-brand hover:underline"
                >
                  Assign landlord →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right: Property details + map stacked */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Property details</span>
            </div>
            <div className="px-4 py-3">
              <KvRow label="Type" value={TYPE_LABELS[property.type ?? ""] ?? property.type ?? "—"} />
              <KvRow label="Erf number" value={property.erf_number ?? <span className="text-muted-foreground">—</span>} />
              <KvRow label="Sectional title" value={sectionalTitleValue} />
              {hasManagingScheme && managingScheme && (
                <KvRow label="Managing scheme" value={managingScheme} />
              )}
              <KvRow
                label="Levy / month"
                value={
                  property.levy_amount_cents
                    ? formatZAR(property.levy_amount_cents)
                    : <span className="text-muted-foreground">N/A</span>
                }
              />
              <KvRow
                label="Insurance"
                value={
                  insurancePeekLabel ??
                  <Link href={`/properties/${propertyId}?tab=insurance`} className="text-brand hover:underline text-xs">Add policy →</Link>
                }
              />
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 rounded-xl border bg-card relative overflow-hidden" style={{ minHeight: 180 }}>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2 right-2 z-10 flex items-center gap-1 text-xs bg-background/90 backdrop-blur-sm border rounded px-2 py-1 hover:bg-background transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open in Maps
            </a>
            <iframe
              title="Property location"
              className="absolute inset-0 w-full h-full block"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://maps.google.com/maps?q=${mapsQuery}&output=embed&z=15`}
            />
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <Card>
          <div className="px-4 py-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Recent activity</span>
          </div>
          <CardContent className="pt-3 pb-2">
            <div className="space-y-0">
              {activity.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                  <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", DOT_COLOUR[item.colour])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{item.label}</p>
                    {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {new Date(item.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
