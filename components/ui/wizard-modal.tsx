"use client"

/**
 * components/ui/wizard-modal.tsx — the universal wide left-rail "door" wizard modal
 *
 * Notes:  The one stepped modal used everywhere (party adds + property wizard). Wide fixed-footprint
 *         card with a vertical step-rail on the left (done/current/todo states + click-to-jump on
 *         completed steps), a scrollable content pane on the right, a pinned Cancel/Back + primary
 *         footer, the amber doorsill, and a square close knob. Ported from the property-extras.css
 *         mockup onto dashboard theme tokens so a colour tweak is a token change, not a per-rule edit.
 *         Built on Base UI Dialog (focus trap, Esc, aria) and scoped to the .pleks-portal light theme
 *         exactly like ui/modal-card. Generic over its steps; the body + success view are slotted by
 *         the caller, so the same shell serves the suppliers/landlords/tenants pages and /properties/new.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X, Check } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WizardModalStep {
  id:     string
  label:  string
  /** small uppercase hint shown under the label on the current step (e.g. "In progress"). */
  hint?:  string
}

interface WizardModalProps {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  /** mono uppercase kicker at the top of the rail (e.g. "ADD PROPERTY"). */
  eyebrow:       string
  steps:         ReadonlyArray<WizardModalStep>
  current:       number
  /** completed-step click-to-jump — only steps with index < current are interactive. */
  onStepSelect?: (index: number) => void
  title:         string
  subtitle?:     string
  backLabel:     string
  onBack:        () => void
  primaryLabel:  string
  onPrimary:     () => void
  primaryDisabled?: boolean
  /** error shown above the footer (e.g. a failed save). */
  footerError?:  string | null
  /** extra control rendered to the left of the footer (e.g. an "Advanced setup" link). */
  footerSlot?:   React.ReactNode
  className?:    string
  children:      React.ReactNode
  /** when set, replaces the rail/body/footer with a centred success view. */
  success?:      React.ReactNode
}

function RailStep({
  step, index, current, isLast, onSelect,
}: Readonly<{
  step: WizardModalStep; index: number; current: number; isLast: boolean
  onSelect?: (index: number) => void
}>) {
  const done      = index < current
  const active    = index === current
  const clickable = done && !!onSelect
  return (
    <button
      type="button"
      disabled={!clickable}
      aria-current={active ? "step" : undefined}
      onClick={clickable ? () => onSelect?.(index) : undefined}
      className={cn(
        "relative flex w-full shrink-0 items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors",
        active && "bg-primary/10",
        clickable ? "cursor-pointer hover:bg-card" : "cursor-default",
      )}
    >
      {/* connector line to the next step (vertical rail only) */}
      {!isLast && (
        <span
          aria-hidden
          className={cn(
            "absolute left-[21px] top-8 hidden h-[calc(100%-1.25rem)] w-px md:block",
            done ? "bg-foreground" : "bg-border",
          )}
        />
      )}
      <span
        className={cn(
          "relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[10px]",
          active && "border-primary bg-primary text-primary-foreground",
          done   && "border-foreground bg-foreground text-background",
          !active && !done && "border-input bg-muted/40 text-muted-foreground",
        )}
      >
        {done ? <Check className="h-3 w-3" strokeWidth={2.4} /> : index + 1}
      </span>
      <span className="flex min-w-0 flex-col pt-0.5">
        <span className={cn("text-[13px] font-medium leading-tight", active || done ? "text-foreground" : "text-muted-foreground")}>
          {step.label}
        </span>
        {active && step.hint && (
          <span className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">{step.hint}</span>
        )}
      </span>
    </button>
  )
}

export function WizardModal({
  open, onOpenChange, eyebrow, steps, current, onStepSelect,
  title, subtitle, backLabel, onBack, primaryLabel, onPrimary, primaryDisabled,
  footerError, footerSlot, className, children, success,
}: Readonly<WizardModalProps>) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* display:contents scopes CSS vars to the light theme (same pattern as ui/modal-card) */}
        <div className="pleks-portal" style={{ display: "contents" }}>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            className={cn(
              "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[920px] -translate-x-1/2 -translate-y-1/2 flex-col",
              "h-[min(726px,calc(100vh-3rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              className,
            )}
          >
            {/* square close knob (replaces the door knob) */}
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-4 top-4 z-20 grid h-[30px] w-[30px] place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {/* a11y title — visually replaced by the per-step head below */}
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

            {success ? (
              <div className="flex flex-1 items-center justify-center overflow-y-auto p-8">{success}</div>
            ) : (
              <>
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                  {/* ── left rail ─────────────────────────────────────────── */}
                  <nav
                    aria-label="Steps"
                    className="shrink-0 border-b border-border bg-muted/30 px-4 py-4 md:w-60 md:border-b-0 md:border-r md:px-5 md:py-6"
                  >
                    <div className="mb-5 flex items-center gap-2">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</span>
                    </div>
                    <div className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
                      {steps.map((s, i) => (
                        <RailStep
                          key={s.id}
                          step={s}
                          index={i}
                          current={current}
                          isLast={i === steps.length - 1}
                          onSelect={onStepSelect}
                        />
                      ))}
                    </div>
                  </nav>

                  {/* ── content pane ──────────────────────────────────────── */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="shrink-0 px-6 pt-6 md:px-8">
                      <h2 className="font-heading text-xl font-semibold leading-tight text-foreground">{title}</h2>
                      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
                    </div>
                    <div className="flex-1 overflow-y-auto px-6 pb-4 pt-4 md:px-8">{children}</div>
                  </div>
                </div>

                {/* ── footer ────────────────────────────────────────────── */}
                <div className="shrink-0 border-t border-border bg-card">
                  {footerError && (
                    <div className="mx-6 mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive md:mx-8">
                      {footerError}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 px-6 py-4 md:px-8">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={onBack}
                        className="rounded-[var(--r-button)] px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {backLabel}
                      </button>
                      {footerSlot}
                    </div>
                    <button
                      type="button"
                      onClick={onPrimary}
                      disabled={primaryDisabled}
                      className="rounded-[var(--r-button)] bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {primaryLabel}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* amber doorsill */}
            <div aria-hidden className="h-1.5 w-full shrink-0 bg-primary" />
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
