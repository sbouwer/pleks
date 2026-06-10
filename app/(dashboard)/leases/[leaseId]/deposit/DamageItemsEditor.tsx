"use client"

/**
 * app/(dashboard)/leases/[leaseId]/deposit/DamageItemsEditor.tsx — confirm + justify tenant-damage deductions
 *
 * Auth:   confirm/edit via the deposit server actions (requireAgentWriteAccess + finance gate)
 * Data:   deposit_deduction_items (tenant_damage) passed from the deposit page
 * Notes:  A tenant-damage line only counts against the refund once confirmed, and can only be confirmed with a
 *         substantive reason (RHA s5 / Tribunal — ADDENDUM_FINANCIAL_INTEGRITY F-2). The reason is editable until
 *         confirmed; confirming locks it (immutable schedule). AI drafts the reason in where available (Steward+).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import { ActionButton } from "@/components/ui/actions"
import { confirmDeductionItem, updateDeductionJustification } from "@/lib/actions/deposits"
import { isValidJustification } from "@/lib/deposits/justification"

export interface DamageItem {
  id: string
  room: string | null
  item_description: string
  deduction_amount_cents: number
  ai_justification: string | null
  agent_confirmed: boolean
}

export function DamageItemsEditor({ leaseId, items }: Readonly<{ leaseId: string; items: DamageItem[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 pr-2">Room</th>
            <th className="text-left py-2 pr-2">Description</th>
            <th className="text-right py-2 px-2">Amount</th>
            <th className="text-left py-2 px-2">Justification (reason required)</th>
            <th className="text-center py-2">Confirm</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => <DamageRow key={item.id} leaseId={leaseId} item={item} />)}
        </tbody>
      </table>
    </div>
  )
}

function DamageRow({ leaseId, item }: Readonly<{ leaseId: string; item: DamageItem }>) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(item.ai_justification ?? "")
  const valid = isValidJustification(text)
  const dirty = text.trim() !== (item.ai_justification ?? "").trim()

  function saveJustification() {
    if (!dirty) return
    startTransition(async () => {
      const r = await updateDeductionJustification(item.id, leaseId, text)
      if (r.error) toast.error(r.error)
      else router.refresh()
    })
  }

  function confirm() {
    startTransition(async () => {
      if (dirty) {
        const s = await updateDeductionJustification(item.id, leaseId, text)
        if (s.error) { toast.error(s.error); return }
      }
      const r = await confirmDeductionItem(item.id, leaseId)
      if (r.error) { toast.error(r.error); return }
      toast.success("Deduction confirmed")
      router.refresh()
    })
  }

  return (
    <tr className="border-b border-border/50 align-top">
      <td className="py-2 pr-2">{item.room ?? "—"}</td>
      <td className="py-2 pr-2">{item.item_description}</td>
      <td className="text-right py-2 px-2 font-semibold">{formatZAR(item.deduction_amount_cents)}</td>
      <td className="py-2 px-2 max-w-xs">
        {item.agent_confirmed ? (
          <span className="text-xs text-muted-foreground line-clamp-3">{item.ai_justification}</span>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveJustification}
            disabled={pending}
            placeholder="Why is this a deductible tenant-damage cost? (required)"
            className="w-full min-h-[3rem] rounded-[var(--r-button)] border border-border bg-background p-1.5 text-xs"
          />
        )}
      </td>
      <td className="text-center py-2">
        {item.agent_confirmed ? (
          <span className="text-success">✓</span>
        ) : (
          <ActionButton size="sm" tone="primary" onClick={confirm} disabled={pending || !valid}>
            {pending ? "…" : "Confirm"}
          </ActionButton>
        )}
      </td>
    </tr>
  )
}
