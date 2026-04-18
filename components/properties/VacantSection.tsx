"use client"

import { useState } from "react"
import Link from "next/link"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import { ChevronDown, UserRound, CheckCircle2, Plus, X, Clock } from "lucide-react"
import { setProspectiveTenants } from "@/lib/actions/units"
import { toast } from "sonner"

interface CoTenantEntry { id: string; name: string }

interface Props {
  propertyId: string
  unitId: string
  orgId: string
  initialTenantId?: string | null
  initialTenantName?: string | null
  initialCoTenants?: CoTenantEntry[]
}

function SelectedTenantRow({
  label,
  name,
  orgId,
  onSelect,
  onRemove,
}: Readonly<{
  label: string
  name: string
  orgId: string
  onSelect: (t: PickedTenant) => void
  onRemove?: () => void
}>) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <CheckCircle2 className="size-4 text-brand flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{name}</p>
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

export function VacantSection({
  propertyId, unitId, orgId,
  initialTenantId, initialTenantName,
  initialCoTenants = [],
}: Readonly<Props>) {
  const [primary, setPrimary] = useState<PickedTenant | null>(
    initialTenantId && initialTenantName ? { id: initialTenantId, name: initialTenantName, phone: null, entity_type: null, juristic_type: null, turnover_under_2m: null, asset_value_under_2m: null, size_bands_captured_at: null } : null
  )
  const [coTenants, setCoTenants] = useState<CoTenantEntry[]>(initialCoTenants)
  const [addingCo, setAddingCo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function persist(newPrimary: PickedTenant | null, newCos: CoTenantEntry[]) {
    setSaving(true)
    const result = await setProspectiveTenants(unitId, newPrimary?.id ?? null, newCos.map((c) => c.id))
    setSaving(false)
    if (result.error) toast.error(result.error)
  }

  async function handleSelectPrimary(t: PickedTenant) {
    const newCos = coTenants.filter((c) => c.id !== t.id)
    setPrimary(t)
    setCoTenants(newCos)
    setError("")
    await persist(t, newCos)
  }

  async function handleRemovePrimary() {
    setPrimary(null)
    setCoTenants([])
    setAddingCo(false)
    await persist(null, [])
  }

  async function handleSelectCo(t: PickedTenant) {
    if (t.id === primary?.id) { setError("Co-tenant must be a different person"); return }
    if (coTenants.some((c) => c.id === t.id)) { setError("This person is already added"); return }
    const newCos = [...coTenants, { id: t.id, name: t.name }]
    setCoTenants(newCos)
    setAddingCo(false)
    setError("")
    await persist(primary, newCos)
  }

  async function handleRemoveCo(id: string) {
    const newCos = coTenants.filter((c) => c.id !== id)
    setCoTenants(newCos)
    await persist(primary, newCos)
  }

  async function handleChangeCo(oldId: string, t: PickedTenant) {
    if (t.id === primary?.id) { setError("Co-tenant must be a different person"); return }
    if (coTenants.some((c) => c.id === t.id && c.id !== oldId)) { setError("This person is already added"); return }
    const newCos = coTenants.map((c) => c.id === oldId ? { id: t.id, name: t.name } : c)
    setCoTenants(newCos)
    setError("")
    await persist(primary, newCos)
  }

  const coParam = coTenants.length > 0 ? `&co_tenants=${coTenants.map((c) => c.id).join(",")}` : ""
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
            <SelectedTenantRow label="Primary tenant" name={primary.name} orgId={orgId} onSelect={handleSelectPrimary} onRemove={handleRemovePrimary} />

            {coTenants.map((co, i) => {
              const coLabel = coTenants.length > 1 ? `Co-tenant ${i + 1}` : "Co-tenant"
              return (
              <SelectedTenantRow
                key={co.id}
                label={coLabel}
                name={co.name}
                orgId={orgId}
                onSelect={(t) => { void handleChangeCo(co.id, t) }}
                onRemove={() => { void handleRemoveCo(co.id) }}
              />
              )
            })}

            {addingCo ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Co-tenant (optional)</p>
                  <button type="button" onClick={() => setAddingCo(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
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
            ) : (
              <button type="button" onClick={() => setAddingCo(true)} className="flex items-center gap-1.5 text-xs text-brand hover:underline self-start">
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No active lease</p>
        )}
        <Link href={leaseHref} className="text-sm text-brand hover:underline">
          Create a lease →
        </Link>
      </div>
    </div>
  )
}
