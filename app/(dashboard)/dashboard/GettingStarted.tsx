"use client"

/**
 * app/(dashboard)/dashboard/GettingStarted.tsx — new-user empty-state onboarding (dashboard)
 *
 * Route:  /dashboard (rendered when onboarding is not yet dismissed)
 * Notes:  The door-grammar "get you set up" block: a welcome hero, a progress meter, and six step
 *         cards (landlord → property → tenant → lease → inspection → supplier). The hero "Get started"
 *         and each card open the unified OnboardingWizard at that step (the single-modal guided walk).
 *         `done` flags come from live counts; Skip/Finish stamp the org onboarding flag → populated.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Shield, ArrowRight, Check, UserSquare2, Home, Users, FileText, ClipboardCheck, HardHat } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { dismissOnboarding } from "@/lib/actions/dismissOnboarding"
import { OnboardingWizard } from "./OnboardingWizard"

export interface GettingStartedProgress {
  landlord:   boolean
  property:   boolean
  tenant:     boolean
  lease:      boolean
  inspection: boolean
  supplier:   boolean
}

type StepKey = keyof GettingStartedProgress

interface Step {
  key:   StepKey
  step:  string
  icon:  LucideIcon
  title: string
  desc:  string
  cta:   string
}

const STEPS: Step[] = [
  { key: "landlord",   step: "Step 01", icon: UserSquare2,   title: "Add a landlord",                desc: "Individuals, companies and trusts — with payout accounts for owner statements.",          cta: "Add a landlord" },
  { key: "property",   step: "Step 02", icon: Home,          title: "Add your first property",       desc: "Sectional title, rental house, commercial — we tailor everything to how SA property works.", cta: "Start guided setup" },
  { key: "tenant",     step: "Step 03", icon: Users,         title: "Add a tenant",                  desc: "Capture FICA and POPIA consent once; reuse it across every lease.",                        cta: "Add a tenant" },
  { key: "lease",      step: "Step 04", icon: FileText,      title: "Create a lease",                desc: "Generate a compliant lease with escalation, deposit and CPA clauses built in.",           cta: "Create a lease" },
  { key: "inspection", step: "Step 05", icon: ClipboardCheck, title: "Schedule a move-in inspection", desc: "Photo-backed inspections that protect your deposit claims later.",                         cta: "Schedule it" },
  { key: "supplier",   step: "Step 06", icon: HardHat,       title: "Add a supplier",                desc: "Plumbers, electricians and contractors you assign to maintenance jobs.",                  cta: "Add a supplier" },
]

function StepCard({ s, done, onClick }: Readonly<{ s: Step; done: boolean; onClick: () => void }>) {
  const Icon = s.icon
  return (
    <button
      type="button"
      onClick={done ? undefined : onClick}
      disabled={done}
      className={cn(
        "group flex flex-col gap-2.5 rounded-[var(--r-button)] border border-border border-b-2 p-4 text-left transition-all",
        done
          ? "cursor-default border-b-emerald-500 bg-muted/40"
          : "cursor-pointer border-b-primary bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn(
          "grid h-9 w-9 place-items-center rounded-[var(--r-button)]",
          done ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary",
        )}>
          {done ? <Check className="h-[18px] w-[18px]" strokeWidth={2.4} /> : <Icon className="h-[18px] w-[18px]" />}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">{done ? "Done" : s.step}</span>
      </div>
      <span className="font-heading text-sm font-semibold text-foreground">{s.title}</span>
      <span className="flex-1 text-xs leading-snug text-muted-foreground">{s.desc}</span>
      <span className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", done ? "text-emerald-600" : "text-primary")}>
        {done ? "Completed" : s.cta}
        {!done && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
      </span>
    </button>
  )
}

export function GettingStarted({ progress }: Readonly<{ progress: GettingStartedProgress }>) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)
  const [finishing, startFinish] = useTransition()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStart, setWizardStart] = useState<StepKey | undefined>(undefined)

  const doneCount = STEPS.filter((s) => progress[s.key]).length
  const pct = Math.round((doneCount / STEPS.length) * 100)
  const firstTodo = STEPS.find((s) => !progress[s.key])
  const allDone = doneCount === STEPS.length

  // Finish / skip → stamp onboarding dismissed → the server re-renders the populated dashboard.
  function finish() {
    startFinish(async () => { await dismissOnboarding(); router.refresh() })
  }

  // Every entry point opens the unified guided wizard at the chosen step.
  function openWizard(key?: StepKey) {
    setWizardStart(key)
    setWizardOpen(true)
  }

  return (
    <>
      {!dismissed && (
        <div className="mb-5 flex items-center gap-5 rounded-[var(--r-button)] border border-border border-b-2 border-b-primary bg-card p-7">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-border bg-muted/40 text-primary">
            <Shield className="h-7 w-7" strokeWidth={1.6} />
          </span>
          <div className="flex-1">
            <p className="font-heading text-xl font-semibold text-foreground">Welcome to Pleks — let&apos;s get you set up.</p>
            <p className="mt-1 max-w-[54ch] text-sm leading-relaxed text-muted-foreground">
              A few short steps to a live portfolio. Start by adding the landlord who owns the property — you&apos;ll link their property next. Do the rest in any order.
            </p>
          </div>
          {firstTodo && (
            <button
              type="button"
              onClick={() => openWizard(firstTodo.key)}
              className="group inline-flex shrink-0 items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2.5 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
              Get started
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-[var(--r-button)] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-[11px] text-muted-foreground">Getting started</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full border border-border bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{doneCount} of {STEPS.length} done</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((s) => (
          <StepCard key={s.key} s={s} done={progress[s.key]} onClick={() => openWizard(s.key)} />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={finish}
          disabled={finishing}
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          {finishing ? "Taking you there…" : "Skip for now — go to my dashboard"}
        </button>
        {allDone && (
          <button
            type="button"
            onClick={finish}
            disabled={finishing}
            className="group inline-flex items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2.5 pl-2.5 pr-4 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
          >
            <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
            Finish setup
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <OnboardingWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        progress={progress}
        startKey={wizardStart}
      />
    </>
  )
}
