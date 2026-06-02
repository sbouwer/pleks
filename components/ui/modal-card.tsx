"use client"

/**
 * components/ui/modal-card.tsx — Shared, theme-agnostic modal card (ADDENDUM_68A D-68A-02)
 *
 * Notes:  The onboarding "door" card aesthetic (rounded card + amber baseline doorsill + corner
 *         knob) extracted as a reusable primitive driven by semantic dashboard tokens — NOT scoped
 *         to .pleks-public, so it renders correctly anywhere (the feedback modal lives in the
 *         dashboard theme). Built on the Base UI Dialog primitives (focus trap, Esc, aria) with the
 *         same .pleks-portal light-theme scoping as components/ui/dialog. Optional back-arrow for
 *         internal step routing; eyebrow + title for the header.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePortalTheme } from "@/components/layout/PortalThemeProvider"

interface ModalCardProps {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  /** Mono uppercase kicker above the title (e.g. "HELP & FEEDBACK"). */
  eyebrow?:      string
  title:         string
  /** When set, a back-arrow renders top-left (internal step navigation). */
  onBack?:       () => void
  className?:    string
  children:      React.ReactNode
}

export function ModalCard({ open, onOpenChange, eyebrow, title, onBack, className, children }: Readonly<ModalCardProps>) {
  const { theme } = usePortalTheme()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* display:contents keeps the element in the cascade for inherited CSS vars; data-theme
            mirrors the dashboard theme so the slim door follows light/dark (same as ui/wizard-modal). */}
        <div className="pleks-portal" style={{ display: "contents" }} data-theme={theme}>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              className,
            )}
          >
            <div className="relative overflow-hidden border border-border bg-card shadow-2xl">
              {/* corner knob — the onboarding "door" cue */}
              <span aria-hidden className="pointer-events-none absolute right-5 top-5 h-1.5 w-1.5 rounded-full bg-primary" />

              <div className="px-6 pt-5 pb-6">
                {/* header row: optional back (left) + close (right) */}
                <div className="mb-2 flex items-center justify-between">
                  {onBack ? (
                    <button
                      type="button"
                      onClick={onBack}
                      aria-label="Back"
                      className="-ml-1.5 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  ) : <span />}
                  <DialogPrimitive.Close
                    aria-label="Close"
                    className="-mr-1.5 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <X className="h-4 w-4" />
                  </DialogPrimitive.Close>
                </div>

                {eyebrow && (
                  <p className="mb-1.5 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    <span className="h-px w-5 bg-primary" aria-hidden />
                    {eyebrow}
                  </p>
                )}
                <DialogPrimitive.Title className="font-heading text-xl font-semibold leading-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>

                <div className="mt-4">{children}</div>
              </div>

              {/* amber doorsill — the onboarding baseline cue */}
              <div aria-hidden className="h-1.5 w-full bg-primary" />
            </div>
          </DialogPrimitive.Popup>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
