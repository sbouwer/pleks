"use client"

import { useState } from "react"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import { ChevronDown, UserRound, CheckCircle2 } from "lucide-react"
import Link from "next/link"

interface Props {
  unitId: string
  propertyId: string
  orgId: string
}

export function NoTenantCard({ unitId, propertyId, orgId }: Readonly<Props>) {
  const [selected, setSelected] = useState<PickedTenant | null>(null)

  const leaseHref = selected
    ? `/leases/new?property=${propertyId}&unit=${unitId}&tenant=${selected.id}`
    : ""

  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>

      {selected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-brand flex-shrink-0" />
            <span className="text-sm font-medium">{selected.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href={leaseHref} className="text-sm text-brand hover:underline">
              Create lease →
            </Link>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">No tenant assigned</p>
          <TenantPicker
            orgId={orgId}
            onSelect={setSelected}
            returnTo="/properties"
            trigger={
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm text-muted-foreground">Select tenant…</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            }
          />
        </>
      )}
    </div>
  )
}
