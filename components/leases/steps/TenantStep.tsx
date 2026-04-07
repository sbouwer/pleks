"use client"

import { useState } from "react"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, UserRound, ChevronDown, Plus, X } from "lucide-react"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

function TenantRow({
  label,
  tenantName,
  orgId,
  onSelect,
  onRemove,
}: Readonly<{
  label: string
  tenantName: string
  orgId: string
  onSelect: (t: PickedTenant) => void
  onRemove?: () => void
}>) {
  return (
    <Card className="border-brand/30 bg-brand/5">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-brand mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">{tenantName}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TenantPicker
              orgId={orgId}
              onSelect={onSelect}
              returnTo="/leases/new"
              trigger={
                <button type="button" className="text-xs text-brand hover:underline">
                  Change
                </button>
              }
            />
            {onRemove && (
              <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-danger ml-1">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function TenantStep({ data, onBack, onNext }: Readonly<Props>) {
  const { orgId } = useOrg()
  const [tenantId, setTenantId] = useState(data.tenantId)
  const [tenantName, setTenantName] = useState(data.tenantName)
  const [coTenantId, setCoTenantId] = useState(data.coTenantId)
  const [coTenantName, setCoTenantName] = useState(data.coTenantName)
  const [showCoTenant, setShowCoTenant] = useState(!!data.coTenantId)
  const [error, setError] = useState("")

  function handleSelectMain(t: PickedTenant) {
    setTenantId(t.id)
    setTenantName(t.name)
    setError("")
  }

  function handleSelectCo(t: PickedTenant) {
    setCoTenantId(t.id)
    setCoTenantName(t.name)
  }

  function handleRemoveCo() {
    setCoTenantId("")
    setCoTenantName("")
    setShowCoTenant(false)
  }

  function handleNext() {
    if (!tenantId) { setError("Please select a tenant"); return }
    if (coTenantId && coTenantId === tenantId) {
      setError("Co-tenant must be a different person from the main tenant")
      return
    }
    setError("")
    onNext({ tenantId, tenantName, coTenantId, coTenantName })
  }

  const org = orgId ?? ""

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Tenant</h2>
        <p className="text-sm text-muted-foreground">Who is moving in? A lease can have up to 2 tenants.</p>
      </div>

      {/* Primary tenant */}
      {tenantId && tenantName ? (
        <TenantRow
          label="Primary tenant"
          tenantName={tenantName}
          orgId={org}
          onSelect={handleSelectMain}
        />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tenant *</p>
          <TenantPicker
            orgId={org}
            onSelect={handleSelectMain}
            returnTo="/leases/new"
            trigger={
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
              >
                <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            }
          />
        </div>
      )}

      {/* Co-tenant */}
      {tenantId && (
        <>
          {showCoTenant ? (
            coTenantId && coTenantName ? (
              <TenantRow
                label="Co-tenant"
                tenantName={coTenantName}
                orgId={org}
                onSelect={handleSelectCo}
                onRemove={handleRemoveCo}
              />
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Co-tenant <span className="text-muted-foreground font-normal">(optional)</span></p>
                  <button type="button" onClick={handleRemoveCo} className="text-xs text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
                <TenantPicker
                  orgId={org}
                  onSelect={handleSelectCo}
                  returnTo="/leases/new"
                  trigger={
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </button>
                  }
                />
              </div>
            )
          ) : (
            <button
              type="button"
              onClick={() => setShowCoTenant(true)}
              className="flex items-center gap-1.5 text-sm text-brand hover:underline"
            >
              <Plus className="size-3.5" /> Add co-tenant
            </button>
          )}
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleNext}>Continue →</Button>
      </div>
    </div>
  )
}
