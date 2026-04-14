import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatZAR } from "@/lib/constants"

interface MobileLeaseInfo {
  id: string
  rentAmountCents: number
  depositAmountCents: number | null
  startDate: string | null
  endDate: string | null
  status: string
  unitNumber: string
  propertyName: string
}

interface MobileMaintenanceItem {
  id: string
  title: string
  status: string
  urgency: string | null
}

interface Props {
  tenantId: string
  displayName: string
  entityType: string
  primaryPhone: string | null
  primaryEmail: string | null
  activeLease: MobileLeaseInfo | null
  arrearsAmountCents: number | null
  activeMaintenanceRequests: MobileMaintenanceItem[]
}

const URGENCY_COLOR: Record<string, string> = {
  emergency: "text-red-600",
  urgent: "text-orange-500",
  routine: "text-muted-foreground",
  cosmetic: "text-muted-foreground",
}

export function MobileTenantView({
  tenantId,
  displayName,
  entityType,
  primaryPhone,
  primaryEmail,
  activeLease,
  arrearsAmountCents,
  activeMaintenanceRequests,
}: Readonly<Props>) {
  const inArrears = (arrearsAmountCents ?? 0) > 0

  return (
    <div className="px-4 pb-8 space-y-5">
      {/* Back nav */}
      <div className="pt-4">
        <Link href="/tenants" className="text-sm text-muted-foreground hover:text-foreground">
          ← Tenants
        </Link>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold leading-tight">{displayName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">{entityType} tenant</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {activeLease ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {activeLease.status === "notice" ? "Notice period" : "Active lease"}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">No active lease</span>
          )}
          {inArrears ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Arrears</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Good standing</span>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</p>
        {primaryPhone ? (
          <div className="flex items-center justify-between">
            <p className="text-sm">{primaryPhone}</p>
            <a href={`tel:${primaryPhone}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3">📞 Call</Button>
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No phone number</p>
        )}
        {primaryEmail && (
          <div className="flex items-center justify-between">
            <p className="text-sm truncate mr-2">{primaryEmail}</p>
            <a href={`mailto:${primaryEmail}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3 shrink-0">Email</Button>
            </a>
          </div>
        )}
      </div>

      {/* Lease */}
      <div className="border rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lease</p>
        {activeLease ? (
          <Link href={`/leases/${activeLease.id}`} className="block">
            <p className="text-sm font-medium">{activeLease.unitNumber}, {activeLease.propertyName}</p>
            <p className="text-sm text-muted-foreground">{formatZAR(activeLease.rentAmountCents)}/mo</p>
            {(activeLease.startDate || activeLease.endDate) && (
              <p className="text-xs text-muted-foreground">
                {activeLease.startDate ? new Date(activeLease.startDate).toLocaleDateString("en-ZA", { month: "short", year: "numeric" }) : ""}
                {activeLease.endDate ? ` → ${new Date(activeLease.endDate).toLocaleDateString("en-ZA", { month: "short", year: "numeric" })}` : " · Month-to-month"}
              </p>
            )}
            {activeLease.depositAmountCents != null && (
              <p className="text-xs text-muted-foreground">Deposit: {formatZAR(activeLease.depositAmountCents)}</p>
            )}
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">No active lease</p>
        )}
      </div>

      {/* Balance */}
      <div className="border rounded-xl p-4 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Balance</p>
        {inArrears ? (
          <p className="text-sm font-medium text-red-600">{formatZAR(arrearsAmountCents ?? 0)} arrears</p>
        ) : (
          <p className="text-sm text-emerald-600 font-medium">Clear ✓</p>
        )}
      </div>

      {/* Active maintenance */}
      {activeMaintenanceRequests.length > 0 && (
        <div className="border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Active maintenance ({activeMaintenanceRequests.length})
          </p>
          {activeMaintenanceRequests.map((req) => (
            <Link key={req.id} href={`/maintenance/${req.id}`} className="block py-1 border-b border-border/50 last:border-0">
              <p className={`text-sm font-medium ${URGENCY_COLOR[req.urgency ?? "routine"]}`}>{req.title}</p>
              <p className="text-xs text-muted-foreground capitalize">{req.status.replaceAll("_", " ")}</p>
            </Link>
          ))}
        </div>
      )}

      {/* View full details */}
      <Link href={`/tenants/${tenantId}`} className="block">
        <Button variant="outline" className="w-full text-sm">View full details →</Button>
      </Link>
    </div>
  )
}
