"use client"

/**
 * components/properties/QuickActionsCard.tsx — Quick action links and archive control for a property detail page
 *
 * Auth:   gateway (dashboard layout)
 * Data:   archiveProperty server action; navigation links use router.push for client-side redirect post-archive
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton, InlineLink } from "@/components/ui/actions"
import { archiveProperty } from "@/lib/actions/properties"

interface QuickActionsCardProps {
  propertyId: string
  tier: string
  maintenanceCount: number
}

export function QuickActionsCard({ propertyId, tier, maintenanceCount }: QuickActionsCardProps) {
  const router = useRouter()
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()

  const cardClass = "rounded-xl border border-border/60 bg-surface-elevated px-5 py-4"
  const headerClass = "text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3"

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveProperty(propertyId)
      if (result.error) {
        toast.error(result.error)
        setShowArchiveConfirm(false)
      } else {
        router.push("/properties")
      }
    })
  }

  return (
    <div className={cardClass}>
      <p className={headerClass}>Quick actions</p>
      <div className="space-y-2">
        <div>
          <InlineLink href={`/leases/new?property=${propertyId}`}>
            Create lease for this property
          </InlineLink>
        </div>
        <div>
          <InlineLink href={`/inspections/new?property=${propertyId}`}>
            Schedule inspection
          </InlineLink>
        </div>
        {maintenanceCount > 0 && (
          <div>
            <InlineLink href={`/maintenance?property=${propertyId}`}>
              View maintenance ({maintenanceCount} active)
            </InlineLink>
          </div>
        )}

        {tier !== "owner" && (
          <>
            <hr className="border-border/60 my-2" />
            {!showArchiveConfirm ? (
              <button
                type="button"
                onClick={() => setShowArchiveConfirm(true)}
                className="text-sm text-danger hover:underline text-left"
              >
                Archive property
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Are you sure? This will archive the property and all its units. Active leases must be terminated first.
                </p>
                <div className="flex gap-2">
                  <ActionButton
                    tone="secondary"
                    onClick={() => setShowArchiveConfirm(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </ActionButton>
                  <ActionButton
                    tone="destructive"
                    onClick={handleArchive}
                    disabled={isPending}
                  >
                    {isPending ? "Archiving..." : "Archive property"}
                  </ActionButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
