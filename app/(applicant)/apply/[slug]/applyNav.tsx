"use client"

/**
 * app/(applicant)/apply/[slug]/applyNav.tsx — the apply wizard's nav chrome
 *
 * Notes:  The two-level navigation model (step groups + panes) and its presentational chrome (StepRail · StepBar ·
 *         SubTabs) + computeStepStates. Pure presentation/derivation owned by the orchestrator's shell; no flow
 *         logic. Parameterised by a NavModel so the SAME chrome drives the personal flow AND the (copied-and-
 *         reworked) company flow — the orchestrator picks the model by applicant/company type. Each pane carries a
 *         `key` so the orchestrator's render/next dispatch is key-driven, not index-bound.
 */

export type PaneMeta = ReadonlyArray<{ group: string; sub: string; key: string }>
export interface NavModel { stepGroups: readonly string[]; paneMeta: PaneMeta; groupPanes: Record<string, number[]>; stepDesc: Record<string, string> }

/** Build a NavModel — derives the group→pane-indices map from the pane list. "Apply as" is the landing (no pane). */
export function buildNav(stepGroups: readonly string[], paneMeta: PaneMeta, stepDesc: Record<string, string>): NavModel {
  const groupPanes: Record<string, number[]> = {}
  paneMeta.forEach((m, i) => {
    groupPanes[m.group] ??= []
    groupPanes[m.group].push(i)
  })
  return { stepGroups, paneMeta, groupPanes, stepDesc }
}

// ── PERSONAL flow (individual / couple / guarantor) ──────────────────────────────────────────────
const PERSONAL_PANES: PaneMeta = [
  { group: "Personal details",   sub: "Personal information", key: "personal" },   // step 0
  { group: "Personal details",   sub: "Address",             key: "address" },     // step 1
  { group: "Finances",           sub: "Employment",          key: "employment" },  // step 2
  { group: "Finances",           sub: "Income",              key: "income" },      // step 3
  { group: "Finances",           sub: "Expenses",            key: "expenses" },    // step 4
  { group: "Documents",          sub: "Required",            key: "docs-req" },    // step 5
  { group: "Documents",          sub: "Optional",            key: "docs-opt" },    // step 6
  { group: "Application review", sub: "Check & submit",      key: "review" },      // step 7
]
const PERSONAL_DESC: Record<string, string> = {
  "Personal details": "Your identity & contact",
  Finances: "Income & affordability",
  Documents: "ID, proof of address, payslips",
  "Application review": "Check & submit",
}
export const PERSONAL_NAV = buildNav(["Apply as", "Personal details", "Finances", "Documents", "Application review"], PERSONAL_PANES, PERSONAL_DESC)

function tabClass(done: boolean, cur: boolean): string {
  // NB: don't use `.stoep` here — it sets padding-bottom:4px which overrides the button's pb-2.5 and drops the
  // active label below the others. The active underline is drawn as an absolute element instead (consistent pad).
  if (cur) return "font-medium text-[var(--ink)]"
  if (done) return "text-[var(--ink)]"
  return "text-[var(--ink-mute)]"
}
function circleClass(done: boolean, cur: boolean): string {
  if (done) return "bg-[var(--ink)] text-[var(--paper)]"
  if (cur) return "border-[1.5px] border-[var(--amber)] text-[var(--amber-ink)]"
  return "border-[1.5px] border-[var(--rule-strong)] text-[var(--ink-mute)]"
}

const ACTIVE_UNDERLINE = "linear-gradient(to right, currentColor 0 55%, var(--amber) 55% 80%, currentColor 80% 100%)"

export interface StepState { group: string; n: number; cur: boolean; done: boolean; reachable: boolean; desc: string | null; target: number | "apply-as" }

/** Per-step nav state over the linear `step` machine — shared by the desktop rail + the mobile bar. */
export function computeStepStates(model: NavModel, opts: Readonly<{ activeGroup: string; step: number; maxReached: number; inWizard: boolean; typePicked: boolean; hasApplication: boolean; applyAsDesc: string | null }>): StepState[] {
  const { activeGroup, step, maxReached, inWizard, typePicked, hasApplication, applyAsDesc } = opts
  const currentLinear = inWizard ? step : -1
  return model.stepGroups.map((g, gi) => {
    const applyAs = g === "Apply as"
    const panes = model.groupPanes[g] ?? []
    const first = applyAs ? -1 : Math.min(...panes)
    const last = applyAs ? -1 : Math.max(...panes)
    const cur = g === activeGroup
    const done = applyAs ? (typePicked && !cur) : (currentLinear > last)
    const reachable = applyAs ? !hasApplication : (inWizard && first <= maxReached)
    return { group: g, n: gi + 1, cur, done, reachable, desc: applyAs ? applyAsDesc : (model.stepDesc[g] ?? null), target: applyAs ? "apply-as" : first }
  })
}

/** Desktop vertical step rail — the "listing space, transformed into navigation". The ACTIVE step auto-expands
 *  its sub-tabs as indented nav items (others stay collapsed). */
export function StepRail({ model, states, step, maxReached, onNav, onJumpStep }: Readonly<{
  model: NavModel; states: StepState[]; step: number; maxReached: number; onNav: (t: number | "apply-as") => void; onJumpStep: (s: number) => void
}>) {
  return (
    <nav className="flex flex-col gap-1">
      {states.map((s) => {
        const subPanes = model.groupPanes[s.group] ?? []
        const expanded = s.cur && subPanes.length > 1
        return (
          <div key={s.group}>
            <button type="button" disabled={s.cur || !s.reachable} onClick={() => onNav(s.target)}
              className={`flex w-full items-start gap-3 rounded-[var(--r-button)] border-l-2 px-3 py-2.5 text-left transition-colors ${s.cur ? "border-[var(--amber)] bg-[var(--paper-sunk)]" : "border-transparent"} ${s.reachable && !s.cur ? "cursor-pointer hover:bg-[var(--paper-sunk)]/60" : "cursor-default"} ${!s.reachable && !s.cur && !s.done ? "opacity-50" : ""}`}>
              <span className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] ${circleClass(s.done, s.cur)}`}>{s.done ? "✓" : s.n}</span>
              <span className="min-w-0">
                <span className={`block text-sm leading-tight ${s.cur || s.done ? "font-medium text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>{s.group}</span>
                {s.desc && <span className="mt-0.5 block text-[11px] leading-tight text-[var(--ink-mute)]">{s.desc}</span>}
              </span>
            </button>
            {expanded && (
              <div className="ml-[26px] mt-0.5 flex flex-col gap-0.5 border-l border-[var(--rule)] pl-3">
                {subPanes.map((p) => {
                  const pcur = p === step
                  const preachable = p <= maxReached
                  return (
                    <button key={p} type="button" disabled={pcur || !preachable} onClick={() => onJumpStep(p)}
                      className={`rounded-[var(--r-button)] px-2 py-1 text-left text-[12px] transition-colors ${pcur ? "font-medium text-[var(--ink)]" : "text-[var(--ink-mute)]"} ${preachable && !pcur ? "cursor-pointer hover:text-[var(--ink)]" : "cursor-default"}`}>
                      {model.paneMeta[p].sub}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

/** Mobile horizontal step bar (used below the lg breakpoint). */
export function StepBar({ states, onNav }: Readonly<{ states: StepState[]; onNav: (t: number | "apply-as") => void }>) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--rule)]">
      {states.map((s) => (
        <button key={s.group} type="button" disabled={s.cur || !s.reachable} onClick={() => onNav(s.target)}
          className={`relative flex items-center gap-2 pb-2.5 text-[13px] ${tabClass(s.done, s.cur)} ${s.reachable && !s.cur ? "cursor-pointer" : "cursor-default"} ${!s.reachable && !s.cur && !s.done ? "opacity-60" : ""}`}>
          <span className={`flex size-[18px] items-center justify-center rounded-full text-[10px] ${circleClass(s.done, s.cur)}`}>{s.done ? "✓" : s.n}</span>
          {s.group}
          {s.cur && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5" style={{ background: ACTIVE_UNDERLINE }} />}
        </button>
      ))}
    </div>
  )
}

/** Sub-tab pills for the active step (top of the form panel). Null when the step has ≤1 pane. */
export function SubTabs({ model, activeGroup, step, maxReached, onJumpStep }: Readonly<{ model: NavModel; activeGroup: string; step: number; maxReached: number; onJumpStep: (s: number) => void }>) {
  const subPanes = model.groupPanes[activeGroup] ?? []
  if (subPanes.length <= 1) return null
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--rule)]">
      {subPanes.map((s) => {
        const cur = s === step
        const reachable = s <= maxReached
        return (
          <button key={s} type="button" disabled={cur || !reachable} onClick={() => onJumpStep(s)}
            className={`relative pb-1.5 text-[12px] ${cur ? "font-medium text-[var(--ink)]" : "text-[var(--ink-mute)]"} ${reachable && !cur ? "cursor-pointer hover:text-[var(--ink)]" : "cursor-default"}`}>
            {model.paneMeta[s].sub}
            {cur && <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-[var(--amber)]" />}
          </button>
        )
      })}
    </div>
  )
}
