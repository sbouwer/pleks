"use client"

/**
 * components/properties/PropertyArchiveButton.tsx — archive a property from its detail header
 *
 * Auth:   client island; archiveProperty goes through the agent write gate (admin-only)
 * Data:   archiveProperty server action (guard + cascade to buildings/units)
 * Notes:  Confirm dialog names the cascade (N units). An in-force lease anywhere under the property
 *         blocks it — the DeleteButton dialog morphs to an acknowledge view with the reason. On success
 *         the property leaves the active list, so we route back to /properties.
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Archive, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { ActionButton, DeleteButton } from "@/components/ui/actions"
import { archiveProperty, reactivateProperty } from "@/lib/actions/properties"

export function PropertyArchiveButton({ propertyId, unitCount, isArchived }: Readonly<{ propertyId: string; unitCount: number; isArchived?: boolean }>) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const units = `${unitCount} unit${unitCount === 1 ? "" : "s"}`

  if (isArchived) {
    return (
      <ActionButton
        tone="primary"
        icon={<RotateCcw className="size-3.5" />}
        disabled={busy}
        onClick={() => startTransition(async () => {
          const res = await reactivateProperty(propertyId)
          if (res?.error) { toast.error(res.error); return }
          toast.success("Property restored")
          router.refresh()
        })}
      >
        {busy ? "Restoring…" : "Restore property"}
      </ActionButton>
    )
  }

  return (
    <DeleteButton
      mode="label"
      icon={Archive}
      label="Archive property"
      confirmLabel="Archive"
      title="Archive this property?"
      description={`It's retired from your active portfolio but kept and restorable. This also archives its ${units} and buildings — Restore brings them all back together.`}
      onConfirm={async () => {
        const res = await archiveProperty(propertyId)
        if (res?.error) return { blocked: res.error }
        toast.success("Property archived")
        router.push("/properties")
      }}
    />
  )
}
