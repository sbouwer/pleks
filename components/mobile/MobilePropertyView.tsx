import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatZAR } from "@/lib/constants"

interface MobileUnit {
  id: string
  unitNumber: string
  status: string
  tenantName: string | null
  rentCents: number
  maintenanceCount: number
}

interface Props {
  propertyId: string
  name: string
  address: string
  mapsUrl: string
  type: string | null
  landlordName: string | null
  landlordPhone: string | null
  totalUnits: number
  occupiedUnits: number
  vacantUnits: number
  totalRentCents: number
  totalMaintenanceCount: number
  units: MobileUnit[]
}

const UNIT_STATUS_COLOR: Record<string, string> = {
  occupied: "text-emerald-600",
  vacant: "text-warning",
  notice: "text-purple-600",
}

export function MobilePropertyView({
  propertyId,
  name,
  address,
  mapsUrl,
  type,
  landlordName,
  landlordPhone,
  totalUnits,
  occupiedUnits,
  vacantUnits,
  totalRentCents,
  totalMaintenanceCount,
  units,
}: Readonly<Props>) {
  return (
    <div className="px-4 pb-8 space-y-5">
      {/* Back nav */}
      <div className="pt-4">
        <Link href="/properties" className="text-sm text-muted-foreground hover:text-foreground">
          ← Properties
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold leading-tight">{name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{address}</p>
        {type && <p className="text-xs text-muted-foreground capitalize mt-0.5">{type}</p>}
        <div className="flex gap-2 mt-3">
          <a href={mapsUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="h-7 text-xs px-3">📍 Maps</Button>
          </a>
          <Link href={`/properties/${propertyId}/edit`}>
            <Button size="sm" variant="outline" className="h-7 text-xs px-3">Edit</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Units</p>
          <p className="text-xl font-bold">{totalUnits}</p>
        </div>
        <div className="border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Occupied</p>
          <p className="text-xl font-bold">{occupiedUnits}<span className="text-sm font-normal text-muted-foreground">/{totalUnits}</span></p>
        </div>
        <div className="border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Vacant</p>
          <p className={`text-xl font-bold ${vacantUnits > 0 ? "text-warning" : ""}`}>{vacantUnits}</p>
        </div>
        <div className="border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">Rent roll</p>
          <p className="text-sm font-bold">{formatZAR(totalRentCents)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
        </div>
      </div>

      {/* Landlord */}
      {landlordName && (
        <div className="border rounded-xl p-4 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Landlord</p>
          <p className="text-sm font-medium">{landlordName}</p>
          {landlordPhone && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{landlordPhone}</p>
              <a href={`tel:${landlordPhone}`}>
                <Button size="sm" variant="outline" className="h-6 text-xs px-2.5">Call</Button>
              </a>
            </div>
          )}
        </div>
      )}

      {/* Units */}
      <div className="border rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Units ({totalUnits})</p>
        {units.length === 0 ? (
          <p className="text-sm text-muted-foreground">No units yet.</p>
        ) : (
          units.map((unit) => (
            <div key={unit.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{unit.unitNumber}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {unit.tenantName ?? "Vacant"}
                  {unit.rentCents > 0 ? ` · ${formatZAR(unit.rentCents)}/mo` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {unit.maintenanceCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                    {unit.maintenanceCount} job{unit.maintenanceCount === 1 ? "" : "s"}
                  </span>
                )}
                <span className={`text-xs capitalize ${UNIT_STATUS_COLOR[unit.status] ?? "text-muted-foreground"}`}>
                  {unit.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Maintenance summary */}
      {totalMaintenanceCount > 0 && (
        <div className="border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{totalMaintenanceCount} open maintenance job{totalMaintenanceCount === 1 ? "" : "s"}</p>
            <Link href={`/maintenance?property=${propertyId}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3">View</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Full details */}
      <Link href={`/properties/${propertyId}/financials`} className="block">
        <Button variant="outline" className="w-full text-sm">Financials →</Button>
      </Link>
    </div>
  )
}
