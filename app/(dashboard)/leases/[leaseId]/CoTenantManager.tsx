"use client"

import { useState, useTransition } from "react"
import { X, UserPlus } from "lucide-react"
import Link from "next/link"
import { TenantPicker, type PickedTenant } from "@/components/shared/TenantPicker"
import { addLeaseCoTenant, removeLeaseCoTenant } from "@/lib/actions/leases"

interface CoTenantEntry {
  tenantId: string
  name: string
  email: string | null
  phone: string | null
}

interface CoTenantManagerProps {
  leaseId: string
  orgId: string
  coTenants: CoTenantEntry[]
  primaryTenantId: string
}

export function CoTenantManager({ leaseId, orgId, coTenants, primaryTenantId }: Readonly<CoTenantManagerProps>) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAdd(tenant: PickedTenant) {
    if (tenant.id === primaryTenantId) {
      setError("Cannot add the primary tenant as a co-tenant")
      return
    }
    if (coTenants.some((ct) => ct.tenantId === tenant.id)) {
      setError("This tenant is already a co-tenant on this lease")
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await addLeaseCoTenant(leaseId, tenant.id)
      if ("error" in res) setError(res.error)
    })
  }

  function handleRemove(tenantId: string) {
    setError(null)
    startTransition(async () => {
      const res = await removeLeaseCoTenant(leaseId, tenantId)
      if ("error" in res) setError(res.error)
    })
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Co-tenants</p>
        <TenantPicker
          orgId={orgId}
          onSelect={handleAdd}
          trigger={
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              disabled={pending}
            >
              <UserPlus className="h-3 w-3" />
              Add
            </button>
          }
        />
      </div>

      {error && (
        <p className="mb-2 text-xs text-destructive">{error}</p>
      )}

      {coTenants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No co-tenants</p>
      ) : (
        <div className="space-y-2">
          {coTenants.map((ct) => (
            <div key={ct.tenantId} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                {ct.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/tenants/${ct.tenantId}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {ct.name}
                </Link>
                {ct.email && (
                  <p className="text-xs text-muted-foreground truncate">{ct.email}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(ct.tenantId)}
                disabled={pending}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                title="Remove co-tenant"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
