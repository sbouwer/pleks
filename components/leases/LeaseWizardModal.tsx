"use client"

/**
 * components/leases/LeaseWizardModal.tsx — the unified lease-creation flow hosted in the 2-col WizardModal
 *
 * Route:  opened over /leases (and at /leases/new); not a page itself
 * Auth:   the save paths (createLease / createUploadedLease) enforce requireAgentWriteAccess
 * Data:   LeaseWizardContext (in-memory WizardData, prefill-driven); create actions on the final step
 * Notes:  ADDENDUM_LEASE_CREATION_MODAL Phase 1. Replaces /leases/new's LeasePathFork + the two inline-nav
 *         wizards (LeaseWizard, LeaseWizardUpload) with ONE WizardModal: four left-rail steps (Property →
 *         Building → Unit · Tenant(s) · Lease details · Create), footer-driven Continue/Back. Each content-only
 *         step registers a StepHandle (submit) via the shared ref; the footer's primary calls it. The fork
 *         moved to the end (step 4); the disclaimer gates the generate branch only (D-10). Controlled via
 *         open/onClose by a launcher; mirrors PropertyWizardModal.
 */
import { useRef, useState, useTransition } from "react"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import { usePartyFlow } from "@/components/parties/usePartyFlow"
import { addTenantParty } from "@/lib/actions/parties"
import { AddTenantProvider } from "@/app/(dashboard)/leases/new/addTenantContext"
import { LeaseWizardProvider, useLeaseWizard } from "./LeaseWizardContext"
import type { WizardPrefill } from "./wizardData"
import type { StepHandle } from "./stepHandle"
import { PropertyBuildingUnitStep } from "./steps/PropertyBuildingUnitStep"
import { TenantStep } from "./steps/TenantStep"
import { LeaseDetailsStep } from "./steps/LeaseDetailsStep"
import { CreateStep } from "./steps/CreateStep"

interface StepMeta { id: string; label: string; title: string; subtitle: string }

const STEP_META: StepMeta[] = [
  { id: "property", label: "Property",      title: "Property & unit",  subtitle: "Pick the erf, building, and unit this lease is for." },
  { id: "tenant",   label: "Tenant(s)",     title: "Tenant(s)",        subtitle: "Who is moving in?" },
  { id: "details",  label: "Lease details", title: "Lease details",    subtitle: "Terms, charges, clauses, and annexures — prefilled from the unit." },
  { id: "create",   label: "Create",        title: "Create lease",     subtitle: "Generate with Pleks, or upload a signed lease." },
]

function primaryLabel(step: number, isSaving: boolean): string {
  if (step === STEP_META.length - 1) return isSaving ? "Creating…" : "Create lease"
  return "Continue"
}

function LeaseWizardModalInner({
  onClose, disclaimerAccepted,
}: Readonly<{ onClose: () => void; disclaimerAccepted: boolean }>) {
  const { step, setStep, goNext, goBack } = useLeaseWizard()
  const [isSaving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // The current step registers its validate-then-commit handler here on every render.
  const handleRef = useRef<StepHandle | null>(null)
  const register = (handle: StepHandle) => { handleRef.current = handle }

  // ── Tenant sub-flow (Tenant step → "Add new tenant", in the same modal) — D-8 ───
  const [subflow, setSubflow] = useState<"add_tenant" | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)
  const tenantFlow = usePartyFlow({
    role: "tenant",
    onSubmit: addTenantParty,
    onDone: (result) => {
      // created → hand the new tenant back to the picker (it re-fetches on the nonce and auto-selects)
      if (result.id) setLastCreatedId(result.id)
      setRefreshNonce((n) => n + 1)
      setSubflow(null)
    },
  })
  function openAddTenant() { tenantFlow.reset(); setSubflow("add_tenant") }

  const isFirst = step === 0
  const meta = STEP_META[step]

  function renderStep() {
    switch (step) {
      case 0: return <PropertyBuildingUnitStep register={register} />
      case 1: return <TenantStep register={register} />
      case 2: return <LeaseDetailsStep register={register} />
      case 3: return <CreateStep register={register} disclaimerAccepted={disclaimerAccepted} />
      default: return null
    }
  }

  function handlePrimary() {
    setError(null)
    startSaving(async () => {
      const ok = await handleRef.current?.submit()
      if (ok === true) goNext()
    })
  }

  const steps: WizardModalStep[] = STEP_META.map((s, i) => ({
    id: s.id,
    label: s.label,
    hint: i === step ? "In progress" : undefined,
  }))

  // ── Tenant sub-flow: same modal, swapped contents (mirror PropertyWizardModal) ──
  if (subflow === "add_tenant") {
    return (
      <WizardModal
        open
        onOpenChange={(o) => { if (!o) setSubflow(null) }}   // close/Esc → back to lease, never lose the wizard
        eyebrow={tenantFlow.eyebrow}
        steps={tenantFlow.steps}
        current={tenantFlow.step}
        onStepSelect={tenantFlow.goTo}
        title={tenantFlow.title}
        subtitle={tenantFlow.subtitle}
        backLabel={tenantFlow.step === 0 ? "Back to lease" : "Back"}
        onBack={() => (tenantFlow.step === 0 ? setSubflow(null) : tenantFlow.back())}
        primaryLabel={tenantFlow.primaryLabel}
        onPrimary={tenantFlow.next}
        primaryDisabled={tenantFlow.primaryDisabled}
      >
        {tenantFlow.body}
      </WizardModal>
    )
  }

  return (
    <WizardModal
      open
      onOpenChange={(o) => { if (!o) onClose() }}
      eyebrow="Create lease"
      steps={steps}
      current={step}
      onStepSelect={(i) => { if (i < step) setStep(i) }}
      title={meta?.title ?? "Create lease"}
      subtitle={meta?.subtitle}
      backLabel={isFirst ? "Cancel" : "Back"}
      onBack={() => (isFirst ? onClose() : goBack())}
      primaryLabel={primaryLabel(step, isSaving)}
      onPrimary={handlePrimary}
      primaryDisabled={isSaving}
      footerError={error}
    >
      <AddTenantProvider value={{ openAddTenant, refreshNonce, lastCreatedId }}>
        {renderStep()}
      </AddTenantProvider>
    </WizardModal>
  )
}

export function LeaseWizardModal({
  open, onClose, prefill, renewalOf, disclaimerAccepted,
}: Readonly<{
  open: boolean
  onClose: () => void
  prefill: WizardPrefill
  renewalOf: string | null
  disclaimerAccepted: boolean
}>) {
  if (!open) return null
  return (
    <LeaseWizardProvider prefill={prefill} renewalOf={renewalOf}>
      <LeaseWizardModalInner onClose={onClose} disclaimerAccepted={disclaimerAccepted} />
    </LeaseWizardProvider>
  )
}
