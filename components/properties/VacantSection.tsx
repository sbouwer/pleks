"use client"

import { useState } from "react"
import Link from "next/link"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import { ChevronDown, UserRound, CheckCircle2, Plus, X } from "lucide-react"

interface Props {
  propertyId: string
  unitId: string
  orgId: string
}

function SelectedTenantRow({
  label,
  tenant,
  orgId,
  onSelect,
  onRemove,
}: Readonly<{
  label: string
  tenant: PickedTenant
  orgId: string
  onSelect: (t: PickedTenant) => void
  onRemove?: () => void
}>) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle2 className="size-4 text-brand flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{tenant.name}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <TenantPicker orgId={orgId} onSelect={onSelect} returnTo="/properties"
          trigger={<button type="button" className="text-xs text-brand hover:underline">Change</button>}
        />
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-danger">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Tenant card + lease summary card for a unit with no active lease. Shares state so the lease link is pre-filled with selected tenants. */
export function VacantSection({ propertyId, unitId, orgId }: Readonly<Props>) {
  const [primary, setPrimary] = useState<PickedTenant | null>(null)
  const [coTenant, setCoTenant] = useState<PickedTenant | null>(null)
  const [showCoPicker, setShowCoPicker] = useState(false)
  const [error, setError] = useState("")

  function handleSelectPrimary(t: PickedTenant) {
    setPrimary(t)
    setError("")
    if (coTenant?.id === t.id) setCoTenant(null)
  }

  function handleSelectCo(t: PickedTenant) {
    if (t.id === primary?.id) { setError("Co-tenant must be a different person"); return }
    setCoTenant(t)
    setShowCoPicker(false)
    setError("")
  }

  function handleRemoveCo() {
    setCoTenant(null)
    setShowCoPicker(false)
  }

  const coParam = coTenant ? `&co_tenant=${coTenant.id}` : ""
  const tenantParam = primary ? `&tenant=${primary.id}${coParam}` : ""
  const leaseHref = `/leases/new?property=${propertyId}&unit=${unitId}${tenantParam}`

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Tenant card */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>

        {primary ? (
          <div className="flex flex-col gap-2">
            <SelectedTenantRow label="Primary tenant" tenant={primary} orgId={orgId} onSelect={handleSelectPrimary} />

            {coTenant && (
              <SelectedTenantRow label="Co-tenant" tenant={coTenant} orgId={orgId} onSelect={handleSelectCo} onRemove={handleRemoveCo} />
            )}
            {!coTenant && showCoPicker && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Co-tenant (optional)</p>
                  <button type="button" onClick={() => setShowCoPicker(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                </div>
                <TenantPicker orgId={orgId} onSelect={handleSelectCo} returnTo="/properties"
                  trigger={
                    <button type="button" className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                      <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </button>
                  }
                />
              </div>
            )}
            {!coTenant && !showCoPicker && (
              <button type="button" onClick={() => setShowCoPicker(true)} className="flex items-center gap-1.5 text-xs text-brand hover:underline self-start">
                <Plus className="size-3.5" /> Add co-tenant
              </button>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No tenant assigned</p>
            <TenantPicker orgId={orgId} onSelect={handleSelectPrimary} returnTo="/properties"
              trigger={
                <button type="button" className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                  <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 text-sm text-muted-foreground">Select tenant…</span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              }
            />
          </>
        )}
      </div>

      {/* Lease summary card */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Lease</p>
        <p className="text-sm text-muted-foreground">No active lease</p>
        <Link href={leaseHref} className="text-sm text-brand hover:underline">
          Create a lease →
        </Link>
      </div>
    </div>
  )
}
