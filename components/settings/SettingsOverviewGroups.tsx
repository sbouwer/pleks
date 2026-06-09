"use client"

/**
 * components/settings/SettingsOverviewGroups.tsx — the smart Overview groups
 *
 * Auth:   client — resolved data is passed from the server page (lib/settings/overview)
 * Notes:  Three groups in the mockup's layout (section header + count → card grid) using our cards:
 *         1) Set up — incomplete items; individually dismissible (cross-device, settings_ui_state); the
 *            whole group disappears once empty or all-dismissed.
 *         2) Needs action — flagged items; becomes the first group once Set up is done.
 *         3) Frequently used — the most-visited pages as quick-access cards (cross-device).
 *         Icons arrive as string names from the resolver (server→client safe) and map here.
 */
import { useState } from "react"
import Link from "next/link"
import {
  Settings, Zap, Users, CreditCard, ShieldCheck, Landmark, FileText, Bell, KeyRound,
  Building2, UserCheck, X, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { OverviewItem, SettingsOverviewData } from "@/lib/settings/overview"
import { dismissSetupCard } from "@/lib/settings/uiState"
import { FrequentlyUsed } from "./FrequentlyUsed"

const ICONS: Record<string, LucideIcon> = {
  property: Building2, landlord: UserCheck, branding: Zap, team: Users, billing: CreditCard,
  compliance: ShieldCheck, trust: Landmark, documents: FileText, notifications: Bell, security: KeyRound,
}

const PILL: Record<string, string> = {
  setup: "border-primary/30 bg-primary/10 text-primary",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
}

function OverviewCard({ item, kind, onDismiss }: Readonly<{ item: OverviewItem; kind: "setup" | "action"; onDismiss?: (id: string) => void }>) {
  const Icon = ICONS[item.icon] ?? Settings
  const pillKind = kind === "setup" ? "setup" : (item.tone ?? "warn")
  const actionLabel = item.tone === "danger" ? "Action" : "Review"
  const pillLabel = kind === "setup" ? "Set up" : actionLabel
  // Stretched-link card: the Link covers the whole card; the dismiss button sits above it (z-10) so it's
  // independently clickable without nesting a <button> inside the <a>.
  return (
    <div className="group relative flex flex-col gap-3 rounded-[var(--r-button)] border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
      <Link href={item.href} aria-label={item.title} className="absolute inset-0 z-0 rounded-[var(--r-button)]" />
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-[var(--r-button)] border border-border bg-muted/40 text-muted-foreground">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="flex items-center gap-1.5">
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", PILL[pillKind])}>
            {pillLabel}
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={`Dismiss ${item.title}`}
              title="Dismiss"
              className="relative z-10 grid h-6 w-6 place-items-center rounded-[var(--r-button)] text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-heading text-[13.5px] font-semibold text-foreground">{item.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
      </div>
    </div>
  )
}

function SectionHeader({ label, count }: Readonly<{ label: string; count?: number }>) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span aria-hidden className="h-0.5 w-4 bg-primary" />
      <span className="font-heading text-sm font-semibold text-foreground">{label}</span>
      {count != null && <span className="text-xs font-medium text-muted-foreground">{count}</span>}
    </div>
  )
}

export function SettingsOverviewGroups({
  setup, action, dismissedSetup, frequent,
}: Readonly<SettingsOverviewData & { dismissedSetup: string[]; frequent: string[] }>) {
  // Dismissed setup ids — seeded from the server (cross-device), updated optimistically on dismiss.
  const [dismissed, setDismissed] = useState<string[]>(dismissedSetup)

  function handleDismiss(id: string) {
    setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]))
    dismissSetupCard(id).catch(() => { /* best-effort; the optimistic hide stands */ })
  }

  const visibleSetup = setup.filter((it) => !dismissed.includes(it.id))

  return (
    <div className="mt-6 space-y-6">
      {visibleSetup.length > 0 && (
        <section>
          <SectionHeader label="Set up" count={visibleSetup.length} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSetup.map((it) => <OverviewCard key={it.id} item={it} kind="setup" onDismiss={handleDismiss} />)}
          </div>
        </section>
      )}

      {action.length > 0 && (
        <section>
          <SectionHeader label="Needs action" count={action.length} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {action.map((it) => <OverviewCard key={it.id} item={it} kind="action" />)}
          </div>
        </section>
      )}

      <section>
        <SectionHeader label="Frequently used" />
        <FrequentlyUsed hrefs={frequent} />
      </section>
    </div>
  )
}
