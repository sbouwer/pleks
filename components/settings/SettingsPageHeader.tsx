/**
 * components/settings/SettingsPageHeader.tsx — the generic header for every settings page
 *
 * Auth:   presentational only
 * Data:   none — caller passes the copy
 * Notes:  One consistent header across the whole settings surface (the overview + every sub-page),
 *         replacing the ad-hoc per-page <h1>s (profile used text-xl, security text-2xl, etc.). Mirrors
 *         ResourcePageHeader's grammar — mono eyebrow, font-heading title, optional sub + a top-right
 *         action over the iconic dashed rule — but tuned for settings (no resource "add"/required
 *         headline template). Pairs with SettingsSidebar. Part of the settings-shell consolidation.
 */
import type { ReactNode } from "react"

export function SettingsPageHeader({
  eyebrow, title, sub, action,
}: Readonly<{
  eyebrow?: string
  title:    ReactNode
  sub?:     ReactNode
  /** top-right primary action (e.g. "Invite member", "New template") — same spot on every page */
  action?:  ReactNode
}>) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      )}
      <div className="mt-1 flex items-end justify-between gap-4 border-b border-dashed border-border pb-4">
        <div className="min-w-0">
          <h1 className="font-heading text-3xl font-bold leading-tight text-foreground">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
