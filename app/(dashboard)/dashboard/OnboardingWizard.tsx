"use client"

/**
 * app/(dashboard)/dashboard/OnboardingWizard.tsx — the unified guided-setup walk (dashboard onboarding)
 *
 * Notes:  One WizardModal whose rail is the six get-started steps. Landlord/tenant/supplier run as
 *         INLINE add-party sub-flows (usePartyFlow) — the content pane swaps, you never leave the modal.
 *         Property launches the full property wizard (PropertyWizardModal). Lease + inspection need a
 *         property + tenant first, so they're an explanation + "check it out" link rather than a dead
 *         step. Each step has "Skip for now"; on a successful create the dashboard re-fetches (progress
 *         ticks) and the walk advances to the next incomplete step. "Finish setup" stamps the org
 *         onboarding flag → the populated dashboard. ("Add me as landlord" via the 01C self-landlord is
 *         a fast follow.)
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, ClipboardCheck, Home } from "lucide-react"
import type { ReactNode } from "react"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import { usePartyFlow } from "@/components/parties/usePartyFlow"
import { PropertyWizardModal } from "@/app/(dashboard)/properties/new/PropertyWizardModal"
import { addLandlordParty, addTenantParty, addContractorParty } from "@/lib/actions/parties"
import { dismissOnboarding } from "@/lib/actions/dismissOnboarding"
import type { PartyRole } from "@/lib/parties/partyConfig"
import type { GettingStartedProgress } from "./GettingStarted"

type StepKey = keyof GettingStartedProgress

interface StepMeta {
  key:       StepKey
  label:     string
  role?:     PartyRole   // party steps run an inline sub-flow
  title:     string
  subtitle:  string
  href?:     string      // lease / inspection — "check it out"
}

const STEPS: StepMeta[] = [
  { key: "landlord",   label: "Landlord",   role: "landlord", title: "Add the owner",                 subtitle: "Who owns the property — leases and statements are issued in their name." },
  { key: "property",   label: "Property",                     title: "Add your property",             subtitle: "Sectional title, rental house, commercial — we tailor everything to how SA property works." },
  { key: "tenant",     label: "Tenant",     role: "tenant",   title: "Add a tenant",                  subtitle: "Capture FICA and POPIA consent once; reuse it across every lease." },
  { key: "lease",      label: "Lease",                        title: "Create a lease",                subtitle: "A compliant lease with escalation, deposit and CPA clauses built in.", href: "/leases/new" },
  { key: "inspection", label: "Inspection",                   title: "Schedule a move-in inspection", subtitle: "Photo-backed inspections that protect your deposit claims later.",      href: "/inspections/new" },
  { key: "supplier",   label: "Supplier",   role: "supplier", title: "Add a supplier",                subtitle: "Plumbers, electricians and contractors you assign to maintenance jobs." },
]

function ExplainPanel({ icon, lead, note }: Readonly<{ icon: ReactNode; lead: string; note: string }>) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-primary">{icon}</span>
      <p className="max-w-md text-sm leading-relaxed text-foreground">{lead}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  )
}

export function OnboardingWizard({
  open, onClose, progress, startKey,
}: Readonly<{
  open: boolean
  onClose: () => void
  progress: GettingStartedProgress
  startKey?: StepKey
}>) {
  const router = useRouter()
  const [idx, setIdx] = useState(() => {
    if (startKey) {
      const i = STEPS.findIndex((s) => s.key === startKey)
      if (i >= 0) return i
    }
    const todo = STEPS.findIndex((s) => !progress[s.key])
    return todo >= 0 ? todo : 0
  })
  const [propertyOpen, setPropertyOpen] = useState(false)
  const [finishing, startFinish] = useTransition()

  function handlePartyDone() { router.refresh(); goNext() }

  const landlordFlow = usePartyFlow({ role: "landlord", onSubmit: addLandlordParty, onDone: handlePartyDone })
  const tenantFlow   = usePartyFlow({ role: "tenant",   onSubmit: addTenantParty,   onDone: handlePartyDone })
  const supplierFlow = usePartyFlow({ role: "supplier", onSubmit: (input) => addContractorParty(input, "contractor"), onDone: handlePartyDone })
  function flowFor(role?: PartyRole) {
    if (role === "landlord") return landlordFlow
    if (role === "tenant") return tenantFlow
    if (role === "supplier") return supplierFlow
    return null
  }

  const cur = STEPS[idx]
  const flow = flowFor(cur.role)

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return
    flowFor(STEPS[i].role)?.reset()   // fresh form when (re)entering a party step
    setIdx(i)
  }
  function goNext() {
    const nextTodo = STEPS.findIndex((s, i) => i > idx && !progress[s.key])
    if (nextTodo >= 0) goTo(nextTodo)
    else if (idx + 1 < STEPS.length) goTo(idx + 1)
    else finish()
  }
  function finish() {
    startFinish(async () => { await dismissOnboarding(); router.refresh(); onClose() })
  }

  // Footer + body per step type.
  let backLabel: string, onBack: () => void, primaryLabel: string, onPrimary: () => void, body: ReactNode
  if (flow) {
    backLabel = flow.step === 0 ? "Skip for now" : "Back"
    onBack = flow.step === 0 ? goNext : flow.back
    primaryLabel = flow.primaryLabel
    onPrimary = flow.next
    body = flow.body
  } else if (cur.key === "property") {
    backLabel = "Skip for now"; onBack = goNext; primaryLabel = "Set up property"; onPrimary = () => setPropertyOpen(true)
    body = <ExplainPanel icon={<Home className="h-7 w-7" />} lead="The property wizard walks you through scheme, address, units and documents — about two minutes." note="It opens the full guided setup; you'll come back here to finish the rest." />
  } else {
    backLabel = "Skip for now"; onBack = goNext; primaryLabel = "Check it out"; onPrimary = () => { if (cur.href) router.push(cur.href) }
    body = (
      <ExplainPanel
        icon={cur.key === "lease" ? <FileText className="h-7 w-7" /> : <ClipboardCheck className="h-7 w-7" />}
        lead={cur.subtitle}
        note="You'll need a property and a tenant in place first — have a look so you know what's coming."
      />
    )
  }

  const steps: WizardModalStep[] = STEPS.map((s, i) => ({
    id: s.key,
    label: s.label,
    done: progress[s.key],
    hint: i === idx ? "In progress" : undefined,
  }))

  return (
    <>
      <WizardModal
        open={open}
        onOpenChange={(o) => { if (!o) onClose() }}
        eyebrow="Get set up"
        steps={steps}
        current={idx}
        onStepSelect={goTo}
        title={flow ? flow.title : cur.title}
        subtitle={flow ? flow.subtitle : cur.subtitle}
        backLabel={backLabel}
        onBack={onBack}
        primaryLabel={finishing ? "Finishing…" : primaryLabel}
        onPrimary={onPrimary}
        primaryDisabled={finishing || (!!flow && flow.primaryDisabled)}
        footerSlot={
          <button type="button" onClick={finish} disabled={finishing} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60">
            Finish later — go to dashboard
          </button>
        }
      >
        {body}
      </WizardModal>
      <PropertyWizardModal open={propertyOpen} onClose={() => setPropertyOpen(false)} />
    </>
  )
}
