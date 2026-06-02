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
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, ClipboardCheck, Home, UserCheck } from "lucide-react"
import type { ReactNode } from "react"
import { WizardModal, type WizardModalStep } from "@/components/ui/wizard-modal"
import { usePartyFlow } from "@/components/parties/usePartyFlow"
import { PropertyWizardModal } from "@/app/(dashboard)/properties/new/PropertyWizardModal"
import { addLandlordParty, addTenantParty, addContractorParty } from "@/lib/actions/parties"
import { getSelfLandlordPrefill, bindSelfLandlord } from "@/lib/actions/selfLandlord"
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

function SelfLandlordBanner({ onAdd, adding }: Readonly<{ onAdd: () => void; adding: boolean }>) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-[var(--r-button)] border border-primary/30 bg-primary/5 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--r-button)] bg-primary/10 text-primary">
        <UserCheck className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Managing your own rental?</p>
        <p className="text-xs text-muted-foreground">We&apos;ll fill the form with your details — review and complete it before saving.</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={adding}
        className="shrink-0 rounded-[var(--r-button)] border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        {adding ? "Filling…" : "Use my details"}
      </button>
    </div>
  )
}

export function OnboardingWizard({
  open, onClose, progress, startKey, isolated = false,
}: Readonly<{
  open: boolean
  onClose: () => void
  progress: GettingStartedProgress
  startKey?: StepKey
  /** isolated: do ONLY the startKey step then close (a step card). false: walk the full sequence (hero). */
  isolated?: boolean
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
  const [addingMe, startAddMe] = useTransition()
  // When the agent chose "Add me as landlord", bind the saved landlord as the 01C self-landlord.
  const selfModeRef = useRef(false)
  const [isSelf, setIsSelf] = useState(false)   // reactive twin of selfModeRef — drives hiding the welcome pack

  function handlePartyDone() { router.refresh(); goNext() }

  // "Add me as landlord" — pre-fill the landlord form from the profile so the agent can review and
  // complete it (title, ID, etc.) before saving; the save then binds it as the self-landlord mirror.
  // No welcome pack to yourself, so it's pre-set off and the prompt is hidden.
  function handleAddMe() {
    startAddMe(async () => {
      const p = await getSelfLandlordPrefill()
      if (!p.ok) return
      landlordFlow.prefill({ firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, sendWelcomePack: false })
      selfModeRef.current = true
      setIsSelf(true)
    })
  }

  const landlordFlow = usePartyFlow({
    role: "landlord",
    hideWelcomePack: isSelf,
    onSubmit: async (input) => {
      const r = await addLandlordParty(input)
      if (r.ok && r.id && selfModeRef.current) { await bindSelfLandlord(r.id); selfModeRef.current = false }
      return r
    },
    onDone: handlePartyDone,
  })
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
    if (STEPS[i].role === "landlord") { selfModeRef.current = false; setIsSelf(false) }   // drop a stale "add me" intent
    setIdx(i)
  }
  function goNext() {
    if (isolated) { finish(); return }   // one step then done — don't walk the sequence
    const nextTodo = STEPS.findIndex((s, i) => i > idx && !progress[s.key])
    if (nextTodo >= 0) goTo(nextTodo)
    else if (idx + 1 < STEPS.length) goTo(idx + 1)
    else finish()
  }
  // "I'll finish later" — a soft defer: close the walk and refresh so ticked steps show on the dashboard.
  // It does NOT dismiss onboarding; that's the dashboard's distinct "Skip setup" (an admin will do it).
  function finish() {
    startFinish(() => { router.refresh(); onClose() })
  }

  // The idx useState initializer only runs on first mount, but this wizard stays mounted (open/closed).
  // Re-sync to the requested step each time it (re)opens, so a card opens ITS step, not a stale one.
  useEffect(() => {
    if (!open) return
    const i = startKey ? STEPS.findIndex((s) => s.key === startKey) : -1
    goTo(i >= 0 ? i : Math.max(0, STEPS.findIndex((s) => !progress[s.key])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startKey])

  // Footer + body per step type. In isolation there's no sequence to skip, so the soft-back reads "Cancel".
  const skipLabel = isolated ? "Cancel" : "Skip for now"
  let backLabel: string, onBack: () => void, primaryLabel: string, onPrimary: () => void, body: ReactNode
  if (flow) {
    backLabel = flow.step === 0 ? skipLabel : "Back"
    onBack = flow.step === 0 ? goNext : flow.back
    primaryLabel = flow.primaryLabel
    onPrimary = flow.next
    // Owner step gets the "Add me as landlord" (01C self-landlord) shortcut above the form.
    body = cur.key === "landlord" && flow.step === 0
      ? <><SelfLandlordBanner onAdd={handleAddMe} adding={addingMe} />{flow.body}</>
      : flow.body
  } else if (cur.key === "property") {
    backLabel = skipLabel; onBack = goNext; primaryLabel = "Set up property"; onPrimary = () => setPropertyOpen(true)
    body = <ExplainPanel icon={<Home className="h-7 w-7" />} lead="The property wizard walks you through scheme, address, units and documents — about two minutes." note="It opens the full guided setup; you'll come back here to finish the rest." />
  } else {
    backLabel = skipLabel; onBack = goNext; primaryLabel = "Check it out"; onPrimary = () => { if (cur.href) router.push(cur.href) }
    body = (
      <ExplainPanel
        icon={cur.key === "lease" ? <FileText className="h-7 w-7" /> : <ClipboardCheck className="h-7 w-7" />}
        lead={cur.subtitle}
        note="You'll need a property and a tenant in place first — have a look so you know what's coming."
      />
    )
  }

  // Isolated: a one-step rail (just this card's step). Sequence: the full six with progress.
  const steps: WizardModalStep[] = isolated
    ? [{ id: cur.key, label: cur.label, done: progress[cur.key], hint: "In progress" }]
    : STEPS.map((s, i) => ({
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
        eyebrow={isolated ? "Add to your portfolio" : "Get set up"}
        steps={steps}
        current={isolated ? 0 : idx}
        onStepSelect={isolated ? undefined : goTo}
        title={flow ? flow.title : cur.title}
        subtitle={flow ? flow.subtitle : cur.subtitle}
        backLabel={backLabel}
        onBack={onBack}
        primaryLabel={finishing ? "Finishing…" : primaryLabel}
        onPrimary={onPrimary}
        primaryDisabled={finishing || (!!flow && flow.primaryDisabled)}
        footerSlot={isolated ? undefined : (
          <button type="button" onClick={finish} disabled={finishing} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60">
            I&apos;ll finish later
          </button>
        )}
      >
        {body}
      </WizardModal>
      <PropertyWizardModal open={propertyOpen} onClose={() => setPropertyOpen(false)} />
    </>
  )
}
