"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
          <Link
            href={`/leases/new?property=${propertyId}`}
            className="text-sm text-brand hover:underline"
          >
            Create lease for this property →
          </Link>
        </div>
        <div>
          <Link
            href={`/inspections/new?property=${propertyId}`}
            className="text-sm text-brand hover:underline"
          >
            Schedule inspection →
          </Link>
        </div>
        {maintenanceCount > 0 && (
          <div>
            <Link
              href={`/maintenance?property=${propertyId}`}
              className="text-sm text-brand hover:underline"
            >
              View maintenance ({maintenanceCount} active) →
            </Link>
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowArchiveConfirm(false)}
                    disabled={isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleArchive}
                    disabled={isPending}
                    className="bg-danger text-white hover:bg-danger/90"
                  >
                    {isPending ? "Archiving..." : "Archive property"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
