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
}: Readonly<OverviewTabProps>) {
  const totalUnits  = activeUnits.length
  const occupied    = activeUnits.filter((u) => u.status === "occupied").length
  const vacantUnits = activeUnits.filter((u) => u.status === "vacant")
  const rentRollCents = activeUnits.reduce((s, u) => s + (u.asking_rent_cents ?? 0), 0)

  // Oldest vacancy age
  const longestVacantDays = vacantUnits.reduce((max, u) => {
    if (!u.vacant_since) return max
    return Math.max(max, daysSince(u.vacant_since))
  }, 0)

  const longestStr  = longestVacantDays > 0 ? ` · ${longestVacantDays}d longest` : ""
  const occupancySub = vacantUnits.length > 0
    ? `${vacantUnits.length} vacant${longestStr}`
    : "Fully occupied"

  let buildingSub: string
  if (buildingCount > 1)      buildingSub = `${buildingCount} buildings`
  else if (buildingCount === 1) buildingSub = "1 building"
  else                          buildingSub = "No buildings"

  const landlordName = landlord
    ? (landlord.company_name?.trim() || [landlord.first_name, landlord.last_name].filter(Boolean).join(" ") || "Unknown")
    : null

  let landlordSubtitle = ""
  if (landlord) {
    landlordSubtitle = landlord.entity_type === "juristic" ? "Company / Trust" : "Individual"
  }

  const idOrRegLabel  = landlord?.entity_type === "juristic" ? "Reg. number" : "ID number"
  const idOrRegNumber = landlord?.registration_number ?? null

  const typeLabel: Record<string, string> = {
    residential: "Residential", commercial: "Commercial", mixed: "Mixed use",
  }

  const arrearsPlural    = arrearsCount !== 1 ? "s" : ""
  const arrearsTenantSub = arrearsCount > 0 ? `${arrearsCount} tenant${arrearsPlural}` : undefined

  let sectionalTitleValue: string
  if (!property.is_sectional_title)             sectionalTitleValue = "No"
  else if (property.sectional_title_number)     sectionalTitleValue = `Yes · ${property.sectional_title_number}`
  else                                          sectionalTitleValue = "Yes"

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Left: Owner / Landlord */}
        <Card className="h-full">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Owner / Landlord</span>
            {managingAgentName && (
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Managed by {managingAgentName}
              </span>
            )}
          </div>
          <CardContent className="pt-4">
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
          </CardContent>
        </Card>

        {/* Right: Property details + map stacked */}
        <div className="flex flex-col gap-4 h-full">
          <Card>
            <div className="px-4 py-3 border-b">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Property details</span>
            </div>
            <CardContent className="pt-3 pb-3">
              <KvRow label="Type" value={typeLabel[property.type ?? ""] ?? property.type ?? "—"} />
              <KvRow label="Erf number" value={property.erf_number ?? <span className="text-muted-foreground">—</span>} />
              <KvRow label="Sectional title" value={sectionalTitleValue} />
              <KvRow
                label="Managing scheme"
                value={managingScheme ?? <span className="text-muted-foreground">None</span>}
              />
              <KvRow
                label="Levy / month"
                value={
                  property.levy_amount_cents
                    ? formatZAR(property.levy_amount_cents)
                    : <span className="text-muted-foreground">N/A</span>
                }
              />
              <KvRow label="Total floor area" value={<span className="text-muted-foreground">—</span>} />
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="relative overflow-hidden flex-1" style={{ minHeight: 180 }}>
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
          </Card>
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
