"use client"

import { useState, useMemo } from "react"
import { useOrg } from "@/hooks/useOrg"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, UserRound, ChevronDown, Plus, X } from "lucide-react"
import { TenantPicker } from "@/components/shared/TenantPicker"
import type { PickedTenant } from "@/components/shared/TenantPicker"
import type { WizardData, CoTenant } from "../LeaseWizard"
import { updateContactJuristicFields } from "@/lib/actions/contacts"

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
            <TenantPicker orgId={orgId} onSelect={onSelect} returnTo="/leases/new"
              trigger={<button type="button" className="text-xs text-brand hover:underline">Change</button>}
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
  const [coTenants, setCoTenants] = useState<CoTenant[]>(data.coTenants)
  const [addingCo, setAddingCo] = useState(false)
  const [error, setError] = useState("")

  const org = orgId ?? ""

  const [tenantIsJuristic, setTenantIsJuristic] = useState(data.tenantIsJuristic)
  const [isFranchiseAgreement, setIsFranchiseAgreement] = useState(data.isFranchiseAgreement)
  const [tenantJuristicType, setTenantJuristicType] = useState(data.tenantJuristicType)
  const [turnoverUnder2m, setTurnoverUnder2m] = useState(data.tenantTurnoverUnder2m)
  const [assetUnder2m, setAssetUnder2m] = useState(data.tenantAssetUnder2m)
  const [sizeBandsCapturedAt, setSizeBandsCapturedAt] = useState(data.tenantSizeBandsCapturedAt)
  const [savingBands, setSavingBands] = useState(false)

  const isSoleProp = tenantJuristicType === "sole_proprietor"
  const bandsStale = useMemo(() => {
    if (!sizeBandsCapturedAt) return false
    // eslint-disable-next-line react-hooks/purity
    return Date.now() - new Date(sizeBandsCapturedAt).getTime() > 365 * 24 * 60 * 60 * 1000
  }, [sizeBandsCapturedAt])
  const showBandsPrompt = tenantIsJuristic && !isSoleProp && (turnoverUnder2m === null || assetUnder2m === null || bandsStale)
  const showFranchiseFlag = tenantIsJuristic && !isSoleProp && tenantId !== ""

  function handleSelectMain(t: PickedTenant) {
    setTenantId(t.id)
    setTenantName(t.name)
    const isJuristic = t.entity_type !== "individual" && t.entity_type !== null
    setTenantIsJuristic(isJuristic)
    setTenantJuristicType(t.juristic_type)
    setTurnoverUnder2m(t.turnover_under_2m)
    setAssetUnder2m(t.asset_value_under_2m)
    setSizeBandsCapturedAt(t.size_bands_captured_at)
    setCoTenants((prev) => prev.filter((c) => c.id !== t.id))
    setError("")
  }

  async function handleSaveBands() {
    if (!tenantId) return
    setSavingBands(true)
    await updateContactJuristicFields({
      contactId: tenantId,
      juristicType: tenantJuristicType,
      turnoverUnder2m,
      assetValueUnder2m: assetUnder2m,
    })
    setSavingBands(false)
    setSizeBandsCapturedAt(new Date().toISOString())
  }

  function handleSelectCo(t: PickedTenant) {
    if (t.id === tenantId) { setError("Co-tenant must be a different person from the main tenant"); return }
    if (coTenants.some((c) => c.id === t.id)) { setError("This person is already added"); return }
    setCoTenants((prev) => [...prev, { id: t.id, name: t.name }])
    setAddingCo(false)
    setError("")
  }

  function handleRemoveCo(id: string) {
    setCoTenants((prev) => prev.filter((c) => c.id !== id))
  }

  function handleNext() {
    if (!tenantId) { setError("Please select a tenant"); return }
    if (showBandsPrompt && !savingBands) {
      setError("Confirm the tenant's annual turnover and asset value before continuing.")
      return
    }
    setError("")
    onNext({
      tenantId,
      tenantName,
      coTenants,
      tenantIsJuristic,
      isFranchiseAgreement,
      tenantJuristicType,
      tenantTurnoverUnder2m: turnoverUnder2m,
      tenantAssetUnder2m: assetUnder2m,
      tenantSizeBandsCapturedAt: sizeBandsCapturedAt,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Tenant</h2>
        <p className="text-sm text-muted-foreground">Who is moving in?</p>
      </div>

      {/* Primary tenant */}
      {tenantId && tenantName ? (
        <TenantRow label="Primary tenant" tenantName={tenantName} orgId={org} onSelect={handleSelectMain} />
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Tenant *</p>
          <TenantPicker orgId={org} onSelect={handleSelectMain} returnTo="/leases/new"
            trigger={
              <button type="button" className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
                <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
            }
          />
        </div>
      )}

      {/* Co-tenants (unlimited) */}
      {tenantId && (
        <div className="space-y-3">
          {coTenants.map((co, i) => (
            <TenantRow
              key={co.id}
              label={`Co-tenant ${coTenants.length > 1 ? i + 1 : ""}`}
              tenantName={co.name}
              orgId={org}
              onSelect={(t) => {
                if (t.id === tenantId) { setError("Co-tenant must be a different person"); return }
                if (coTenants.some((c) => c.id === t.id && c.id !== co.id)) { setError("This person is already added"); return }
                setCoTenants((prev) => prev.map((c) => c.id === co.id ? { id: t.id, name: t.name } : c))
                setError("")
              }}
              onRemove={() => handleRemoveCo(co.id)}
            />
          ))}

          {addingCo ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Co-tenant <span className="text-muted-foreground font-normal">(optional)</span></p>
                <button type="button" onClick={() => setAddingCo(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
              <TenantPicker orgId={org} onSelect={handleSelectCo} returnTo="/leases/new"
                trigger={
                  <button type="button" className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-surface-elevated px-3 py-2.5 text-left hover:bg-muted/30 transition-colors">
                    <UserRound className="size-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 text-sm text-muted-foreground">Search tenants…</span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                }
              />
            </div>
          ) : (
            <button type="button" onClick={() => setAddingCo(true)} className="flex items-center gap-1.5 text-sm text-brand hover:underline">
              <Plus className="size-3.5" /> Add co-tenant
            </button>
          )}
        </div>
      )}

      {/* Franchise flag — only for juristic non-sole-prop tenants */}
      {showFranchiseFlag && (
        <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
          <p className="text-sm font-medium">Is this a franchise agreement?</p>
          <p className="text-xs text-muted-foreground">
            Franchise agreements have full CPA protection regardless of tenant size (CPA s5(6)).
          </p>
          <div className="flex gap-4">
            {(["yes", "no"] as const).map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={isFranchiseAgreement === (v === "yes")}
                  onChange={() => setIsFranchiseAgreement(v === "yes")}
                  className="accent-brand"
                />
                {v === "yes" ? "Yes — franchise agreement" : "No"}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Stale / missing size bands — only for juristic non-franchise non-sole-prop */}
      {showBandsPrompt && !isFranchiseAgreement && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 space-y-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Confirm {tenantName}&apos;s size for CPA determination
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {bandsStale ? "Size bands are over 12 months old — please re-confirm." : "Size bands not yet captured."}
          </p>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-xs font-medium">Annual turnover</p>
              <div className="flex gap-4">
                {([["true", "Below R2m"], ["false", "R2m or more"]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={String(turnoverUnder2m) === v}
                      onChange={() => setTurnoverUnder2m(v === "true")}
                      className="accent-brand"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">Asset value</p>
              <div className="flex gap-4">
                {([["true", "Below R2m"], ["false", "R2m or more"]] as const).map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={String(assetUnder2m) === v}
                      onChange={() => setAssetUnder2m(v === "true")}
                      className="accent-brand"
                    />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          </div>
          {turnoverUnder2m !== null && assetUnder2m !== null && (
            <button
              type="button"
              onClick={handleSaveBands}
              disabled={savingBands}
              className="text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:no-underline disabled:opacity-50"
            >
              {savingBands ? "Saving…" : "Save and continue"}
            </button>
          )}
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
