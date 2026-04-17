"use client"

import { useState, useTransition } from "react"
import { Check, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { SCENARIOS, type ScenarioType, type ScenarioSegment } from "@/lib/properties/scenarios"
import { reclassifyProperty } from "@/lib/actions/reclassifyProperty"

interface PropertyRow {
  id:             string
  name:           string
  type:           string | null
  address_line1:  string | null
  suburb:         string | null
  city:           string | null
}

interface Props {
  properties: PropertyRow[]
}

// Rule-based suggestion (spec §19.1). Conservative — errs on residential for
// unclassified rows. Haiku fallback is a post-launch addition.
function suggestScenario(row: PropertyRow): ScenarioType {
  const t = (row.type ?? "").toLowerCase()
  if (t.includes("commercial")) return "c1"
  if (t.includes("industrial")) return "c3"
  if (t.includes("mixed"))      return "m1"
  return "r2"   // default: rental house — most common
}

const SEGMENT_LABEL: Record<ScenarioSegment, string> = {
  residential:           "Residential",
  commercial_industrial: "Commercial / Industrial",
  mixed:                 "Mixed use",
}

function scenarioOptionLabel(code: ScenarioType): string {
  if (code === "other") return "Other / advanced"
  const meta = SCENARIOS[code]
  return `${SEGMENT_LABEL[meta.segment]} — ${meta.label}`
}

// ── Single row ───────────────────────────────────────────────────────────────

function PropertyClassifyRow({
  row,
  onClassified,
  onSkip,
}: {
  row:         PropertyRow
  onClassified: (id: string) => void
  onSkip:       (id: string) => void
}) {
  const [target, setTarget]       = useState<ScenarioType>(suggestScenario(row))
  const [pending, startTransition] = useTransition()
  const [error, setError]          = useState<string | null>(null)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const result = await reclassifyProperty(row.id, target)
      if (result.ok) onClassified(row.id)
      else setError(result.error ?? "Failed")
    })
  }

  const address = [row.address_line1, row.suburb, row.city].filter(Boolean).join(", ")

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="space-y-3">
          <div>
            <p className="font-medium text-sm">{row.name}</p>
            {address && <p className="text-xs text-muted-foreground">{address}</p>}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Looks like:</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as ScenarioType)}
              className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              aria-label={`Scenario for ${row.name}`}
            >
              {[...Object.keys(SCENARIOS) as ScenarioType[], "other" as ScenarioType].map((code) => (
                <option key={code} value={code}>{scenarioOptionLabel(code)}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button size="sm" onClick={confirm} disabled={pending} className={cn("gap-1", pending && "opacity-50")}>
              <Check className="w-3.5 h-3.5" />
              {pending ? "Saving…" : "Confirm"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onSkip(row.id)} disabled={pending} className="gap-1">
              <SkipForward className="w-3.5 h-3.5" />
              Skip
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────

export function ClassifyList({ properties }: Props) {
  const [done, setDone]     = useState<Set<string>>(new Set())
  const [skipped, setSkipped] = useState<Set<string>>(new Set())

  const remaining = properties.filter((p) => !done.has(p.id) && !skipped.has(p.id))

  function handleClassified(id: string) {
    setDone((prev) => new Set(prev).add(id))
  }

  function handleSkip(id: string) {
    setSkipped((prev) => new Set(prev).add(id))
  }

  if (remaining.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center space-y-2">
          <p className="text-sm font-medium">All done</p>
          <p className="text-xs text-muted-foreground">
            {done.size} classified{skipped.size > 0 ? `, ${skipped.size} skipped` : ""}.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {done.size} classified, {remaining.length} remaining{skipped.size > 0 ? `, ${skipped.size} skipped` : ""}
      </p>
      {remaining.map((row) => (
        <PropertyClassifyRow
          key={row.id}
          row={row}
          onClassified={handleClassified}
          onSkip={handleSkip}
        />
      ))}
    </div>
  )
}
