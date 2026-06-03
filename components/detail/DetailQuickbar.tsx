"use client"

/**
 * components/detail/DetailQuickbar.tsx — the detail header's single action surface (responsive)
 *
 * Notes:  ADDENDUM_DETAIL_PAGE_TEMPLATE §3. Icon segment that grows labels ≥1440px, stays icon-only at
 *         medium, and collapses to one ⋯ dropdown < 768px — plus a primary CTA on the right. This is the
 *         ONLY action surface on a detail page (no QuickActionsCard body block — that's a regression).
 *         Icons referenced by name so server pages can declare actions without crossing the client boundary.
 */
import { useState, useRef, useEffect, createElement } from "react"
import Link from "next/link"
import {
  Pencil, Receipt, Wrench, ClipboardCheck, MessageSquare, Gift, Archive, FileText, User, Plus, Mail,
  Phone, MessageCircle, MoreHorizontal, Circle, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { DetailAction } from "@/lib/detail/types"

const ICONS: Record<string, LucideIcon> = {
  edit: Pencil, statement: Receipt, maintenance: Wrench, inspection: ClipboardCheck,
  message: MessageSquare, welcome: Gift, archive: Archive, lease: FileText, user: User,
  add: Plus, email: Mail, phone: Phone, whatsapp: MessageCircle,
}
const iconFor = (name: string): LucideIcon => ICONS[name] ?? Circle

function ActionButton({ action }: Readonly<{ action: DetailAction }>) {
  const cls = cn(
    "flex h-9 items-center justify-center gap-2 border-l border-border px-0 text-sm font-medium transition-colors first:border-l-0",
    "w-9 min-[1440px]:w-auto min-[1440px]:px-3",
    action.danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : "text-muted-foreground hover:bg-primary/10 hover:text-brand",
  )
  const inner = (
    <>
      {createElement(iconFor(action.icon), { className: "h-4 w-4 flex-shrink-0" })}
      <span className="hidden min-[1440px]:inline">{action.short ?? action.label}</span>
    </>
  )
  return action.href
    ? <Link href={action.href} title={action.label} aria-label={action.label} className={cls}>{inner}</Link>
    : <button type="button" title={action.label} aria-label={action.label} className={cls}>{inner}</button>
}

function OverflowMenu({ actions }: Readonly<{ actions: DetailAction[] }>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onClick)
    document.addEventListener("keydown", onEsc)
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onEsc) }
  }, [open])

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button" aria-label="Actions" aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-[var(--r-button)] border border-border text-muted-foreground transition-colors hover:bg-primary/10 hover:text-brand"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-52 overflow-hidden rounded-[var(--r-button)] border border-border bg-popover p-1 shadow-lg">
          {actions.map((a) => {
            const cls = cn(
              "flex w-full items-center gap-2.5 rounded-[var(--r-button)] px-3 py-2 text-left text-sm font-medium transition-colors",
              a.danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-muted",
            )
            const inner = <>{createElement(iconFor(a.icon), { className: "h-4 w-4 text-muted-foreground" })}{a.label}</>
            return a.href
              ? <Link key={a.key} href={a.href} role="menuitem" onClick={() => setOpen(false)} className={cls}>{inner}</Link>
              : <button key={a.key} type="button" role="menuitem" onClick={() => setOpen(false)} className={cls}>{inner}</button>
          })}
        </div>
      )}
    </div>
  )
}

export function DetailQuickbar({
  actions, primary,
}: Readonly<{ actions: DetailAction[]; primary?: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-2">
      {actions.length > 0 && (
        <>
          {/* ≥768: icon segment (labels grow ≥1440). <768: collapses to the ⋯ menu below. */}
          <div className="hidden overflow-hidden rounded-[var(--r-button)] border border-border bg-card md:inline-flex">
            {actions.map((a) => <ActionButton key={a.key} action={a} />)}
          </div>
          <OverflowMenu actions={actions} />
        </>
      )}
      {primary && <div className="flex-shrink-0">{primary}</div>}
    </div>
  )
}
