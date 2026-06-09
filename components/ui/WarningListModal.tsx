"use client"

/**
 * components/ui/WarningListModal.tsx — modal listing the items behind a WarningBell
 *
 * Notes:  Pairs with WarningBell on pages that have no matching filter to jump to (inspections overdue,
 *         maintenance overdue, dashboard dispatches). Each row links to the item and closes the modal.
 */
import { Modal, InlineLink } from "@/components/ui/actions"

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
            <div
              key={it.id}
              className="flex items-center justify-between gap-3 rounded-[var(--r-button)] border border-border px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{it.title}</p>
                {it.sub && <p className="truncate text-xs text-muted-foreground">{it.sub}</p>}
              </div>
              <InlineLink href={it.href} withArrow onClick={onClose} className="shrink-0 text-[12px] font-medium">Review</InlineLink>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
