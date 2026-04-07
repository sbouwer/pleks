"use client"

import Link from "next/link"
import { LandlordPicker } from "./LandlordPicker"
import { AgentPicker } from "./AgentPicker"

interface Landlord {
  id: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
}

interface UnitSummary {
  id: string
  unit_number: string | null
  status: string
  tenantName: string | null
}

interface TeamMember {
  userId: string
  name: string
  role: string
}

interface PropertyEditSidebarProps {
  readonly propertyId: string
  readonly orgId: string
  readonly tier: string
  readonly currentLandlord: Landlord | null
  readonly allLandlords: Landlord[]
  readonly units: UnitSummary[]
  readonly teamMembers: TeamMember[]
  readonly managingAgentId: string | null
}

function UnitStatusBadge({ status }: Readonly<{ status: string }>) {
  if (status === "occupied") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600">
        Occupied
      </span>
    )
  }
  if (status === "notice") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-600">
        Notice
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-600">
      Vacant
    </span>
  )
}

export function PropertyEditSidebar({
  propertyId,
  orgId,
  tier,
  currentLandlord,
  allLandlords,
  units,
  teamMembers,
  managingAgentId,
}: PropertyEditSidebarProps) {
  const cardClass = "rounded-xl border border-border/60 bg-surface-elevated px-4 py-3"
  const headerClass =
    "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3"

  return (
    <div className="space-y-3">
      {/* Landlord card */}
      <div className={cardClass}>
        <p className={headerClass}>Landlord</p>
        <LandlordPicker
          propertyId={propertyId}
          orgId={orgId}
          landlords={allLandlords}
          current={currentLandlord}
        />
      </div>

      {/* Managing agent card (hidden for owner tier) */}
      {tier !== "owner" && (
        <div className={cardClass}>
          <p className={headerClass}>Managing agent</p>
          <AgentPicker
            propertyId={propertyId}
            currentAgentId={managingAgentId}
            teamMembers={teamMembers}
          />
        </div>
      )}

      {/* Units card */}
      <div className={cardClass}>
        <p className={headerClass}>Units ({units.length})</p>
        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground">No units yet.</p>
        ) : (
          <div className="space-y-1.5">
            {units.map((unit) => (
              <div
                key={unit.id}
                className="flex items-center justify-between gap-2 py-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {unit.unit_number ?? "Unit 1"}
                  </span>
                  <UnitStatusBadge status={unit.status} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                    {unit.tenantName ?? "Vacant"}
                  </span>
                  <Link
                    href={`/properties/${propertyId}/units/${unit.id}`}
                    className="text-xs text-brand hover:underline"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
        {tier !== "owner" && (
          <Link
            href={`/properties/${propertyId}/units/new`}
            className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-brand/50 hover:text-foreground transition-colors"
          >
            + Add unit
          </Link>
        )}
      </div>

    </div>
  )
}
