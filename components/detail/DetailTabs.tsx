"use client"

/**
 * components/detail/DetailTabs.tsx — opt-in tab strip under the detail header (ADDENDUM_DETAIL_PAGE_TEMPLATE §7 OQ3)
 *
 * Notes:  OFF by default — simple entities render a single-scroll grid. Dense entities (property; maybe
 *         lease) opt in: the page owns the active-tab state and renders the matching body blocks. Never a
 *         global default. Door-grammar amber underline on the active tab.
 */
import { cn } from "@/lib/utils"
import type { DetailTab } from "@/lib/detail/types"

export function DetailTabs({
  tabs, current, onChange,
}: Readonly<{ tabs: DetailTab[]; current: string; onChange: (id: string) => void }>) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border" role="tablist">
      {tabs.map((t) => {
        const active = t.id === current
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative rounded-[var(--r-button)] px-3 py-1.5 text-sm transition-colors",
              active ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cn("ml-1.5 font-mono text-[10px]", active ? "text-brand" : "text-muted-foreground")}>{t.count}</span>
            )}
            {active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        )
      })}
    </div>
  )
}
