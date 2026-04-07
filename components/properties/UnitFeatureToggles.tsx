"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { UNIT_FEATURES } from "@/lib/constants"
import { getAutoClausesForFeatures } from "@/lib/leases/featureClauseMap"
import { updateUnitFeatures } from "@/lib/actions/units"

const CLAUSE_LABELS: Record<string, string> = {
  security: "alarm / security system",
  common_property: "pool & garden maintenance",
  wheelchairs: "wheelchair accessibility",
  aircon: "air-conditioning maintenance",
  pets: "pet policy",
  utilities_alternative: "alternative utilities",
  parking: "parking",
  telecommunications: "telecommunications",
}

interface UnitFeatureTogglesProps {
  readonly unitId: string
  readonly propertyId: string
  readonly features: string[]
}

export function UnitFeatureToggles({ unitId, propertyId, features: initialFeatures }: UnitFeatureTogglesProps) {
  const [features, setFeatures] = useState<string[]>(initialFeatures)
  const [isPending, startTransition] = useTransition()

  function toggleFeature(feature: string) {
    const prev = features
    const next = features.includes(feature)
      ? features.filter((f) => f !== feature)
      : [...features, feature]

    setFeatures(next)
    startTransition(async () => {
      const result = await updateUnitFeatures(unitId, propertyId, next)
      if (result.error) {
        setFeatures(prev)
        toast.error(result.error)
      }
    })
  }

  const activeClauses = getAutoClausesForFeatures(features)

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Features</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {UNIT_FEATURES.map((feature) => {
          const active = features.includes(feature)
          return (
            <button
              key={feature}
              type="button"
              onClick={() => toggleFeature(feature)}
              disabled={isPending}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                active
                  ? "bg-brand/15 text-brand border-brand/30"
                  : "bg-muted/50 text-muted-foreground border-border/60 hover:border-border"
              )}
            >
              {feature}
            </button>
          )
        })}
      </div>

      {activeClauses.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Auto-enables: {activeClauses.map((k) => CLAUSE_LABELS[k] ?? k).join(", ")}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No features set — toggle features to auto-enable lease clauses.
        </p>
      )}

      <Link
        href={`/properties/${propertyId}/units/${unitId}`}
        className="mt-1.5 text-xs text-brand hover:underline block"
      >
        Manage clause profile →
      </Link>
    </div>
  )
}
