"use client"

import { useState } from "react"
import Link from "next/link"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import { ChevronDown, UserRound, CheckCircle2, Plus, X, Clock } from "lucide-react"
import { setProspectiveTenants } from "@/lib/actions/units"
import { toast } from "sonner"

interface Props {
  propertyId: string
  unitId: string
  orgId: string
  initialTenantId?: string | null
  initialTenantName?: string | null
  initialCoTenantId?: string | null
  initialCoTenantName?: string | null
}

function toPickedTenant(id: string | null | undefined, name: string | null | undefined): PickedTenant | null {
  if (!id || !name) return null
  return { id, name, phone: null }
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

/** Tenant card + lease summary for a unit with no active lease. Persists prospective tenant selections to the DB so all team members see the same state. */
export function VacantSection({
  propertyId, unitId, orgId,
  initialTenantId, initialTenantName,
  initialCoTenantId, initialCoTenantName,
}: Readonly<Props>) {
  const [primary, setPrimary] = useState<PickedTenant | null>(() => toPickedTenant(initialTenantId, initialTenantName))
  const [coTenant, setCoTenant] = useState<PickedTenant | null>(() => toPickedTenant(initialCoTenantId, initialCoTenantName))
  const [showCoPicker, setShowCoPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function persist(newPrimary: PickedTenant | null, newCo: PickedTenant | null) {
    setSaving(true)
    const result = await setProspectiveTenants(unitId, newPrimary?.id ?? null, newCo?.id ?? null)
    setSaving(false)
    if (result.error) toast.error(result.error)
  }

  async function handleSelectPrimary(t: PickedTenant) {
    const newCo = coTenant?.id === t.id ? null : coTenant
    setPrimary(t)
    setCoTenant(newCo)
    setError("")
    await persist(t, newCo)
  }

  async function handleSelectCo(t: PickedTenant) {
    if (t.id === primary?.id) { setError("Co-tenant must be a different person"); return }
    setCoTenant(t)
    setShowCoPicker(false)
    setError("")
    await persist(primary, t)
  }

  async function handleRemovePrimary() {
    setPrimary(null)
    setCoTenant(null)
    setShowCoPicker(false)
    await persist(null, null)
  }

  async function handleRemoveCo() {
    setCoTenant(null)
    setShowCoPicker(false)
    await persist(primary, null)
  }

  const coParam = coTenant ? `&co_tenant=${coTenant.id}` : ""
  const tenantParam = primary ? `&tenant=${primary.id}${coParam}` : ""
  const leaseHref = `/leases/new?property=${propertyId}&unit=${unitId}${tenantParam}`

  const hasProspective = !!primary

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Tenant card */}
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Tenant</p>
          {saving && <span className="text-[10px] text-muted-foreground animate-pulse">Saving…</span>}
        </div>

        {primary ? (
          <div className="flex flex-col gap-2">
            <SelectedTenantRow label="Primary tenant" tenant={primary} orgId={orgId} onSelect={handleSelectPrimary} onRemove={handleRemovePrimary} />

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
        {hasProspective ? (
          <>
            <div className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
              <Clock className="size-3.5 flex-shrink-0" />
              <span className="font-medium">Finalising lease</span>
            </div>
            <p className="text-xs text-muted-foreground">Tenant selected — complete the lease to activate.</p>
            <Link href={leaseHref} className="text-sm text-brand hover:underline">
              Create a lease →
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No active lease</p>
            <Link href={leaseHref} className="text-sm text-brand hover:underline">
              Create a lease →
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
