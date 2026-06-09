"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsBell.tsx — dashboard alerts bell (header)
 *
 * Notes:  Consolidates the dashboard's "needs attention now" alerts behind one header WarningBell: surrendered
 *         mandatory comms awaiting manual dispatch, plus the deposit-management-restricted prompt (moved off
 *         the old top banner). Clicking opens a modal with each alert; renders nothing when there are none.
 */
import { useState } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { WarningBell } from "@/components/ui/WarningBell"
import { Modal } from "@/components/ui/actions"
import { SurrenderedCommsWidget, type SurrenderedCommRow } from "./SurrenderedCommsWidget"

export function SurrenderedCommsBell({
  items, showDepositSetup,
}: Readonly<{ items: SurrenderedCommRow[]; showDepositSetup: boolean }>) {
  const [open, setOpen] = useState(false)
  const count = items.length + (showDepositSetup ? 1 : 0)
  if (count === 0) return null

  return (
    <>
      <WarningBell count={count} label={`${count} item${count === 1 ? "" : "s"} need attention`} onClick={() => setOpen(true)} />
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Needs your attention">
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {showDepositSetup && (
              <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-amber-500/40 bg-amber-500/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground">Deposit management restricted</p>
                  <p className="text-xs text-muted-foreground">Add your trust account to unlock deposit &amp; trust management.</p>
                </div>
                <Link
                  href="/settings/compliance"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-[var(--r-button)] bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-primary"
                >
                  Set up →
                </Link>
              </div>
            )}
            {items.length > 0 && (
              <div>
                {showDepositSetup && (
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Manual dispatch ({items.length})</p>
                )}
                <SurrenderedCommsWidget items={items} />
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
