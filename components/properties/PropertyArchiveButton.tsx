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
import { useRouter } from "next/navigation"
import { Archive } from "lucide-react"
import { toast } from "sonner"
import { DeleteButton } from "@/components/ui/actions"
import { archiveProperty } from "@/lib/actions/properties"

export function PropertyArchiveButton({ propertyId, unitCount }: Readonly<{ propertyId: string; unitCount: number }>) {
  const router = useRouter()
  const units = `${unitCount} unit${unitCount === 1 ? "" : "s"}`

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
