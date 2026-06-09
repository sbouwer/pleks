"use client"

/**
 * components/ui/WarningListModal.tsx — modal listing the items behind a WarningBell
 *
 * Notes:  Pairs with WarningBell on pages that have no matching filter to jump to (inspections overdue,
 *         maintenance overdue, dashboard dispatches). Each row links to the item and closes the modal.
 */
import Link from "next/link"
import { Modal } from "@/components/ui/actions"

export interface WarningItem {
  id: string
  title: string
  sub?: string
  href: string
}

export function WarningListModal({
  open, onClose, title, items,
}: Readonly<{ open: boolean; onClose: () => void; title: string; items: WarningItem[] }>) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
        ) : (
          items.map((it) => (
            <Link
              key={it.id}
              href={it.href}
              onClick={onClose}
              className="flex flex-col rounded-[var(--r-button)] border border-border px-3 py-2 transition-colors hover:bg-muted/40"
            >
              <span className="text-sm font-medium text-foreground">{it.title}</span>
              {it.sub && <span className="text-xs text-muted-foreground">{it.sub}</span>}
            </Link>
          ))
        )}
      </div>
    </Modal>
  )
}
