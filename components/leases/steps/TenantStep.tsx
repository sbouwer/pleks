"use client"

import { useState } from "react"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, UserRound, ChevronDown } from "lucide-react"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

export function TenantStep({ data, onBack, onNext }: Readonly<Props>) {
  const { orgId } = useOrg()
  const [tenantId, setTenantId] = useState(data.tenantId)
  const [tenantName, setTenantName] = useState(data.tenantName)
  const [error, setError] = useState("")

  function handleSelect(tenant: { id: string; name: string; phone: string | null }) {
    setTenantId(tenant.id)
    setTenantName(tenant.name)
    setError("")
  }

  function handleNext() {
    if (!tenantId) { setError("Please select a tenant"); return }
    setError("")
    onNext({ tenantId, tenantName })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Tenant</h2>
        <p className="text-sm text-muted-foreground">Who is moving in?</p>
      </div>

      {tenantId && tenantName ? (
        /* Confirmed selection */
        <Card className="border-brand/30 bg-brand/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="size-5 text-brand mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">{tenantName}</p>
                  <p className="text-xs text-muted-foreground">Tenant</p>
                </div>
              </div>
              <TenantPicker
                orgId={orgId ?? ""}
                onSelect={handleSelect}
                returnTo="/leases/new"
                trigger={
                  <button type="button" className="text-xs text-brand hover:underline flex-shrink-0">
                    Change
                  </button>
                }
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Picker trigger */
        <div className="space-y-2">
          <p className="text-sm font-medium">Tenant *</p>
          <TenantPicker
            orgId={orgId ?? ""}
            onSelect={handleSelect}
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

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleNext}>Continue →</Button>
      </div>
    </div>
  )
}
