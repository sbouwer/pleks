"use client"

/**
 * components/properties/ArchivedPropertyList.tsx — archived (soft-deleted) properties with a Reactivate action
 *
 * Auth:   client island; reactivateProperty goes through the agent write gate (admin-only)
 * Data:   PropertyListItem[] (soft-deleted) passed from PropertyListView when status=Archived
 * Notes:  Archive keeps records for retention; reactivate clears deleted_at and the property returns to
 *         the active portfolio. Hard erasure is a separate path (not here).
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { ListCard } from "@/components/ui/resource-list"
import { reactivateProperty } from "@/lib/actions/properties"
import type { PropertyListItem } from "./PropertyList"

export function ArchivedPropertyList({ properties }: Readonly<{ properties: PropertyListItem[] }>) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function reactivate(id: string) {
    setBusyId(id)
    startTransition(async () => {
      const res = await reactivateProperty(id)
      setBusyId(null)
      if (res.error) { toast.error(res.error); return }
      toast.success("Property reactivated")
      router.refresh()
    })
  }

  if (properties.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No archived properties.</p>
  }

  return (
    <ListCard fill>
      <div className="divide-y divide-border/50">
        {properties.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.address_line1}, {p.city}</p>
            </div>
            <button
              type="button"
              onClick={() => reactivate(p.id)}
              disabled={busyId === p.id}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r-button)] border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" /> {busyId === p.id ? "Reactivating…" : "Reactivate"}
            </button>
          </div>
        ))}
      </div>
    </ListCard>
  )
}
