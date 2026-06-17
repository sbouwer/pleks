"use client"

/**
 * app/(dashboard)/settings/branding/BrandingViewToggle.tsx — Setup / Document preview switch (header action)
 *
 * Notes:  TEMPORARY placement — sits in the Organisation header's actions slot (where buttons/icons go) and
 *         flips ?view=setup|preview. BrandingForm reads the same param to render the control cards vs the
 *         document preview. Segmented control matching the add-party EntityToggle grammar.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

const VIEWS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "preview", label: "Document preview" },
]

export function BrandingViewToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const view = params.get("view") === "preview" ? "preview" : "setup"

  function set(v: string) {
    const next = new URLSearchParams(params)
    next.set("view", v)
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }

  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-1" role="tablist" aria-label="Branding view">
      {VIEWS.map((v) => {
        const on = view === v.id
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => set(v.id)}
            className={cn(
              "rounded-[var(--r-button)] px-3 py-1.5 text-sm font-medium transition-colors",
              on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </button>
        )
      })}
    </div>
  )
}
