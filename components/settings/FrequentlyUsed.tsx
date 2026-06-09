/**
 * components/settings/FrequentlyUsed.tsx — Overview "Frequently used" cards
 *
 * Notes:  Presentational. Receives the most-visited page hrefs (resolved server-side from
 *         settings_ui_state — cross-device) and renders them as quick-access cards in the shared card
 *         grammar. Empty → the hint placeholder.
 */
import Link from "next/link"
import { SETTINGS_CATALOG, type SettingsPage } from "@/lib/settings/catalog"

export function FrequentlyUsed({ hrefs }: Readonly<{ hrefs: string[] }>) {
  const pages = hrefs
    .map((h) => SETTINGS_CATALOG.find((p) => p.href === h))
    .filter((p): p is SettingsPage => !!p)

  if (pages.length === 0) {
    return (
      <div className="rounded-[var(--r-button)] border border-dashed border-border bg-muted/20 px-5 py-8 text-center">
        <p className="text-sm font-medium text-foreground">Your most-visited settings will appear here</p>
        <p className="mt-1 text-xs text-muted-foreground">
          As you use Settings, the pages you open most will show up for quick access.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {pages.map((page) => {
        const Icon = page.icon
        return (
          <Link
            key={page.href}
            href={page.href}
            className="group flex flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-muted-foreground">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-[13.5px] font-semibold text-foreground">{page.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{page.desc}</p>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
