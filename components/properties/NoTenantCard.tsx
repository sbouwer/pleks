"use client"

import { useRouter } from "next/navigation"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"

interface Props {
  unitId: string
  orgId: string
}

export function NoTenantCard({ unitId, orgId }: Readonly<Props>) {
  const router = useRouter()

  function handleSelect(tenant: PickedTenant) {
    router.push(`/leases/new?unit=${unitId}&tenant=${tenant.id}`)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>
      <p className="text-sm text-muted-foreground">No tenant assigned</p>
      <TenantPicker
        orgId={orgId}
        onSelect={handleSelect}
        returnTo="/properties"
        trigger={
          <button type="button" className="text-sm text-brand hover:underline text-left">
            Add a tenant →
          </button>
        }
      />
    </div>
  )
}
