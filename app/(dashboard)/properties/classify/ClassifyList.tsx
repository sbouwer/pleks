"use client"

/**
 * app/(dashboard)/properties/classify/ClassifyList.tsx — Bulk-classify unclassified properties by scenario type
 *
 * Route:  /properties/classify
 * Auth:   gateway (admin/agent)
 * Data:   properties list passed from page server component; reclassifyProperty server action
 */
import { useState, useTransition } from "react"
import { Check, SkipForward } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
            <Select value={target} onValueChange={(v) => setTarget(v as ScenarioType)}>
              <SelectTrigger size="sm" aria-label={`Scenario for ${row.name}`} className="text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...Object.keys(SCENARIOS) as ScenarioType[], "other" as ScenarioType].map((code) => (
                  <SelectItem key={code} value={code}>{scenarioOptionLabel(code)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <ActionButton tone="primary" icon={<Check className="w-3.5 h-3.5" />} onClick={confirm} disabled={pending}>
              {pending ? "Saving…" : "Confirm"}
            </ActionButton>
            <ActionButton tone="secondary" icon={<SkipForward className="w-3.5 h-3.5" />} onClick={() => onSkip(row.id)} disabled={pending}>
              Skip
            </ActionButton>
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
