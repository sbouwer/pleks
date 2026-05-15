/**
 * components/popia/NukeCarveoutDisclosure.tsx — Full-erasure carve-out disclosure (D-POPIA-05)
 *
 * Auth:   N/A — pure presentational; carve-out data passed by parent
 * Notes:  Subject must tick each carve-out before submitting a nuke request.
 *         D-POPIA-05: explicit per-carve-out acknowledgement prevents later misrepresentation.
 *         acknowledged_carveouts is written to data_subject_requests.request_scope.
 */
"use client"

import { useState } from "react"
import { CheckSquare, Square, Trash2, Lock, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AcknowledgedCarveout } from "@/lib/popia/erasure"

export interface WillDelete {
  label: string
}

export interface WillAnonymise {
  label: string
  reason: string
}

export interface NukeCarveoutDisclosureProps {
  agencyName: string
  will_delete: WillDelete[]
  will_anonymise: WillAnonymise[]
  carveouts: AcknowledgedCarveout[]
  onConfirmed: (acknowledged_carveouts: AcknowledgedCarveout[]) => void
  onCancel: () => void
}

export function NukeCarveoutDisclosure({
  agencyName,
  will_delete,
  will_anonymise,
  carveouts,
  onConfirmed,
  onCancel,
}: Readonly<NukeCarveoutDisclosureProps>) {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set())

  const toggle = (category: string) =>
    setAcknowledged((prev) => {
      const next = new Set(prev)
      if (next.has(category)) { next.delete(category) } else { next.add(category) }
      return next
    })

  const allTicked = carveouts.every((c) => acknowledged.has(c.category))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-base">
          You&apos;ve asked to delete everything {agencyName} holds about you through Pleks
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Here is what that means.
        </p>
      </div>

      {will_delete.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">We&apos;ll delete:</p>
          <ul className="space-y-1">
            {will_delete.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Trash2 className="size-3.5 shrink-0 mt-0.5 text-green-600" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {will_anonymise.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            We can anonymise (name and ID replaced with &ldquo;Former tenant&rdquo;) but keep the record:
          </p>
          <ul className="space-y-1">
            {will_anonymise.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Minus className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <span className="font-medium">{item.label}</span>
                  {item.reason && (
                    <span className="text-muted-foreground"> — {item.reason}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {carveouts.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-destructive">We cannot delete:</p>
          <div className="space-y-2">
            {carveouts.map((carveout) => (
              <button
                key={carveout.category}
                type="button"
                onClick={() => toggle(carveout.category)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-md border text-left transition-colors",
                  acknowledged.has(carveout.category)
                    ? "border-border bg-muted/40"
                    : "border-destructive/30 bg-destructive/5",
                )}
              >
                <Lock className="size-4 shrink-0 mt-0.5 text-destructive" />
                <div className="flex-1 text-sm">
                  <p className="font-medium capitalize">{carveout.category.replace(/_/g, " ")}</p>
                  <p className="text-muted-foreground">{carveout.reason}</p>
                  {carveout.retained_until && (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Eligible for deletion from{" "}
                      {new Date(carveout.retained_until).toLocaleDateString("en-ZA")}
                    </p>
                  )}
                </div>
                {acknowledged.has(carveout.category) ? (
                  <CheckSquare className="size-4 shrink-0 text-foreground" />
                ) : (
                  <Square className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
          {carveouts.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Tick each item to confirm you understand what will not be deleted.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={!allTicked && carveouts.length > 0}
          onClick={() => onConfirmed(carveouts.filter((c) => acknowledged.has(c.category)))}
          className="flex-1"
        >
          Submit erasure request
        </Button>
      </div>
    </div>
  )
}
